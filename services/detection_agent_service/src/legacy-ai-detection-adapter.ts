import { readFile } from "node:fs/promises";

import type { MediaAsset } from "./analysis-types.js";
import {
  MODEL_DETECTOR_PROTOCOL_VERSION,
  type ModelDetectionResult,
  type ModelDetector,
  type ModelRuntimeInfo,
} from "./model-detector.js";

export interface LegacyAiDetectionConfig {
  enabled: boolean;
  url?: string;
  token?: string;
  timeoutMs: number;
  threshold: number;
  modelVersion: string;
}

interface LegacyResponse {
  score?: unknown;
  prediction?: unknown;
  label?: unknown;
  modelVersion?: unknown;
  heatmap?: unknown;
}

function boundedText(value: unknown, maximum = 240): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximum) : "";
}

function parseResult(value: unknown, config: LegacyAiDetectionConfig, latencyMs: number): ModelDetectionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LEGACY_MODEL_MALFORMED_RESPONSE");
  const raw = value as LegacyResponse;
  if (typeof raw.score !== "number" || !Number.isFinite(raw.score) || raw.score < 0 || raw.score > 1) {
    throw new Error("LEGACY_MODEL_MALFORMED_RESPONSE:score");
  }
  const prediction = typeof raw.prediction === "string" ? raw.prediction.toLowerCase() : typeof raw.label === "string" ? raw.label.toLowerCase() : "";
  const predictedClass = prediction.includes("ai") || prediction.includes("fake") || prediction.includes("generated")
    ? "ai_generated" as const
    : prediction.includes("real") || prediction.includes("non") || prediction.includes("human")
      ? "non_ai" as const
      : raw.score >= config.threshold ? "ai_generated" as const : "non_ai" as const;
  const modelVersion = boundedText(raw.modelVersion) || config.modelVersion;
  return {
    protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
    detectorId: "ai-detection-service",
    detectorVersion: modelVersion,
    outcome: raw.score >= config.threshold ? "detected" : "not_detected",
    score: raw.score,
    threshold: config.threshold,
    predictedClass,
    latencyMs,
    preprocessingId: "legacy-ai-service-contract-v1",
    checkpointSha256: null,
    calibrationStatus: "official_threshold_unverified_for_deployment",
    diagnostics: {
      responseModelVersion: modelVersion,
      heatmapAvailable: raw.heatmap !== undefined && raw.heatmap !== null,
      heatmapTransport: raw.heatmap === undefined || raw.heatmap === null ? "none" : "sanitized_response_field",
    },
  };
}

export class LegacyAiDetectionAdapter implements ModelDetector {
  readonly id = "ai-detection-service";
  readonly enabled: boolean;

  constructor(private readonly config: LegacyAiDetectionConfig) {
    this.enabled = config.enabled && Boolean(config.url);
  }

  runtimeInfo(): ModelRuntimeInfo {
    return {
      detectorId: this.id,
      enabled: this.enabled,
      device: "remote",
      residency: this.enabled ? "unknown" : "not_loaded",
      admission: this.enabled ? "single_slot_bounded_queue" : "not_configured",
      maxQueue: null,
      microbatchSize: 1,
      resourceClass: "unknown",
    };
  }

  close(): void {}

  async detect(asset: MediaAsset): Promise<ModelDetectionResult> {
    if (!this.enabled || !this.config.url) throw new Error("LEGACY_MODEL_DISABLED");
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    timer.unref?.();
    try {
      const bytes = await readFile(asset.storedPath);
      const response = await fetch(this.config.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
        },
        body: JSON.stringify({
          filename: asset.filename,
          mimeType: asset.mimeType,
          dataBase64: bytes.toString("base64"),
          sha256: asset.sha256,
        }),
      });
      if (!response.ok) throw new Error(`LEGACY_MODEL_HTTP_${response.status}`);
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new Error("LEGACY_MODEL_MALFORMED_RESPONSE"); }
      return parseResult(payload, this.config, Date.now() - startedAt);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error(`LEGACY_MODEL_TIMEOUT:${this.config.timeoutMs}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
