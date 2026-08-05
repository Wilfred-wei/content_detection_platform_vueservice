import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

import type { DdaConfig, DdaShadowConfig } from "./config.js";
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

interface SettledDetection {
  status: "completed" | "failed";
  result?: ModelDetectionResult;
  error?: string;
}

export interface DdaShadowComparisonRecord {
  schemaVersion: "dda-shadow-comparison.v1";
  id: string;
  createdAt: string;
  asset: {
    id: string;
    sha256: string;
    mimeType: string;
    width: number | null;
    height: number | null;
  };
  baseline: {
    role: "active_evidence_route";
    detectorId: string;
    checkpointSha256: string;
    status: SettledDetection["status"];
    score: number | null;
    predictedClass: ModelDetectionResult["predictedClass"];
    latencyMs: number | null;
    error: string | null;
  };
  candidate: {
    role: "shadow_only";
    candidateId: string;
    candidateStatus: string;
    detectorId: string;
    checkpointSha256: string;
    manifestSha256: string;
    status: SettledDetection["status"];
    score: number | null;
    predictedClass: ModelDetectionResult["predictedClass"];
    latencyMs: number | null;
    error: string | null;
  };
  comparison: {
    scoreDeltaCandidateMinusBaseline: number | null;
    directionAgreement: "agreement" | "disagreement" | "unavailable";
  };
  decisionAuthority: "none";
  productionSwapAuthorized: false;
}

function boundedText(value: Buffer | string, maximum = 4_000): string {
  const text = value.toString().trim();
  return text.length <= maximum ? text : text.slice(-maximum);
}

function settledFailure(error: unknown): SettledDetection {
  return {
    status: "failed",
    error: boundedText(error instanceof Error ? error.message : String(error), 1_000),
  };
}

async function settleDetection(work: Promise<ModelDetectionResult>): Promise<SettledDetection> {
  try {
    return { status: "completed", result: await work };
  } catch (error) {
    return settledFailure(error);
  }
}

async function settleBatchDetection(
  work: Promise<readonly ModelDetectionResult[]>,
  size: number,
): Promise<SettledDetection[]> {
  try {
    const results = await work;
    if (results.length !== size) throw new Error("DDA_BATCH_RESULT_MISMATCH");
    return results.map((result) => ({ status: "completed", result }));
  } catch (error) {
    const failure = settledFailure(error);
    return Array.from({ length: size }, () => failure);
  }
}

export function assertDdaWorkerResult(value: unknown): ModelDetectionResult & { requestId: string } {
  if (!value || typeof value !== "object") throw new Error("DDA_MALFORMED_RESPONSE:not_an_object");
  const result = value as Record<string, unknown>;
  if (result.protocolVersion !== MODEL_DETECTOR_PROTOCOL_VERSION) throw new Error("DDA_MALFORMED_RESPONSE:protocol_version");
  if (typeof result.requestId !== "string" || !result.requestId) throw new Error("DDA_MALFORMED_RESPONSE:request_id");
  if (result.detectorId !== "dda-dinov2-lora") throw new Error("DDA_MALFORMED_RESPONSE:detector_id");
  if (!(["detected", "not_detected", "unavailable", "unsupported_format", "error"] as unknown[]).includes(result.outcome)) {
    throw new Error("DDA_MALFORMED_RESPONSE:outcome");
  }
  if (result.score !== null && (typeof result.score !== "number" || !Number.isFinite(result.score) || result.score < 0 || result.score > 1)) {
    throw new Error("DDA_MALFORMED_RESPONSE:score");
  }
  if (result.threshold !== null && (typeof result.threshold !== "number" || !Number.isFinite(result.threshold) || result.threshold < 0 || result.threshold > 1)) {
    throw new Error("DDA_MALFORMED_RESPONSE:threshold");
  }
  if (typeof result.latencyMs !== "number" || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) {
    throw new Error("DDA_MALFORMED_RESPONSE:latency");
  }
  if (typeof result.detectorVersion !== "string" || typeof result.preprocessingId !== "string") {
    throw new Error("DDA_MALFORMED_RESPONSE:identity");
  }
  if (!result.diagnostics || typeof result.diagnostics !== "object" || Array.isArray(result.diagnostics)) {
    throw new Error("DDA_MALFORMED_RESPONSE:diagnostics");
  }
  return result as unknown as ModelDetectionResult & { requestId: string };
}

