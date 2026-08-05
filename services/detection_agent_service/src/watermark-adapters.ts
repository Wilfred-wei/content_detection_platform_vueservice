import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { ANALYSIS_SCHEMA_VERSION, type EvidenceRecord, type MediaAsset } from "./analysis-types.js";
import {
  getProductionRunnableSchemes,
  resolveProvenanceShortCircuit,
  type ProvenanceScheme,
  type WatermarkDetectorProfile,
} from "./provenance-registry.js";
import type { WatermarkAdapterId } from "./watermark-adapter-ids.js";

export const WATERMARK_ADAPTER_PROTOCOL_VERSION = "1.0.0";

export type WatermarkOutcome =
  | "verified_present"
  | "possibly_present"
  | "not_detected"
  | "detector_unavailable"
  | "unsupported_format"
  | "timeout"
  | "error";

export interface WatermarkArtifactDigest {
  id: string;
  sha256: string;
}

export interface WatermarkDetectionRequest {
  analysisId: string;
  asset: Pick<MediaAsset, "id" | "mimeType" | "sha256" | "width" | "height" | "storedPath" | "sizeBytes">;
  scheme: ProvenanceScheme;
  profile: WatermarkDetectorProfile;
  deadlineAt: string;
}

export interface WatermarkDetectionResult {
  protocolVersion: string;
  schemeId: string;
  adapterId: string;
  detectorVersion: string;
  profileId: string;
  outcome: WatermarkOutcome;
  score: number | null;
  threshold: number | null;
  payloadMatched: boolean | null;
  payload: string | null;
  attemptedViews: number;
  latencyMs: number;
  artifacts: WatermarkArtifactDigest[];
  diagnostics: Record<string, string | number | boolean | null>;
}

export interface WatermarkDetectorAdapter {
  readonly id: WatermarkAdapterId;
  detect(request: WatermarkDetectionRequest): Promise<WatermarkDetectionResult>;
}

export interface WorkerTransport {
  execute(payload: unknown, deadlineAt: string): Promise<unknown>;
}

interface ProcessTransportOptions {
  command: string;
  args: string[];
  cwd: string;
  maxOutputBytes?: number;
}

function workerEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    "PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL",
    "SSL_CERT_FILE", "SSL_CERT_DIR", "UV_CACHE_DIR", "UV_PYTHON_INSTALL_DIR",
    "CUDA_VISIBLE_DEVICES", "NVIDIA_VISIBLE_DEVICES", "SystemRoot",
  ];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return {
    ...environment,
    PYTHONNOUSERSITE: "1",
    PYTHONUNBUFFERED: "1",
    UV_OFFLINE: "true",
    UV_PYTHON_DOWNLOADS: "never",
  };
}

export class JsonProcessTransport implements WorkerTransport {
  constructor(private readonly options: ProcessTransportOptions) {}

