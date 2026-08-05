import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

import type { MirrorConfig } from "./config.js";
import type { MediaAsset } from "./analysis-types.js";
import {
  MODEL_DETECTOR_PROTOCOL_VERSION,
  type ModelDetectionResult,
  type ModelDetector,
  type ModelRuntimeInfo,
} from "./model-detector.js";

interface PendingRequest {
  resolve: (result: ModelDetectionResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function boundedText(value: Buffer | string, maximum = 4_000): string {
  const text = value.toString().trim();
  return text.length <= maximum ? text : text.slice(-maximum);
}

export function assertMirrorWorkerResult(value: unknown): ModelDetectionResult & { requestId: string } {
  if (!value || typeof value !== "object") throw new Error("MIRROR_MALFORMED_RESPONSE:not_an_object");
  const result = value as Record<string, unknown>;
  if (result.protocolVersion !== MODEL_DETECTOR_PROTOCOL_VERSION) throw new Error("MIRROR_MALFORMED_RESPONSE:protocol_version");
  if (typeof result.requestId !== "string" || !result.requestId) throw new Error("MIRROR_MALFORMED_RESPONSE:request_id");
  if (result.detectorId !== "mirror-dinov3-hplus") throw new Error("MIRROR_MALFORMED_RESPONSE:detector_id");
  if (!( ["detected", "not_detected", "unavailable", "unsupported_format", "error"] as unknown[]).includes(result.outcome)) {
    throw new Error("MIRROR_MALFORMED_RESPONSE:outcome");
  }
  if (result.score !== null && (typeof result.score !== "number" || !Number.isFinite(result.score) || result.score < 0 || result.score > 1)) {
    throw new Error("MIRROR_MALFORMED_RESPONSE:score");
  }
  if (result.threshold !== null && (typeof result.threshold !== "number" || !Number.isFinite(result.threshold) || result.threshold < 0 || result.threshold > 1)) {
    throw new Error("MIRROR_MALFORMED_RESPONSE:threshold");
  }
  if (typeof result.latencyMs !== "number" || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) {
    throw new Error("MIRROR_MALFORMED_RESPONSE:latency");
  }
  if (typeof result.detectorVersion !== "string" || typeof result.preprocessingId !== "string"
    || !["experimental_threshold_unverified_for_deployment", "deployment_calibrated"].includes(String(result.calibrationStatus))) {
    throw new Error("MIRROR_MALFORMED_RESPONSE:identity");
  }
  if (!result.diagnostics || typeof result.diagnostics !== "object" || Array.isArray(result.diagnostics)) {
    throw new Error("MIRROR_MALFORMED_RESPONSE:diagnostics");
  }
  return result as unknown as ModelDetectionResult & { requestId: string };
}

export class MirrorModelDetector implements ModelDetector {
  readonly id = "mirror-dinov3-hplus";
  readonly enabled: boolean;
  private process?: ChildProcessWithoutNullStreams;
  private lines?: ReadlineInterface;
  private readonly pending = new Map<string, PendingRequest>();
  private requestSequence = 0;
  private admissionTail: Promise<void> = Promise.resolve();
  private stderr = "";
  private workerReady = false;
  private queuedRequests = 0;

  constructor(private readonly config: MirrorConfig) {
    this.enabled = config.enabled;
  }

  runtimeInfo(): ModelRuntimeInfo {
    return {
      detectorId: this.id,
      enabled: this.enabled,
      device: this.config.device,
      residency: this.enabled ? "process_scoped" : "not_loaded",
      admission: this.enabled ? (this.config.microbatchSize && this.config.microbatchSize > 1 ? "bounded_microbatch_queue" : "single_slot_bounded_queue") : "not_configured",
      maxQueue: this.enabled ? this.config.maxQueue : null,
      microbatchSize: this.config.microbatchSize ?? 1,
      resourceClass: "gpu",
      memoryReservationMb: this.config.memoryReservationMb ?? null,
      slotCount: this.config.slotCount ?? 1,
      maxBatchDelayMs: this.config.maxBatchDelayMs ?? 0,
    };
  }

  detect(asset: MediaAsset): Promise<ModelDetectionResult> {
    if (!this.enabled) throw new Error("MIRROR_DISABLED");
    if (this.queuedRequests >= this.config.maxQueue) throw new Error(`MIRROR_QUEUE_FULL:${this.config.maxQueue}`);
    this.queuedRequests += 1;
    const admitted = this.admissionTail.then(() => this.detectAdmitted(asset));
    this.admissionTail = admitted.then(() => undefined, () => undefined);
    return admitted.finally(() => { this.queuedRequests -= 1; });
  }

  async detectBatch(assets: readonly MediaAsset[]): Promise<readonly ModelDetectionResult[]> {
    if (!this.enabled) throw new Error("MIRROR_DISABLED");
    if (assets.length === 0) return [];
    if (assets.length > 32) throw new Error("MIRROR_BATCH_TOO_LARGE:32");
    if (this.queuedRequests + assets.length > this.config.maxQueue) throw new Error(`MIRROR_QUEUE_FULL:${this.config.maxQueue}`);
    this.queuedRequests += assets.length;
    const admitted = this.admissionTail.then(() => this.detectBatchAdmitted(assets));
    this.admissionTail = admitted.then(() => undefined, () => undefined);
    return admitted.finally(() => { this.queuedRequests -= assets.length; });
  }

  close(): void {
    this.lines?.close();
    this.process?.kill("SIGTERM");
    this.process = undefined;
    this.rejectPending(new Error("MIRROR_WORKER_CLOSED"));
  }

  private async detectAdmitted(asset: MediaAsset): Promise<ModelDetectionResult> {
    if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) {
      return this.localResult("unsupported_format", { reason: "mime_type" });
    }
    const process = this.ensureProcess();
    const requestId = `mirror-${process.pid || "starting"}-${++this.requestSequence}`;
    const payload = {
      protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
      requestId,
      imagePath: asset.storedPath,
      mimeType: asset.mimeType,
      assetSha256: asset.sha256,
    };
    return new Promise<ModelDetectionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`MIRROR_TIMEOUT:${this.config.timeoutMs}`));
        this.restartWorker();
      }, (this.workerReady ? 0 : this.config.startupTimeoutMs) + this.config.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      process.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.reject(new Error(`MIRROR_WORKER_WRITE_FAILED:${error.message}`));
      });
    });
  }

  private async detectBatchAdmitted(assets: readonly MediaAsset[]): Promise<readonly ModelDetectionResult[]> {
    const results = new Array<ModelDetectionResult>(assets.length);
    const supported = assets
      .map((asset, index) => ({ asset, index }))
      .filter(({ asset }) => ["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType));
    for (const { index } of assets.map((asset, index) => ({ asset, index })).filter(({ asset }) => !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType))) {
      results[index] = this.localResult("unsupported_format", { reason: "mime_type" });
    }
    if (!supported.length) return results;
    const process = this.ensureProcess();
    const requests = supported.map(({ asset }) => ({
      protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
      requestId: `mirror-${process.pid || "starting"}-${++this.requestSequence}`,
      imagePath: asset.storedPath,
      mimeType: asset.mimeType,
      assetSha256: asset.sha256,
    }));
    const pendingResults = requests.map((request) => new Promise<ModelDetectionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(new Error(`MIRROR_TIMEOUT:${this.config.timeoutMs}`));
        this.restartWorker();
      }, (this.workerReady ? 0 : this.config.startupTimeoutMs) + this.config.timeoutMs);
      this.pending.set(request.requestId, { resolve, reject, timer });
    }));
    try {
      await new Promise<void>((resolve, reject) => {
        process.stdin.write(`${JSON.stringify({ protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION, requests })}\n`, (error) => {
          if (error) reject(new Error(`MIRROR_WORKER_WRITE_FAILED:${error.message}`));
          else resolve();
        });
      });
    } catch (error) {
      for (const request of requests) {
        const pending = this.pending.get(request.requestId);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(request.requestId);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
      await Promise.allSettled(pendingResults);
      throw error;
    }
    const completed = await Promise.all(pendingResults);
    completed.forEach((result, offset) => { results[supported[offset].index] = result; });
    return results;
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.process && this.process.exitCode === null && !this.process.killed) return this.process;
    this.stderr = "";
    this.workerReady = false;
    const args = [
      "run", "--project", this.config.workerProjectDir, "--frozen", "--offline", "--no-sync", "mirror-worker",
      "--source-dir", this.config.sourceDir,
      "--source-revision", this.config.sourceRevision,
      "--checkpoint", this.config.checkpointPath,
      "--checkpoint-sha256", this.config.checkpointSha256,
      "--memory-bank", this.config.memoryBankPath,
      "--memory-bank-sha256", this.config.memoryBankSha256,
      "--backbone-dir", this.config.backboneDir,
      "--backbone-sha256", this.config.backboneSha256,
      "--device", this.config.device,
      ...(this.config.useAmp ? ["--use-amp"] : []),
    ];
    const child = spawn(this.config.uvCommand, args, {
      cwd: this.config.workerProjectDir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        UV_CACHE_DIR: process.env.UV_CACHE_DIR,
        CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = boundedText(`${this.stderr}\n${boundedText(chunk)}`);
    });
    child.once("error", (error) => {
      this.rejectPending(new Error(`MIRROR_WORKER_START_FAILED:${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (this.process === child) this.process = undefined;
      this.rejectPending(new Error(`MIRROR_WORKER_EXITED:${code ?? signal ?? "unknown"}:${this.stderr}`));
    });
    return child;
  }

  private handleLine(line: string): void {
    let parsed: ModelDetectionResult & { requestId: string };
    try {
      parsed = assertMirrorWorkerResult(JSON.parse(line));
      if (parsed.checkpointSha256 !== this.config.checkpointSha256
        || parsed.diagnostics.memoryBankSha256 !== this.config.memoryBankSha256
        || parsed.diagnostics.backboneSha256 !== this.config.backboneSha256) {
        throw new Error("MIRROR_MALFORMED_RESPONSE:artifact_identity");
      }
    } catch (error) {
      this.rejectPending(error instanceof Error ? error : new Error("MIRROR_MALFORMED_RESPONSE"));
      this.restartWorker();
      return;
    }
    const pending = this.pending.get(parsed.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(parsed.requestId);
    const { requestId: _requestId, ...result } = parsed;
    this.workerReady = true;
    pending.resolve(result);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private restartWorker(): void {
    this.process?.kill("SIGKILL");
    this.process = undefined;
  }

  private localResult(outcome: ModelDetectionResult["outcome"], diagnostics: ModelDetectionResult["diagnostics"]): ModelDetectionResult {
    return {
      protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
      detectorId: this.id,
      detectorVersion: "MIRROR-dinov3-hplus-18c56efa",
      outcome,
      score: null,
      threshold: null,
      predictedClass: null,
      latencyMs: 0,
      preprocessingId: "mirror-short512-center224-jpeg96-v1",
      checkpointSha256: this.config.checkpointSha256,
      calibrationStatus: "experimental_threshold_unverified_for_deployment",
      diagnostics,
    };
  }
}
