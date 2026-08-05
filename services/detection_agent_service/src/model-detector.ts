import { randomUUID } from "node:crypto";

import {
  ANALYSIS_SCHEMA_VERSION,
  type EvidenceRecord,
  type MediaAsset,
} from "./analysis-types.js";

export const MODEL_DETECTOR_PROTOCOL_VERSION = "model-detector.v1";

export type ModelDetectionOutcome = "detected" | "not_detected" | "unavailable" | "unsupported_format" | "error";

export interface ModelDetectionResult {
  protocolVersion: typeof MODEL_DETECTOR_PROTOCOL_VERSION;
  detectorId: string;
  detectorVersion: string;
  outcome: ModelDetectionOutcome;
  score: number | null;
  threshold: number | null;
  predictedClass: "ai_generated" | "non_ai" | null;
  latencyMs: number;
  preprocessingId: string;
  checkpointSha256: string | null;
  calibrationStatus: "deployment_calibrated" | "official_threshold_unverified_for_deployment" | "experimental_threshold_unverified_for_deployment" | "unavailable";
  diagnostics: Record<string, string | number | boolean | null>;
}

export interface ModelDetector {
  readonly id: string;
  readonly enabled: boolean;
  detect(asset: MediaAsset): Promise<ModelDetectionResult>;
  /**
   * Optional true worker-level batching. The scheduler only calls this after
   * it has bounded the batch size and admitted the whole batch as one device
   * reservation. Detectors without this method retain single-item behavior.
   */
  detectBatch?(assets: readonly MediaAsset[]): Promise<readonly ModelDetectionResult[]>;
  runtimeInfo?(): ModelRuntimeInfo;
  close?(): void;
}

export interface ModelRuntimeInfo {
  detectorId: string;
  enabled: boolean;
  device: string;
  residency: "process_scoped" | "not_loaded" | "unknown";
  admission: "single_slot_bounded_queue" | "bounded_microbatch_queue" | "not_configured" | "unknown";
  maxQueue: number | null;
  microbatchSize: number;
  resourceClass: "cpu" | "gpu" | "unknown";
  memoryReservationMb?: number | null;
  slotCount?: number;
  maxBatchDelayMs?: number;
}

export type ModelDetectorFailureType = "timeout" | "version_mismatch" | "malformed_response" | "unavailable";

export const unavailableModelDetector: ModelDetector = {
  id: "model-policy-disabled",
  enabled: false,
  async detect() {
    return {
      protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
      detectorId: "model-policy-disabled",
      detectorVersion: "not-configured",
      outcome: "unavailable",
      score: null,
      threshold: null,
      predictedClass: null,
      latencyMs: 0,
      preprocessingId: "not-run",
      checkpointSha256: null,
      calibrationStatus: "unavailable",
      diagnostics: { reason: "MODEL_POLICY_DISABLED" },
    };
  },
};

export function modelDetectionToEvidence(
  analysisId: string,
  result: ModelDetectionResult,
  createdAt = new Date().toISOString(),
): EvidenceRecord {
  const detectorName = result.detectorId === "dda-dinov2-lora"
    ? "DDA"
    : result.detectorId === "mirror-dinov3-hplus" ? "MIRROR"
      : result.detectorId === "safe-wavelet-resnet" ? "SAFE" : result.detectorId;
  const status = result.outcome;
  const outOfDistribution = result.diagnostics.outOfDistribution === true
    ? true
    : result.diagnostics.outOfDistribution === false ? false : null;
  const summary = outOfDistribution
    ? `${detectorName} 返回了分数 ${result.score?.toFixed(4)}，但将该输入标记为分布外；该分数仅保留用于审计，不进入支持性裁决。`
    : result.outcome === "detected"
    ? `${detectorName} 模型分数高于其发布阈值，支持该图像为 AI 生成的判断（分数 ${result.score?.toFixed(4)}）。`
    : result.outcome === "not_detected"
      ? `${detectorName} 模型分数未达到其发布阈值，支持非 AI 方向，但不能证明图像真实（分数 ${result.score?.toFixed(4)}）。`
      : result.outcome === "unsupported_format"
        ? `${detectorName} 不支持该图像格式，本次未执行模型推理。`
        : result.outcome === "unavailable"
          ? `${detectorName} 检测器当前不可用，分析继续按其余证据执行。`
          : `${detectorName} 推理失败，分析继续按其余证据执行。`;

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: randomUUID(),
    analysisId,
    category: "model",
    source: result.detectorId,
    status,
    strength: ["detected", "not_detected"].includes(result.outcome) && !outOfDistribution ? "supporting" : "none",
    summary,
    facts: {
      ...result.diagnostics,
      detectionAttempted: ["detected", "not_detected", "error"].includes(result.outcome),
      detectorVersion: result.detectorVersion,
      score: result.score,
      threshold: result.threshold,
      predictedClass: result.predictedClass,
      preprocessingId: result.preprocessingId,
      checkpointSha256: result.checkpointSha256,
      calibrationStatus: result.calibrationStatus,
      latencyMs: result.latencyMs,
      outOfDistribution,
      applicability: outOfDistribution === true ? "out_of_distribution"
        : outOfDistribution === false ? "in_distribution" : "unknown",
    },
    createdAt,
  };
}

function classifyModelDetectorFailure(reason: string): ModelDetectorFailureType {
  if (/(?:^|_)TIMEOUT(?::|$)/u.test(reason)) return "timeout";
  if (/(?:VERSION_MISMATCH|MALFORMED_RESPONSE:(?:protocol_version|configured_identity|artifact_identity|identity))/u.test(reason)) {
    return "version_mismatch";
  }
  if (/MALFORMED_RESPONSE/u.test(reason)) return "malformed_response";
  return "unavailable";
}

export function modelDetectorFailureToEvidence(
  analysisId: string,
  detectorId: string,
  error: unknown,
  createdAt = new Date().toISOString(),
): EvidenceRecord {
  const rawReason = error instanceof Error ? error.message : String(error || `${detectorId}:UNAVAILABLE`);
  const reason = rawReason.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1_000);
  const failureType = classifyModelDetectorFailure(reason);
  const unavailable = failureType === "unavailable";
  const detail = failureType === "timeout" ? "推理超时"
    : failureType === "version_mismatch" ? "返回版本或产物身份不匹配"
      : failureType === "malformed_response" ? "返回格式不符合协议" : "检测器不可用";
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: randomUUID(),
    analysisId,
    category: "model",
    source: detectorId,
    status: unavailable ? "detector_unavailable" : "error",
    strength: "none",
    summary: `${detectorId} ${detail}，本次未形成可用于裁决的模型证据。`,
    facts: {
      policyEnabled: true,
      detectionAttempted: !unavailable,
      failureType,
      reason,
      outOfDistribution: null,
      applicability: "unknown",
    },
    createdAt,
  };
}