  execute(payload: unknown, deadlineAt: string): Promise<unknown> {
    const remainingMs = Date.parse(deadlineAt) - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return Promise.reject(new Error("WORKER_TIMEOUT"));
    const outputLimit = this.options.maxOutputBytes ?? 64 * 1024;

    return new Promise((resolve, reject) => {
      const child = spawn(this.options.command, this.options.args, {
        cwd: this.options.cwd,
        env: workerEnvironment(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(() => reject(new Error("WORKER_TIMEOUT")));
      }, remainingMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout) > outputLimit) {
          child.kill("SIGKILL");
          finish(() => reject(new Error("WORKER_OUTPUT_LIMIT")));
        }
      });
      child.stderr.on("data", (chunk: string) => {
        if (Buffer.byteLength(stderr) < outputLimit) stderr += chunk;
      });
      child.on("error", (error) => finish(() => reject(new Error(`WORKER_UNAVAILABLE:${error.message}`))));
      child.stdin.on("error", (error) => finish(() => reject(new Error(`WORKER_STDIN:${error.message}`))));
      child.on("close", (code) => finish(() => {
        if (code !== 0) {
          reject(new Error(`WORKER_EXIT:${code}:${stderr.trim().slice(0, 512)}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("WORKER_MALFORMED_RESPONSE"));
        }
      }));
      child.stdin.end(`${JSON.stringify(payload)}\n`);
    });
  }
}

function assertWorkerResult(value: unknown, request: WatermarkDetectionRequest): WatermarkDetectionResult {
  if (!value || typeof value !== "object") throw new Error("WORKER_MALFORMED_RESPONSE");
  const result = value as Partial<WatermarkDetectionResult>;
  const outcomes = new Set<WatermarkOutcome>([
    "verified_present", "possibly_present", "not_detected", "detector_unavailable",
    "unsupported_format", "timeout", "error",
  ]);
  if (
    result.protocolVersion !== WATERMARK_ADAPTER_PROTOCOL_VERSION
    || result.schemeId !== request.scheme.id
    || result.adapterId !== request.scheme.execution.adapterId
    || result.profileId !== request.profile.id
    || !result.outcome
    || !outcomes.has(result.outcome)
    || typeof result.detectorVersion !== "string"
    || typeof result.attemptedViews !== "number"
    || typeof result.latencyMs !== "number"
    || !Array.isArray(result.artifacts)
    || !result.diagnostics
    || typeof result.diagnostics !== "object"
  ) {
    throw new Error("WORKER_MALFORMED_RESPONSE");
  }
  if (
    (result.score !== null && (typeof result.score !== "number" || result.score < 0 || result.score > 1))
    || (result.threshold !== null && (typeof result.threshold !== "number" || result.threshold < 0 || result.threshold > 1))
    || (result.payloadMatched !== null && typeof result.payloadMatched !== "boolean")
    || (result.payload !== null && typeof result.payload !== "string")
    || result.attemptedViews < 0
    || result.latencyMs < 0
  ) {
    throw new Error("WORKER_MALFORMED_RESPONSE");
  }
  return result as WatermarkDetectionResult;
}

export class SdxlInvisibleWatermarkAdapter implements WatermarkDetectorAdapter {
  readonly id = "sdxl-dwt-dct-v1" as const;

  constructor(private readonly transport: WorkerTransport) {}

  async detect(request: WatermarkDetectionRequest): Promise<WatermarkDetectionResult> {
    const artifacts = request.scheme.execution.artifacts
      .filter((artifact): artifact is typeof artifact & { sha256: string } => artifact.sha256 !== null)
      .map((artifact) => ({ id: artifact.id, sha256: artifact.sha256 }));
    const maximumBytes = Number(request.profile.settings.maxBytes);
    const maximumPixels = Number(request.profile.settings.maxPixels);
    const width = request.asset.width;
    const height = request.asset.height;
    const unsupportedReason = !["image/png", "image/jpeg", "image/webp"].includes(request.asset.mimeType)
      ? "mime_type"
      : request.asset.sizeBytes > maximumBytes
        ? "file_size"
        : typeof width !== "number" || typeof height !== "number" || width < 256 || height < 256 || width * height > maximumPixels
          ? "dimensions"
          : null;
    if (unsupportedReason) {
      return {
        protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
        schemeId: request.scheme.id,
        adapterId: this.id,
        detectorVersion: "sdxl-adapter-preflight@1.0.0",
        profileId: request.profile.id,
        outcome: "unsupported_format",
        score: null,
        threshold: null,
        payloadMatched: null,
        payload: null,
        attemptedViews: 0,
        latencyMs: 0,
        artifacts,
        diagnostics: { reason: unsupportedReason },
      };
    }
    const payload = {
      protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
      schemeId: request.scheme.id,
      adapterId: this.id,
      profileId: request.profile.id,
      imagePath: request.asset.storedPath,
      mimeType: request.asset.mimeType,
      sizeBytes: request.asset.sizeBytes,
      settings: request.profile.settings,
      artifacts,
    };
    const result = assertWorkerResult(await this.transport.execute(payload, request.deadlineAt), request);
    return {
      ...result,
      artifacts,
    };
  }
}

export class ClassicInvisibleWatermarkAdapter implements WatermarkDetectorAdapter {
  readonly id = "classic-invisible-watermarks-v1" as const;

  constructor(private readonly transport: WorkerTransport) {}

  async detect(request: WatermarkDetectionRequest): Promise<WatermarkDetectionResult> {
    const artifacts = request.scheme.execution.artifacts
      .filter((artifact): artifact is typeof artifact & { sha256: string } => artifact.sha256 !== null)
      .map((artifact) => ({ id: artifact.id, sha256: artifact.sha256 }));
    const maximumBytes = Number(request.profile.settings.maxBytes);
    const maximumPixels = Number(request.profile.settings.maxPixels);
    const width = request.asset.width;
    const height = request.asset.height;
    const unsupportedReason = !["image/png", "image/jpeg", "image/webp"].includes(request.asset.mimeType)
      ? "mime_type"
      : request.asset.sizeBytes > maximumBytes
        ? "file_size"
        : typeof width !== "number" || typeof height !== "number" || width < 256 || height < 256 || width * height > maximumPixels
          ? "dimensions"
          : null;
    if (unsupportedReason) {
      return {
        protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
        schemeId: request.scheme.id,
        adapterId: this.id,
        detectorVersion: "classic-watermark-adapter-preflight@1.0.0",
        profileId: request.profile.id,
        outcome: "unsupported_format",
        score: null,
        threshold: null,
        payloadMatched: null,
        payload: null,
        attemptedViews: 0,
        latencyMs: 0,
        artifacts,
        diagnostics: { reason: unsupportedReason },
      };
    }
    const payload = {
      protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
      schemeId: request.scheme.id,
      adapterId: this.id,
      profileId: request.profile.id,
      imagePath: request.asset.storedPath,
      mimeType: request.asset.mimeType,
      sizeBytes: request.asset.sizeBytes,
      settings: request.profile.settings,
      artifacts,
    };
    const result = assertWorkerResult(await this.transport.execute(payload, request.deadlineAt), request);
    return { ...result, artifacts };
  }
}

export class TrustMarkPqAdapter implements WatermarkDetectorAdapter {
  readonly id = "trustmark-pq-v1" as const;

  constructor(private readonly transport: WorkerTransport) {}

  async detect(request: WatermarkDetectionRequest): Promise<WatermarkDetectionResult> {
    const artifacts = request.scheme.execution.artifacts
      .filter((artifact): artifact is typeof artifact & { sha256: string } => artifact.sha256 !== null)
      .map((artifact) => ({ id: artifact.id, sha256: artifact.sha256 }));
    const maximumBytes = Number(request.profile.settings.maxBytes);
    const maximumPixels = Number(request.profile.settings.maxPixels);
    const minimumDimension = Number(request.profile.settings.minDimension);
    const width = request.asset.width;
    const height = request.asset.height;
    const unsupportedReason = !["image/png", "image/jpeg", "image/webp"].includes(request.asset.mimeType)
      ? "mime_type"
      : request.asset.sizeBytes > maximumBytes
        ? "file_size"
        : typeof width !== "number" || typeof height !== "number"
          || width < minimumDimension || height < minimumDimension || width * height > maximumPixels
          ? "dimensions"
          : null;
    if (unsupportedReason) {
      return {
        protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
        schemeId: request.scheme.id,
        adapterId: this.id,
        detectorVersion: "trustmark-adapter-preflight@1.0.0",
        profileId: request.profile.id,
        outcome: "unsupported_format",
        score: null,
        threshold: null,
        payloadMatched: null,
        payload: null,
        attemptedViews: 0,
        latencyMs: 0,
        artifacts,
        diagnostics: { reason: unsupportedReason },
      };
    }
    const payload = {
      protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
      schemeId: request.scheme.id,
      adapterId: this.id,
      profileId: request.profile.id,
      imagePath: request.asset.storedPath,
      mimeType: request.asset.mimeType,
      sizeBytes: request.asset.sizeBytes,
      settings: request.profile.settings,
      artifacts,
    };
    const result = assertWorkerResult(await this.transport.execute(payload, request.deadlineAt), request);
    return { ...result, artifacts };
  }
}

export class MetaWatermarksAdapter implements WatermarkDetectorAdapter {
  readonly id = "meta-watermarks-v1" as const;
  private admissionTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly transport: WorkerTransport,
    private readonly deviceOverride?: string,
  ) {}

  detect(request: WatermarkDetectionRequest): Promise<WatermarkDetectionResult> {
    const admitted = this.admissionTail.then(() => this.detectAdmitted(request));
    this.admissionTail = admitted.then(() => undefined, () => undefined);
    return admitted;
  }

  private async detectAdmitted(request: WatermarkDetectionRequest): Promise<WatermarkDetectionResult> {
    const artifacts = request.scheme.execution.artifacts
      .filter((artifact): artifact is typeof artifact & { sha256: string } => artifact.sha256 !== null)
      .map((artifact) => ({ id: artifact.id, sha256: artifact.sha256 }));
    const maximumBytes = Number(request.profile.settings.maxBytes);
    const maximumPixels = Number(request.profile.settings.maxPixels);
    const minimumDimension = Number(request.profile.settings.minDimension);
    const width = request.asset.width;
    const height = request.asset.height;
    const unsupportedReason = !["image/png", "image/jpeg", "image/webp"].includes(request.asset.mimeType)
      ? "mime_type"
      : request.asset.sizeBytes > maximumBytes
        ? "file_size"
        : typeof width !== "number" || typeof height !== "number"
          || width < minimumDimension || height < minimumDimension || width * height > maximumPixels
          ? "dimensions"
          : null;
    if (unsupportedReason) {
      return {
        protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
        schemeId: request.scheme.id,
        adapterId: this.id,
        detectorVersion: "meta-watermarks-adapter-preflight@1.0.0",
        profileId: request.profile.id,
        outcome: "unsupported_format",
        score: null,
        threshold: null,
        payloadMatched: null,
        payload: null,
        attemptedViews: 0,
        latencyMs: 0,
        artifacts,
        diagnostics: { reason: unsupportedReason },
      };
    }
    const payload = {
      protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
      schemeId: request.scheme.id,
      adapterId: this.id,
      profileId: request.profile.id,
      imagePath: request.asset.storedPath,
      mimeType: request.asset.mimeType,
      sizeBytes: request.asset.sizeBytes,
      settings: {
        ...request.profile.settings,
        ...(this.deviceOverride ? { device: this.deviceOverride } : {}),
      },
      artifacts,
    };
    const result = assertWorkerResult(await this.transport.execute(payload, request.deadlineAt), request);
    return { ...result, artifacts };
  }
}

const CLASSIC_WORKER_ROOT = fileURLToPath(new URL("../workers/watermark_classic/", import.meta.url));
const TRUSTMARK_WORKER_ROOT = fileURLToPath(new URL("../workers/trustmark/", import.meta.url));
const META_WATERMARKS_WORKER_ROOT = fileURLToPath(new URL("../workers/meta_watermarks/", import.meta.url));

function createDefaultSdxlAdapter(env: NodeJS.ProcessEnv): SdxlInvisibleWatermarkAdapter {
  const uv = env.WATERMARK_CLASSIC_UV?.trim() || "uv";
  return new SdxlInvisibleWatermarkAdapter(new JsonProcessTransport({
    command: uv,
    args: ["run", "--project", CLASSIC_WORKER_ROOT, "--frozen", "--offline", "--no-sync", "watermark-classic-worker"],
    cwd: CLASSIC_WORKER_ROOT,
  }));
}

function createDefaultClassicAdapter(env: NodeJS.ProcessEnv): ClassicInvisibleWatermarkAdapter {
  const uv = env.WATERMARK_CLASSIC_UV?.trim() || "uv";
  return new ClassicInvisibleWatermarkAdapter(new JsonProcessTransport({
    command: uv,
    args: ["run", "--project", CLASSIC_WORKER_ROOT, "--frozen", "--offline", "--no-sync", "watermark-classic-worker"],
    cwd: CLASSIC_WORKER_ROOT,
  }));
}

function createDefaultTrustMarkAdapter(env: NodeJS.ProcessEnv): TrustMarkPqAdapter {
  const uv = env.TRUSTMARK_UV?.trim() || "uv";
  return new TrustMarkPqAdapter(new JsonProcessTransport({
    command: uv,
    args: ["run", "--project", TRUSTMARK_WORKER_ROOT, "--frozen", "--offline", "--no-sync", "trustmark-worker"],
    cwd: TRUSTMARK_WORKER_ROOT,
    maxOutputBytes: 128 * 1024,
  }));
}

function createDefaultMetaWatermarksAdapter(env: NodeJS.ProcessEnv): MetaWatermarksAdapter {
  const uv = env.META_WATERMARKS_UV?.trim() || "uv";
  const requestedDevice = env.META_WATERMARKS_DEVICE?.trim();
  const device = requestedDevice && /^(?:cpu|cuda(?::\d+)?)$/.test(requestedDevice)
    ? requestedDevice
    : undefined;
  return new MetaWatermarksAdapter(new JsonProcessTransport({
    command: uv,
    args: ["run", "--project", META_WATERMARKS_WORKER_ROOT, "--frozen", "--offline", "--no-sync", "meta-watermarks-worker"],
    cwd: META_WATERMARKS_WORKER_ROOT,
    maxOutputBytes: 128 * 1024,
  }), device);
}

function statusForOutcome(outcome: WatermarkOutcome): EvidenceRecord["status"] {
  return outcome === "timeout" ? "error" : outcome;
}

function summaryForResult(scheme: ProvenanceScheme, result: WatermarkDetectionResult): string {
  if (result.outcome === "verified_present") return `${scheme.name} 的登记载荷已通过校准策略验证。`;
  if (result.outcome === "possibly_present") return `${scheme.name} 检测到候选匹配；校准完成前仅作为支持性证据。`;
  if (result.outcome === "not_detected") return `已执行 ${scheme.name} 检测，未达到候选匹配阈值。`;
  if (result.outcome === "unsupported_format") return `${scheme.name} 不支持该图像格式或尺寸。`;
  if (result.outcome === "detector_unavailable") return `${scheme.name} 本地解码器当前不可用。`;
  if (result.outcome === "timeout") return `${scheme.name} 本地解码超时，未形成检测结论。`;
  return `${scheme.name} 本地解码失败，未形成检测结论。`;
}

function evidenceFromResult(analysisId: string, scheme: ProvenanceScheme, result: WatermarkDetectionResult, createdAt: string): EvidenceRecord {
  const releaseGate = resolveProvenanceShortCircuit(scheme.id);
  const verified = result.outcome === "verified_present" && releaseGate.eligible;
  const possible = result.outcome === "possibly_present" || (result.outcome === "verified_present" && !verified);
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: randomUUID(),
    analysisId,
    category: "watermark",
    source: scheme.id,
    status: verified ? "verified_present" : possible ? "possibly_present" : statusForOutcome(result.outcome),
    strength: verified ? "strong" : possible ? "supporting" : "none",
    summary: verified || result.outcome !== "verified_present"
      ? summaryForResult(scheme, result)
      : `${scheme.name} 返回载荷匹配，但当前注册项不允许短路，仅作为支持性证据。`,
    facts: {
      schemeId: result.schemeId,
      adapterId: result.adapterId,
      adapterProtocolVersion: result.protocolVersion,
      detectorVersion: result.detectorVersion,
      profileId: result.profileId,
      outcome: result.outcome,
      score: result.score,
      threshold: result.threshold,
      payloadMatched: result.payloadMatched,
      payload: result.payload,
      attemptedViews: result.attemptedViews,
      latencyMs: result.latencyMs,
      artifactDigests: JSON.stringify(result.artifacts),
      diagnostics: JSON.stringify(result.diagnostics),
      absenceEstablished: result.outcome === "not_detected",
      shortCircuitSchemeEligible: releaseGate.eligible,
      shortCircuitAuthorized: verified,
      releaseGateId: releaseGate.gateId,
      releaseGateRegistryVersion: releaseGate.gateRegistryVersion,
      releaseGateReasons: JSON.stringify(releaseGate.reasons),
    },
    createdAt,
  };
}

function failedEvidence(analysisId: string, scheme: ProvenanceScheme, error: unknown, createdAt: string): EvidenceRecord {
  const detail = error instanceof Error ? error.message : "UNKNOWN_WORKER_ERROR";
  const outcome: WatermarkOutcome = detail === "WORKER_TIMEOUT"
    ? "timeout"
    : detail.startsWith("WORKER_UNAVAILABLE") || detail.startsWith("WORKER_EXIT")
      ? "detector_unavailable"
      : "error";
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: randomUUID(),
    analysisId,
    category: "watermark",
    source: scheme.id,
    status: outcome === "detector_unavailable" ? "detector_unavailable" : "error",
    strength: "none",
    summary: outcome === "timeout"
      ? `${scheme.name} 本地解码超时，未形成检测结论。`
      : outcome === "detector_unavailable"
        ? `${scheme.name} 本地解码器当前不可用。`
        : `${scheme.name} 本地解码返回了无效结果。`,
    facts: {
      schemeId: scheme.id,
      adapterId: scheme.execution.adapterId,
      adapterProtocolVersion: scheme.execution.protocolVersion,
      outcome,
      detectionAttempted: outcome !== "detector_unavailable",
      absenceEstablished: false,
      errorCode: detail.split(":", 1)[0],
    },
    createdAt,
  };
}

export interface WatermarkInspector {
  inspect(analysisId: string, asset: MediaAsset, createdAt?: string): Promise<EvidenceRecord[]>;
}

export class RegistryWatermarkInspector implements WatermarkInspector {
  private readonly adapters: ReadonlyMap<string, WatermarkDetectorAdapter>;

  constructor(adapters: Iterable<WatermarkDetectorAdapter>) {
    this.adapters = new Map([...adapters].map((adapter) => [adapter.id, adapter]));
  }

  async inspect(analysisId: string, asset: MediaAsset, createdAt = new Date().toISOString()): Promise<EvidenceRecord[]> {
    const schemes = getProductionRunnableSchemes().filter((scheme) => scheme.family === "open_watermark");
    return Promise.all(schemes.map(async (scheme) => {
      const adapter = scheme.execution.adapterId ? this.adapters.get(scheme.execution.adapterId) : undefined;
      const profile = scheme.execution.profiles[0];
      if (!adapter || !profile) return failedEvidence(analysisId, scheme, new Error("WORKER_UNAVAILABLE:adapter_not_configured"), createdAt);
      const deadlineAt = new Date(Date.now() + scheme.execution.timeoutMs).toISOString();
      try {
        return evidenceFromResult(analysisId, scheme, await adapter.detect({ analysisId, asset, scheme, profile, deadlineAt }), createdAt);
      } catch (error) {
        return failedEvidence(analysisId, scheme, error, createdAt);
      }
    }));
  }
}

export function createConfiguredWatermarkInspector(env: NodeJS.ProcessEnv = process.env): WatermarkInspector {
  return new RegistryWatermarkInspector([
    createDefaultSdxlAdapter(env),
    createDefaultClassicAdapter(env),
    createDefaultTrustMarkAdapter(env),
    createDefaultMetaWatermarksAdapter(env),
  ]);
}
