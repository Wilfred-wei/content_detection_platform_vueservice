export interface ModelResourceProfile {
  modelId: string;
  device: string;
  resourceClass: "cpu" | "gpu" | "unknown";
  memoryReservationMb: number | null;
  slots: number;
  maxQueue: number;
  microbatchSize: number;
  maxBatchDelayMs: number;
  /** Logical residency contract. The worker still owns the actual process/model lifecycle. */
  residency?: "resident" | "ephemeral";
}

export interface DeviceResourceCapacity {
  device: string;
  memoryMb: number | null;
  slots: number;
}

export interface ModelResourceStats {
  modelId: string;
  device: string;
  queued: number;
  active: number;
  reservedMemoryMb: number;
  microbatchSize: number;
  maxBatchDelayMs: number;
  residency: "resident" | "ephemeral";
}

export interface DeviceResourceStats {
  device: string;
  active: number;
  reservedMemoryMb: number;
  memoryMb: number | null;
  slots: number | null;
  availableMemoryMb: number | null;
  availableSlots: number | null;
}

interface PendingJob<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  task: () => Promise<T>;
  enqueuedAt: number;
}

interface PendingBatchJob {
  item: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  task: () => Promise<unknown>;
  enqueuedAt: number;
}

interface BatchWindow {
  jobs: PendingBatchJob[];
  runner?: (items: readonly unknown[], tasks: readonly (() => Promise<unknown>)[]) => Promise<readonly unknown[]>;
  timer?: NodeJS.Timeout;
}

interface RuntimeState {
  profile: ModelResourceProfile;
  queued: PendingJob<unknown>[];
  batchWindow?: BatchWindow;
  active: number;
  reservedMemoryMb: number;
}

interface DeviceState {
  capacity?: DeviceResourceCapacity;
  active: number;
  reservedMemoryMb: number;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`INVALID_MODEL_RESOURCE:${field}`);
  return value;
}

function nonNegativeIntegerOrNull(value: number | null, field: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`INVALID_MODEL_RESOURCE:${field}`);
  return value;
}

export function parseModelResourceProfile(value: unknown): ModelResourceProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_MODEL_RESOURCE:profile");
  const raw = value as Record<string, unknown>;
  if (typeof raw.modelId !== "string" || !raw.modelId.trim()) throw new Error("INVALID_MODEL_RESOURCE:modelId");
  if (typeof raw.device !== "string" || !raw.device.trim()) throw new Error("INVALID_MODEL_RESOURCE:device");
  if (!["cpu", "gpu", "unknown"].includes(raw.resourceClass as string)) throw new Error("INVALID_MODEL_RESOURCE:resourceClass");
  return {
    modelId: raw.modelId.trim(),
    device: raw.device.trim(),
    resourceClass: raw.resourceClass as ModelResourceProfile["resourceClass"],
    memoryReservationMb: nonNegativeIntegerOrNull(raw.memoryReservationMb as number | null, "memoryReservationMb"),
    slots: positiveInteger(raw.slots as number, "slots"),
    maxQueue: positiveInteger(raw.maxQueue as number, "maxQueue"),
    microbatchSize: positiveInteger(raw.microbatchSize as number, "microbatchSize"),
    maxBatchDelayMs: nonNegativeIntegerOrNull(raw.maxBatchDelayMs as number | null, "maxBatchDelayMs") || 0,
    residency: raw.residency === "ephemeral" ? "ephemeral" : "resident",
  };
}

export class ModelResourceScheduler {
  private readonly capacities = new Map<string, DeviceResourceCapacity>();
  private readonly devices = new Map<string, DeviceState>();
  private readonly runtimes = new Map<string, RuntimeState>();
  private closed = false;

  constructor(capacities: readonly DeviceResourceCapacity[] = []) {
    for (const capacity of capacities) {
      if (!capacity.device || this.capacities.has(capacity.device)) throw new Error(`INVALID_MODEL_RESOURCE:duplicate_device:${capacity.device}`);
      if (capacity.memoryMb !== null && (!Number.isInteger(capacity.memoryMb) || capacity.memoryMb < 1)) throw new Error(`INVALID_MODEL_RESOURCE:memoryMb:${capacity.device}`);
      positiveInteger(capacity.slots, `device_slots:${capacity.device}`);
      this.capacities.set(capacity.device, capacity);
      this.devices.set(capacity.device, { capacity, active: 0, reservedMemoryMb: 0 });
    }
  }

  register(profileInput: ModelResourceProfile): void {
    const profile = parseModelResourceProfile(profileInput);
    if (this.runtimes.has(profile.modelId)) throw new Error(`INVALID_MODEL_RESOURCE:duplicate_model:${profile.modelId}`);
    this.runtimes.set(profile.modelId, { profile, queued: [], active: 0, reservedMemoryMb: 0 });
    if (!this.devices.has(profile.device)) this.devices.set(profile.device, { active: 0, reservedMemoryMb: 0 });
  }

