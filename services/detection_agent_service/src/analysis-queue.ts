import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface AnalysisQueueStats {
  queued: number;
  running: number;
  capacity: number;
  maxQueue: number;
  concurrency: number;
  oldestQueuedAt: string | null;
  recoveredLeases: number;
  expiredJobs: number;
}

export interface AnalysisScheduler {
  start(executor: (analysisId: string, leaseId: string) => Promise<void>, onExpired: (analysisId: string) => void): void;
  enqueue(analysisId: string, scope?: string): void;
  cancel(analysisId: string): boolean;
  isLeaseCurrent(analysisId: string, leaseId: string): boolean;
  stats(): AnalysisQueueStats;
  close(): void;
}

interface QueueJob {
  analysisId: string;
  enqueuedAt: string;
  attempts: number;
  scope: string;
  leaseId?: string;
  leasedAt?: string;
}

interface PersistedQueue {
  schemaVersion: "1.0.0";
  jobs: QueueJob[];
}

export interface PersistentAnalysisQueueOptions {
  maxQueue: number;
  concurrency: number;
  leaseMs: number;
  maxAgeMs: number;
  /** Positive per-scope weights; omitted scopes use weight 1. */
  scopeWeights?: Readonly<Record<string, number>>;
}

function isTerminalQueueJob(job: QueueJob): boolean {
  return Boolean(job.leaseId && job.leasedAt);
}

/**
 * A small JSON-backed at-least-once queue. It intentionally stores only ids;
 * analysis state and evidence remain authoritative in AnalysisStore.
 */
export class PersistentAnalysisQueue implements AnalysisScheduler {
  private readonly filePath: string;
  private readonly jobs = new Map<string, QueueJob>();
  private readonly running = new Map<string, QueueJob>();
  private executor?: (analysisId: string, leaseId: string) => Promise<void>;
  private onExpired?: (analysisId: string) => void;
  private timer?: NodeJS.Timeout;
  private closed = false;
  private recoveredLeases = 0;
  private expiredJobs = 0;
  private readonly scopeCredits = new Map<string, number>();

  constructor(dataDir: string, private readonly options: PersistentAnalysisQueueOptions) {
    this.filePath = join(resolve(dataDir), "queue.json");
    this.load();
  }

  start(executor: (analysisId: string, leaseId: string) => Promise<void>, onExpired: (analysisId: string) => void): void {
    this.executor = executor;
    this.onExpired = onExpired;
    this.recoverLeases();
    this.pump();
  }

  enqueue(analysisId: string, scope = "anonymous"): void {
    if (this.closed) throw new Error("ANALYSIS_QUEUE_CLOSED");
    if (this.jobs.has(analysisId) || this.running.has(analysisId)) return;
    if (this.jobs.size >= this.options.maxQueue) throw new Error("ANALYSIS_QUEUE_OVERLOADED");
    this.jobs.set(analysisId, {
      analysisId,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      scope,
    });
    this.persist();
    this.pump();
  }

  cancel(analysisId: string): boolean {
    const job = this.jobs.get(analysisId);
    const removed = this.jobs.delete(analysisId);
    if (job) this.pruneScopeCredit(job.scope);
    if (removed) this.persist();
    return removed;
  }

  isLeaseCurrent(analysisId: string, leaseId: string): boolean {
    const job = this.running.get(analysisId);
    return Boolean(job && job.leaseId === leaseId && job.leasedAt
      && Date.parse(job.leasedAt) + this.options.leaseMs > Date.now());
  }