export class DdaModelDetector implements ModelDetector {
  readonly id = "dda-dinov2-lora";
  readonly enabled: boolean;
  private process?: ChildProcessWithoutNullStreams;
  private lines?: ReadlineInterface;
  private readonly pending = new Map<string, PendingRequest>();
  private requestSequence = 0;
  private admissionTail: Promise<void> = Promise.resolve();
  private stderr = "";
  private workerReady = false;
  private queuedRequests = 0;

  constructor(private readonly config: DdaConfig) {
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
    if (!this.enabled) throw new Error("DDA_DISABLED");
    if (this.queuedRequests >= this.config.maxQueue) throw new Error(`DDA_QUEUE_FULL:${this.config.maxQueue}`);
    this.queuedRequests += 1;
    const admitted = this.admissionTail.then(() => this.detectAdmitted(asset));
    this.admissionTail = admitted.then(() => undefined, () => undefined);
    return admitted.finally(() => { this.queuedRequests -= 1; });
  }

  async detectBatch(assets: readonly MediaAsset[]): Promise<readonly ModelDetectionResult[]> {
    if (!this.enabled) throw new Error("DDA_DISABLED");
    if (assets.length === 0) return [];
    if (assets.length > 32) throw new Error("DDA_BATCH_TOO_LARGE:32");
    if (this.queuedRequests + assets.length > this.config.maxQueue) throw new Error(`DDA_QUEUE_FULL:${this.config.maxQueue}`);
    this.queuedRequests += assets.length;
    const admitted = this.admissionTail.then(() => this.detectBatchAdmitted(assets));
    this.admissionTail = admitted.then(() => undefined, () => undefined);
    return admitted.finally(() => { this.queuedRequests -= assets.length; });
  }

  close(): void {
    this.lines?.close();
    this.process?.kill("SIGTERM");
    this.process = undefined;
    this.rejectPending(new Error("DDA_WORKER_CLOSED"));
  }