  run<T>(modelId: string, task: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("MODEL_RESOURCE_SCHEDULER_CLOSED"));
    const runtime = this.runtimes.get(modelId);
    if (!runtime) return task();
    if (this.queuedCount(runtime) + runtime.active >= runtime.profile.maxQueue) return Promise.reject(new Error(`MODEL_RESOURCE_QUEUE_FULL:${modelId}`));
    return new Promise<T>((resolve, reject) => {
      runtime.queued.push({ resolve: resolve as (value: unknown) => void, reject, task, enqueuedAt: Date.now() });
      this.pump(runtime);
    });
  }

  /**
   * Queue one item for bounded worker-level batching. Calls arriving within
   * maxBatchDelayMs share a single device reservation until microbatchSize is
   * reached. A missing batch runner is deliberately treated as a safe
   * per-item fallback, never as implicit batching.
   */
  runBatched<T, I>(
    modelId: string,
    item: I,
    task: () => Promise<T>,
    batchRunner?: (items: readonly I[], tasks: readonly (() => Promise<T>)[]) => Promise<readonly T[]>,
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error("MODEL_RESOURCE_SCHEDULER_CLOSED"));
    const runtime = this.runtimes.get(modelId);
    if (!runtime || runtime.profile.microbatchSize <= 1) return this.run(modelId, task);
    if (this.queuedCount(runtime) + runtime.active >= runtime.profile.maxQueue) {
      return Promise.reject(new Error(`MODEL_RESOURCE_QUEUE_FULL:${modelId}`));
    }
    return new Promise<T>((resolve, reject) => {
      const window = runtime.batchWindow || (runtime.batchWindow = { jobs: [] });
      if (batchRunner) {
        // A detector creates a fresh closure for each request. The model id is
        // the isolation boundary, so keep the first runner for this window and
        // do not compare function identity across those equivalent closures.
        window.runner ||= batchRunner as unknown as BatchWindow["runner"];
      }
      window.jobs.push({
        item,
        resolve: resolve as (value: unknown) => void,
        reject,
        task: task as () => Promise<unknown>,
        enqueuedAt: Date.now(),
      });
      if (window.jobs.length >= runtime.profile.microbatchSize || runtime.profile.maxBatchDelayMs === 0) {
        this.flushBatch(runtime);
      } else if (!window.timer) {
        window.timer = setTimeout(() => {
          window.timer = undefined;
          this.flushBatch(runtime);
        }, runtime.profile.maxBatchDelayMs);
      }
    });
  }

  /**
   * Submit bounded micro-batches for a worker that supports one batch call.
   * The scheduler reserves one model slot and one declared memory budget per batch.
   */
  async runBatch<T>(
    modelId: string,
    tasks: readonly (() => Promise<T>)[],
    batchRunner?: (tasks: readonly (() => Promise<T>)[]) => Promise<readonly T[]>,
  ): Promise<T[]> {
    if (tasks.length === 0) return [];
    const runtime = this.runtimes.get(modelId);
    const batchSize = runtime?.profile.microbatchSize || 1;
    const results: T[] = [];
    for (let offset = 0; offset < tasks.length; offset += batchSize) {
      const batch = tasks.slice(offset, offset + batchSize);
      const values = await this.run(modelId, async () => {
        const output = batchRunner ? await batchRunner(batch) : await Promise.all(batch.map((task) => task()));
        if (output.length !== batch.length) throw new Error(`MODEL_RESOURCE_BATCH_RESULT_MISMATCH:${modelId}`);
        return [...output];
      });
      results.push(...values);
    }
    return results;
  }

  close(): void {
    this.closed = true;
    for (const runtime of this.runtimes.values()) {
      const queued = runtime.queued.splice(0);
      queued.forEach((job) => job.reject(new Error("MODEL_RESOURCE_SCHEDULER_CLOSED")));
      const window = runtime.batchWindow;
      if (window?.timer) clearTimeout(window.timer);
      window?.jobs.splice(0).forEach((job) => job.reject(new Error("MODEL_RESOURCE_SCHEDULER_CLOSED")));
      if (window) window.runner = undefined;
    }
  }

  stats(): ModelResourceStats[] {
    return [...this.runtimes.values()].map((runtime) => ({
      modelId: runtime.profile.modelId,
      device: runtime.profile.device,
      queued: this.queuedCount(runtime),
      active: runtime.active,
      reservedMemoryMb: runtime.reservedMemoryMb,
      microbatchSize: runtime.profile.microbatchSize,
      maxBatchDelayMs: runtime.profile.maxBatchDelayMs,
      residency: runtime.profile.residency || "resident",
    }));
  }

  deviceStats(): DeviceResourceStats[] {
    return [...this.devices.entries()].map(([device, state]) => {
      const capacity = state.capacity;
      return {
        device,
        active: state.active,
        reservedMemoryMb: state.reservedMemoryMb,
        memoryMb: capacity?.memoryMb ?? null,
        slots: capacity?.slots ?? null,
        availableMemoryMb: capacity?.memoryMb === null || capacity === undefined
          ? null
          : Math.max(0, capacity.memoryMb - state.reservedMemoryMb),
        availableSlots: capacity ? Math.max(0, capacity.slots - state.active) : null,
      };
    });
  }

  private canReserve(runtime: RuntimeState): boolean {
    const device = this.device(runtime);
    const capacity = device.capacity;
    if (runtime.active >= runtime.profile.slots) return false;
    if (!capacity) return true;
    if (device.active >= capacity.slots) return false;
    if (capacity.memoryMb !== null) {
      // A known device budget cannot safely admit a model with unknown memory use.
      if (runtime.profile.memoryReservationMb === null) return false;
      if (device.reservedMemoryMb + runtime.profile.memoryReservationMb > capacity.memoryMb) return false;
    }
    return true;
  }

  private pump(runtime: RuntimeState): void {
    if (this.closed || !runtime.queued.length || !this.canReserve(runtime)) return;
    const job = runtime.queued.shift();
    if (!job) return;
    runtime.active += 1;
    runtime.reservedMemoryMb += runtime.profile.memoryReservationMb || 0;
    const device = this.device(runtime);
    device.active += 1;
    device.reservedMemoryMb += runtime.profile.memoryReservationMb || 0;
    void job.task().then(job.resolve, job.reject).finally(() => {
      runtime.active -= 1;
      runtime.reservedMemoryMb -= runtime.profile.memoryReservationMb || 0;
      device.active = Math.max(0, device.active - 1);
      device.reservedMemoryMb = Math.max(0, device.reservedMemoryMb - (runtime.profile.memoryReservationMb || 0));
      this.pumpDevice(runtime.profile.device);
    });
    this.pump(runtime);
  }

  private queuedCount(runtime: RuntimeState): number {
    return runtime.queued.length + (runtime.batchWindow?.jobs.length || 0);
  }

  private flushBatch(runtime: RuntimeState): void {
    if (this.closed) return;
    const window = runtime.batchWindow;
    if (!window?.jobs.length || !this.canReserve(runtime)) return;
    const size = Math.min(runtime.profile.microbatchSize, window.jobs.length);
    const jobs = window.jobs.splice(0, size);
    if (!window.jobs.length && window.timer) {
      clearTimeout(window.timer);
      window.timer = undefined;
    }
    runtime.active += 1;
    runtime.reservedMemoryMb += runtime.profile.memoryReservationMb || 0;
    const device = this.device(runtime);
    device.active += 1;
    device.reservedMemoryMb += runtime.profile.memoryReservationMb || 0;
    const items = jobs.map((job) => job.item);
    const tasks = jobs.map((job) => job.task);
    const runner = window.runner || (async (_items, batchTasks) => Promise.all(batchTasks.map((task) => task())));
    void runner(items, tasks).then((values) => {
      if (values.length !== jobs.length) throw new Error(`MODEL_RESOURCE_BATCH_RESULT_MISMATCH:${runtime.profile.modelId}`);
      values.forEach((value, index) => jobs[index].resolve(value));
    }, (error) => {
      const normalized = error instanceof Error ? error : new Error(String(error));
      jobs.forEach((job) => job.reject(normalized));
    }).finally(() => {
      runtime.active -= 1;
      runtime.reservedMemoryMb -= runtime.profile.memoryReservationMb || 0;
      device.active = Math.max(0, device.active - 1);
      device.reservedMemoryMb = Math.max(0, device.reservedMemoryMb - (runtime.profile.memoryReservationMb || 0));
      this.pumpDevice(runtime.profile.device);
      if (runtime.batchWindow?.jobs.length && !runtime.batchWindow.timer) {
        this.flushBatch(runtime);
      }
    });
  }

  private device(runtime: RuntimeState): DeviceState {
    const existing = this.devices.get(runtime.profile.device);
    if (existing) return existing;
    const created: DeviceState = { active: 0, reservedMemoryMb: 0 };
    this.devices.set(runtime.profile.device, created);
    return created;
  }

  private pumpDevice(deviceId: string): void {
    // A completion on one model can free a shared device slot for another model.
    for (const runtime of this.runtimes.values()) {
      if (runtime.profile.device === deviceId) {
        this.flushBatch(runtime);
        this.pump(runtime);
      }
    }
  }
}