  stats(): AnalysisQueueStats {
    const queued = [...this.jobs.values()].filter((job) => !job.leaseId);
    return {
      queued: queued.length,
      running: this.running.size,
      capacity: Math.max(0, this.options.maxQueue - this.jobs.size),
      maxQueue: this.options.maxQueue,
      concurrency: this.options.concurrency,
      oldestQueuedAt: queued.sort((left, right) => Date.parse(left.enqueuedAt) - Date.parse(right.enqueuedAt))[0]?.enqueuedAt || null,
      recoveredLeases: this.recoveredLeases,
      expiredJobs: this.expiredJobs,
    };
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.executor = undefined;
    this.onExpired = undefined;
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<PersistedQueue>;
      if (parsed.schemaVersion !== "1.0.0" || !Array.isArray(parsed.jobs)) throw new Error("invalid queue");
      for (const raw of parsed.jobs) {
        if (!raw || typeof raw.analysisId !== "string" || !raw.analysisId
          || typeof raw.enqueuedAt !== "string" || typeof raw.attempts !== "number") continue;
        this.jobs.set(raw.analysisId, {
          analysisId: raw.analysisId,
          enqueuedAt: raw.enqueuedAt,
          attempts: Math.max(0, Math.floor(raw.attempts)),
          scope: typeof raw.scope === "string" ? raw.scope : "anonymous",
          ...(typeof raw.leaseId === "string" ? { leaseId: raw.leaseId } : {}),
          ...(typeof raw.leasedAt === "string" ? { leasedAt: raw.leasedAt } : {}),
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private recoverLeases(): void {
    const now = Date.now();
    let changed = false;
    for (const job of this.jobs.values()) {
      if (!isTerminalQueueJob(job)) continue;
      const leasedAt = Date.parse(job.leasedAt || "");
      if (!Number.isFinite(leasedAt) || leasedAt + this.options.leaseMs <= now) {
        delete job.leaseId;
        delete job.leasedAt;
        job.attempts += 1;
        this.recoveredLeases += 1;
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private pump(): void {
    if (this.closed || !this.executor) return;
    while (this.running.size < this.options.concurrency) {
      const job = this.nextRunnableJob();
      if (!job) break;
      const leaseId = randomUUID();
      job.leaseId = leaseId;
      job.leasedAt = new Date().toISOString();
      this.running.set(job.analysisId, job);
      this.persist();
      void this.run(job, leaseId);
    }
    if (this.jobs.size > 0 && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.recoverLeases();
        this.pump();
      }, Math.min(this.options.leaseMs, 1_000));
      this.timer.unref?.();
    }
  }

  private nextRunnableJob(): QueueJob | undefined {
    const now = Date.now();
    const candidates = [...this.jobs.values()]
      .filter((job) => !job.leaseId)
      .sort((left, right) => Date.parse(left.enqueuedAt) - Date.parse(right.enqueuedAt));
    const scopes = [...new Set(candidates.map((job) => job.scope))];
    const preferredScope = this.selectWeightedScope(scopes);
    const ordered = preferredScope
      ? [...candidates.filter((job) => job.scope === preferredScope), ...candidates.filter((job) => job.scope !== preferredScope)]
      : candidates;
    let removedExpired = false;
    for (const job of ordered) {
      const enqueuedAt = Date.parse(job.enqueuedAt);
      if (Number.isFinite(enqueuedAt) && enqueuedAt + this.options.maxAgeMs <= now) {
        this.jobs.delete(job.analysisId);
        this.pruneScopeCredit(job.scope);
        this.expiredJobs += 1;
        this.onExpired?.(job.analysisId);
        removedExpired = true;
        continue;
      }
      return job;
    }
    if (removedExpired) this.persist();
    return undefined;
  }

  private selectWeightedScope(scopes: string[]): string | undefined {
    if (!scopes.length) return undefined;
    let totalWeight = 0;
    for (const scope of scopes) {
      const configured = this.options.scopeWeights?.[scope];
      const weight = typeof configured === "number" && Number.isFinite(configured) && configured > 0
        ? Math.min(100, configured)
        : 1;
      totalWeight += weight;
      this.scopeCredits.set(scope, (this.scopeCredits.get(scope) || 0) + weight);
    }
    const selected = scopes.reduce((best, scope) => {
      if (!best) return scope;
      return (this.scopeCredits.get(scope) || 0) > (this.scopeCredits.get(best) || 0) ? scope : best;
    }, "");
    if (!selected) return undefined;
    this.scopeCredits.set(selected, (this.scopeCredits.get(selected) || 0) - totalWeight);
    return selected;
  }

  private async run(job: QueueJob, leaseId: string): Promise<void> {
    try {
      await this.executor?.(job.analysisId, leaseId);
    } finally {
      const current = this.running.get(job.analysisId);
      if (current?.leaseId === leaseId) {
        this.running.delete(job.analysisId);
        this.jobs.delete(job.analysisId);
        this.pruneScopeCredit(job.scope);
        this.persist();
      }
      this.pump();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    const state: PersistedQueue = { schemaVersion: "1.0.0", jobs: [...this.jobs.values()] };
    writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(temporary, this.filePath);
  }

  private pruneScopeCredit(scope: string): void {
    const stillPresent = [...this.jobs.values(), ...this.running.values()].some((job) => job.scope === scope);
    if (!stillPresent) this.scopeCredits.delete(scope);
  }
}

export class InProcessAnalysisScheduler implements AnalysisScheduler {
  private executor?: (analysisId: string, leaseId: string) => Promise<void>;
  private queued = 0;

  start(executor: (analysisId: string, leaseId: string) => Promise<void>): void {
    this.executor = executor;
  }

  enqueue(analysisId: string): void {
    this.queued += 1;
    queueMicrotask(() => {
      this.queued = Math.max(0, this.queued - 1);
      void this.executor?.(analysisId, "in-process");
    });
  }

  cancel(_analysisId: string): boolean { return false; }
  isLeaseCurrent(_analysisId: string, leaseId: string): boolean { return leaseId === "in-process"; }
  stats(): AnalysisQueueStats {
    return { queued: this.queued, running: 0, capacity: Number.MAX_SAFE_INTEGER, maxQueue: Number.MAX_SAFE_INTEGER, concurrency: Number.MAX_SAFE_INTEGER, oldestQueuedAt: null, recoveredLeases: 0, expiredJobs: 0 };
  }
  close(): void { this.executor = undefined; }
}