  private async detectAdmitted(asset: MediaAsset): Promise<ModelDetectionResult> {
    if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) {
      return this.localResult("unsupported_format", { reason: "mime_type" });
    }
    const process = this.ensureProcess();
    const requestId = `dda-${process.pid || "starting"}-${++this.requestSequence}`;
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
        reject(new Error(`DDA_TIMEOUT:${this.config.timeoutMs}`));
        this.restartWorker();
      }, (this.workerReady ? 0 : this.config.startupTimeoutMs) + this.config.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      process.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.reject(new Error(`DDA_WORKER_WRITE_FAILED:${error.message}`));
      });
    });
  }

  private async detectBatchAdmitted(assets: readonly MediaAsset[]): Promise<readonly ModelDetectionResult[]> {
    const results = new Array<ModelDetectionResult>(assets.length);
    const supported = assets
      .map((asset, index) => ({ asset, index }))
      .filter(({ asset }) => ["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType));
    for (const { asset, index } of assets.map((asset, index) => ({ asset, index })).filter(({ asset }) => !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType))) {
      results[index] = this.localResult("unsupported_format", { reason: "mime_type" });
    }
    if (!supported.length) return results;

    const process = this.ensureProcess();
    const requests = supported.map(({ asset }) => ({
      protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
      requestId: `dda-${process.pid || "starting"}-${++this.requestSequence}`,
      imagePath: asset.storedPath,
      mimeType: asset.mimeType,
      assetSha256: asset.sha256,
    }));
    const pendingResults = requests.map((request) => new Promise<ModelDetectionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(new Error(`DDA_TIMEOUT:${this.config.timeoutMs}`));
        this.restartWorker();
      }, (this.workerReady ? 0 : this.config.startupTimeoutMs) + this.config.timeoutMs);
      this.pending.set(request.requestId, { resolve, reject, timer });
    }));
    try {
      await new Promise<void>((resolve, reject) => {
        process.stdin.write(JSON.stringify({ protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION, requests }) + "\n", (error) => {
          if (error) reject(new Error(`DDA_WORKER_WRITE_FAILED:${error.message}`));
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
    completed.forEach((result, offset) => {
      results[supported[offset].index] = result;
    });
    return results;
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.process && this.process.exitCode === null && !this.process.killed) return this.process;
    this.stderr = "";
    this.workerReady = false;
    const child = spawn(this.config.uvCommand, [
      "run", "--project", this.config.workerProjectDir, "--frozen", "--offline", "--no-sync", "dda-worker",
      "--source-dir", this.config.sourceDir,
      "--checkpoint", this.config.checkpointPath,
      "--checkpoint-sha256", this.config.checkpointSha256,
      "--dinov2-hub-dir", this.config.dinov2HubDir,
      "--device", this.config.device,
      "--detector-version", this.config.detectorVersion,
    ], {
      cwd: this.config.workerProjectDir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        UV_CACHE_DIR: process.env.UV_CACHE_DIR,
        CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES,
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
      this.rejectPending(new Error(`DDA_WORKER_START_FAILED:${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (this.process === child) this.process = undefined;
      this.rejectPending(new Error(`DDA_WORKER_EXITED:${code ?? signal ?? "unknown"}:${this.stderr}`));
    });
    return child;
  }

  private handleLine(line: string): void {
    let parsed: ModelDetectionResult & { requestId: string };
    try {
      parsed = assertDdaWorkerResult(JSON.parse(line));
      if (parsed.checkpointSha256 !== this.config.checkpointSha256
        || parsed.detectorVersion !== this.config.detectorVersion
        || parsed.preprocessingId !== "resize-336-clip-normalize-v1") {
        throw new Error("DDA_MALFORMED_RESPONSE:configured_identity");
      }
    } catch (error) {
      this.rejectPending(error instanceof Error ? error : new Error("DDA_MALFORMED_RESPONSE"));
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
      detectorVersion: this.config.detectorVersion,
      outcome,
      score: null,
      threshold: null,
      predictedClass: null,
      latencyMs: 0,
      preprocessingId: "resize-336-clip-normalize-v1",
      checkpointSha256: this.config.checkpointSha256,
      calibrationStatus: "official_threshold_unverified_for_deployment",
      diagnostics,
    };
  }
}

export class DdaShadowModelDetector implements ModelDetector {
  readonly id: string;
  readonly enabled: boolean;
  private auditTail: Promise<void> = Promise.resolve();
  private auditError?: string;

  constructor(
    private readonly baseline: ModelDetector,
    private readonly candidate: ModelDetector,
    private readonly config: DdaShadowConfig,
  ) {
    this.id = baseline.id;
    this.enabled = baseline.enabled;
    if (!config.enabled || !candidate.enabled) throw new Error("DDA_SHADOW_DISABLED");
  }

  async detect(asset: MediaAsset): Promise<ModelDetectionResult> {
    const candidateOutcome = settleDetection(Promise.resolve().then(() => this.candidate.detect(asset)));
    let baselineOutcome: SettledDetection;
    try {
      const result = await this.baseline.detect(asset);
      baselineOutcome = { status: "completed", result };
      this.enqueueAudit(asset, baselineOutcome, candidateOutcome);
      return result;
    } catch (error) {
      baselineOutcome = settledFailure(error);
      this.enqueueAudit(asset, baselineOutcome, candidateOutcome);
      throw error;
    }
  }

  async detectBatch(assets: readonly MediaAsset[]): Promise<readonly ModelDetectionResult[]> {
    if (assets.length === 0) return [];
    const candidateOutcome = settleBatchDetection(
      Promise.resolve().then(() => this.candidate.detectBatch
        ? this.candidate.detectBatch(assets)
        : Promise.all(assets.map((asset) => this.candidate.detect(asset)))),
      assets.length,
    );
    try {
      const baselineResults = await (this.baseline.detectBatch
        ? this.baseline.detectBatch(assets)
        : Promise.all(assets.map((asset) => this.baseline.detect(asset))));
      if (baselineResults.length !== assets.length) throw new Error("DDA_BATCH_RESULT_MISMATCH");
      this.enqueueBatchAudit(assets, baselineResults.map((result) => ({ status: "completed", result })), candidateOutcome);
      return baselineResults;
    } catch (error) {
      this.enqueueBatchAudit(assets, assets.map(() => settledFailure(error)), candidateOutcome);
      throw error;
    }
  }

  runtimeInfo(): ModelRuntimeInfo {
    return this.baseline.runtimeInfo?.() || {
      detectorId: this.id,
      enabled: this.enabled,
      device: "unknown",
      residency: "unknown",
      admission: "unknown",
      maxQueue: null,
      microbatchSize: 1,
      resourceClass: "gpu",
    };
  }

  close(): void {
    this.baseline.close?.();
    this.candidate.close?.();
  }

  async drainAudit(): Promise<void> {
    await this.auditTail;
  }

  lastAuditError(): string | undefined {
    return this.auditError;
  }

  private enqueueAudit(
    asset: MediaAsset,
    baseline: SettledDetection,
    candidate: Promise<SettledDetection>,
  ): void {
    this.auditTail = this.auditTail.then(async () => {
      const candidateOutcome = await candidate;
      const record = this.comparisonRecord(asset, baseline, candidateOutcome);
      await mkdir(dirname(this.config.auditLogPath), { recursive: true });
      await appendFile(this.config.auditLogPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    }).catch((error) => {
      this.auditError = boundedText(error instanceof Error ? error.message : String(error), 1_000);
      console.error(`[detection-agent] DDA shadow audit unavailable: ${this.auditError}`);
    });
  }

  private enqueueBatchAudit(
    assets: readonly MediaAsset[],
    baseline: readonly SettledDetection[],
    candidate: Promise<readonly SettledDetection[]>,
  ): void {
    this.auditTail = this.auditTail.then(async () => {
      const candidateOutcomes = await candidate;
      for (let index = 0; index < assets.length; index += 1) {
        const record = this.comparisonRecord(assets[index], baseline[index], candidateOutcomes[index]);
        await mkdir(dirname(this.config.auditLogPath), { recursive: true });
        await appendFile(this.config.auditLogPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
      }
    }).catch((error) => {
      this.auditError = boundedText(error instanceof Error ? error.message : String(error), 1_000);
      console.error(`[detection-agent] DDA shadow batch audit unavailable: ${this.auditError}`);
    });
  }

  private comparisonRecord(
    asset: MediaAsset,
    baseline: SettledDetection,
    candidate: SettledDetection,
  ): DdaShadowComparisonRecord {
    const baselineResult = baseline.result;
    const candidateResult = candidate.result;
    const comparableScores = baselineResult?.score !== null && baselineResult?.score !== undefined
      && candidateResult?.score !== null && candidateResult?.score !== undefined;
    const comparableDirections = baselineResult?.predictedClass && candidateResult?.predictedClass;
    return {
      schemaVersion: "dda-shadow-comparison.v1",
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      asset: {
        id: asset.id,
        sha256: asset.sha256,
        mimeType: asset.mimeType,
        width: asset.width ?? null,
        height: asset.height ?? null,
      },
      baseline: {
        role: "active_evidence_route",
        detectorId: this.baseline.id,
        checkpointSha256: baselineResult?.checkpointSha256 || "",
        status: baseline.status,
        score: baselineResult?.score ?? null,
        predictedClass: baselineResult?.predictedClass ?? null,
        latencyMs: baselineResult?.latencyMs ?? null,
        error: baseline.error ?? null,
      },
      candidate: {
        role: "shadow_only",
        candidateId: this.config.candidateId,
        candidateStatus: this.config.candidateStatus,
        detectorId: this.candidate.id,
        checkpointSha256: candidateResult?.checkpointSha256 || this.config.candidate.checkpointSha256,
        manifestSha256: this.config.candidateManifestSha256,
        status: candidate.status,
        score: candidateResult?.score ?? null,
        predictedClass: candidateResult?.predictedClass ?? null,
        latencyMs: candidateResult?.latencyMs ?? null,
        error: candidate.error ?? null,
      },
      comparison: {
        scoreDeltaCandidateMinusBaseline: comparableScores
          ? candidateResult.score! - baselineResult.score!
          : null,
        directionAgreement: comparableDirections
          ? baselineResult.predictedClass === candidateResult.predictedClass ? "agreement" : "disagreement"
          : "unavailable",
      },
      decisionAuthority: "none",
      productionSwapAuthorized: false,
    };
  }
}
