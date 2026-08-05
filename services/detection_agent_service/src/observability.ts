import { appendFileSync, chmodSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodeStoragePayload, encodeStoragePayload, type StorageProtector } from "./storage-crypto.js";

export interface ObservabilityEvent {
  timestamp: string;
  type: string;
  analysisId?: string;
  stageId?: string;
  state?: string;
  durationMs?: number;
  code?: string;
  scope?: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface ObservabilitySnapshot {
  counters: Record<string, number>;
  recentEvents: ObservabilityEvent[];
  timings: Record<string, { count: number; p50Ms: number; p95Ms: number; maxMs: number }>;
}

export interface Observability {
  record(event: ObservabilityEvent): void;
  snapshot(): ObservabilitySnapshot;
}

const MAX_EVENT_BYTES = 8 * 1024;
const MAX_TIMING_SAMPLES = 2_000;

function timingKey(event: ObservabilityEvent): string {
  if (event.type === "stage.transition" && event.stageId) return `stage:${event.stageId}`;
  if (event.type.startsWith("detector.") && event.details?.detectorId) return `detector:${String(event.details.detectorId)}`;
  if (event.type === "route.request" && event.details?.path) return `route:${String(event.details.path)}`;
  return event.type;
}

function addTiming(target: Map<string, number[]>, event: ObservabilityEvent): void {
  if (typeof event.durationMs !== "number" || !Number.isFinite(event.durationMs)) return;
  const key = timingKey(event);
  const values = target.get(key) || [];
  values.push(Math.max(0, Math.round(event.durationMs)));
  if (values.length > MAX_TIMING_SAMPLES) values.splice(0, values.length - MAX_TIMING_SAMPLES);
  target.set(key, values);
}

function summarizeTimings(values: Map<string, number[]>): ObservabilitySnapshot["timings"] {
  const result: ObservabilitySnapshot["timings"] = {};
  for (const [key, raw] of values) {
    if (raw.length === 0) continue;
    const sorted = [...raw].sort((left, right) => left - right);
    const quantile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
    result[key] = { count: sorted.length, p50Ms: quantile(0.5), p95Ms: quantile(0.95), maxMs: sorted.at(-1)! };
  }
  return result;
}

function boundedEvent(event: ObservabilityEvent): ObservabilityEvent {
  const details = event.details
    ? Object.fromEntries(Object.entries(event.details).slice(0, 32).map(([key, value]) => [key.slice(0, 80), value]))
    : undefined;
  return {
    timestamp: event.timestamp,
    type: event.type.slice(0, 100),
    ...(event.analysisId ? { analysisId: event.analysisId.slice(0, 100) } : {}),
    ...(event.stageId ? { stageId: event.stageId.slice(0, 100) } : {}),
    ...(event.state ? { state: event.state.slice(0, 80) } : {}),
    ...(typeof event.durationMs === "number" ? { durationMs: Math.max(0, Math.round(event.durationMs)) } : {}),
    ...(event.code ? { code: event.code.slice(0, 120) } : {}),
    ...(event.scope ? { scope: event.scope.slice(0, 80) } : {}),
    ...(details && Object.keys(details).length ? { details } : {}),
  };
}

export class FileObservability implements Observability {
  private readonly path: string;
  private readonly counters = new Map<string, number>();
  private readonly recent: ObservabilityEvent[] = [];
  private readonly timingSamples = new Map<string, number[]>();

  constructor(dataDir: string, private readonly maxRecentEvents = 200, private readonly protector?: StorageProtector) {
    const root = resolve(dataDir);
    mkdirSync(root, { recursive: true });
    this.path = join(root, "events.jsonl");
    try { chmodSync(this.path, 0o600); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.loadRecent();
  }

  record(event: ObservabilityEvent): void {
    const value = boundedEvent(event);
    const key = value.code ? `${value.type}.${value.code}` : value.type;
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
    addTiming(this.timingSamples, value);
    this.recent.push(value);
    while (this.recent.length > this.maxRecentEvents) this.recent.shift();
    const line = JSON.stringify(value);
    const encoded = encodeStoragePayload(Buffer.from(line, "utf8"), this.protector, "observability-event");
    const record = this.protector ? encoded : Buffer.concat([encoded, Buffer.from("\n", "utf8")]);
    if (record.byteLength <= MAX_EVENT_BYTES) appendFileSync(this.path, record, { mode: 0o600 });
  }

  snapshot(): ObservabilitySnapshot {
    return { counters: Object.fromEntries(this.counters), recentEvents: this.recent.map((event) => structuredClone(event)), timings: summarizeTimings(this.timingSamples) };
  }

  private loadRecent(): void {
    try {
      const lines = readFileSync(this.path).toString("utf8").split("\n").filter(Boolean).slice(-this.maxRecentEvents);
      for (const line of lines) {
        try {
          const event = JSON.parse(decodeStoragePayload(Buffer.from(line, "utf8"), this.protector, "observability-event").toString("utf8")) as ObservabilityEvent;
          if (!event || typeof event.type !== "string" || typeof event.timestamp !== "string") continue;
          this.recent.push(event);
          const key = event.code ? `${event.type}.${event.code}` : event.type;
          this.counters.set(key, (this.counters.get(key) || 0) + 1);
          addTiming(this.timingSamples, event);
        } catch {
          if (this.protector) throw new Error("STORAGE_DECRYPTION_FAILED");
          // Ignore one corrupted plaintext audit line; later records remain usable.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export class NoopObservability implements Observability {
  record(_event: ObservabilityEvent): void {}
  snapshot(): ObservabilitySnapshot { return { counters: {}, recentEvents: [], timings: {} }; }
}
