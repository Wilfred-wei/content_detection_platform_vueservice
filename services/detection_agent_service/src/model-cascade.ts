import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ModelDetectionResult, ModelDetector } from "./model-detector.js";

export interface ModelCascadePolicy {
  schemaVersion: "model-cascade-policy.v1";
  policyVersion: string;
  primaryDetectorId: string;
  complementaryDetectorIds: string[];
  nearBoundaryMargin: number;
  escalateUncalibrated: boolean;
  escalateUnavailable: boolean;
  escalateOutOfDistribution: boolean;
  maxComplementaryDetectors: number;
  fusionPolicy: "none_preserve_disagreement";
}

export interface ModelCascadePlan {
  primary: ModelDetector | null;
  complementary: ModelDetector[];
  reason: string;
}

const POLICY_PATH = fileURLToPath(new URL("../resources/model-cascade-policy.v1.json", import.meta.url));

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 160 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`INVALID_MODEL_CASCADE_POLICY:${field}`);
  return value.trim();
}

function ratio(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`INVALID_MODEL_CASCADE_POLICY:${field}`);
  return value;
}

export function parseModelCascadePolicy(value: unknown): ModelCascadePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_MODEL_CASCADE_POLICY:root");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== "model-cascade-policy.v1") throw new Error("INVALID_MODEL_CASCADE_POLICY:schemaVersion");
  if (!Array.isArray(raw.complementaryDetectorIds) || raw.complementaryDetectorIds.length === 0) throw new Error("INVALID_MODEL_CASCADE_POLICY:complementaryDetectorIds");
  const complementaryDetectorIds = raw.complementaryDetectorIds.map((id, index) => text(id, `complementaryDetectorIds:${index}`));
  if (new Set(complementaryDetectorIds).size !== complementaryDetectorIds.length) throw new Error("INVALID_MODEL_CASCADE_POLICY:duplicate_detector");
  if (typeof raw.escalateUncalibrated !== "boolean" || typeof raw.escalateUnavailable !== "boolean" || typeof raw.escalateOutOfDistribution !== "boolean") throw new Error("INVALID_MODEL_CASCADE_POLICY:flags");
  if (raw.fusionPolicy !== "none_preserve_disagreement") throw new Error("INVALID_MODEL_CASCADE_POLICY:fusionPolicy");
  if (!Number.isInteger(raw.maxComplementaryDetectors) || (raw.maxComplementaryDetectors as number) < 1 || (raw.maxComplementaryDetectors as number) > complementaryDetectorIds.length) throw new Error("INVALID_MODEL_CASCADE_POLICY:maxComplementaryDetectors");
  const maxComplementaryDetectors = raw.maxComplementaryDetectors as number;
  return {
    schemaVersion: "model-cascade-policy.v1",
    policyVersion: text(raw.policyVersion, "policyVersion"),
    primaryDetectorId: text(raw.primaryDetectorId, "primaryDetectorId"),
    complementaryDetectorIds,
    nearBoundaryMargin: ratio(raw.nearBoundaryMargin, "nearBoundaryMargin"),
    escalateUncalibrated: raw.escalateUncalibrated,
    escalateUnavailable: raw.escalateUnavailable,
    escalateOutOfDistribution: raw.escalateOutOfDistribution,
    maxComplementaryDetectors,
    fusionPolicy: "none_preserve_disagreement",
  };
}

let cachedPolicy: ModelCascadePolicy | undefined;
export function loadModelCascadePolicy(): ModelCascadePolicy {
  if (!cachedPolicy) cachedPolicy = parseModelCascadePolicy(JSON.parse(readFileSync(POLICY_PATH, "utf8")));
  return cachedPolicy;
}

export function planModelCascade(detectors: readonly ModelDetector[], policy: ModelCascadePolicy = loadModelCascadePolicy()): ModelCascadePlan {
  const enabled = detectors.filter((detector) => detector.enabled);
  if (!enabled.length) return { primary: null, complementary: [], reason: "NO_ENABLED_DETECTOR" };
  const primary = enabled.find((detector) => detector.id === policy.primaryDetectorId) || enabled[0];
  const complementary = policy.complementaryDetectorIds
    .map((id) => enabled.find((detector) => detector.id === id))
    .filter((detector): detector is ModelDetector => detector !== undefined)
    .filter((detector) => detector.id !== primary.id)
    .slice(0, policy.maxComplementaryDetectors);
  const reason = primary.id === policy.primaryDetectorId ? "REGISTERED_PRIMARY" : "PRIMARY_FALLBACK_TO_FIRST_ENABLED";
  return { primary, complementary, reason };
}

export function shouldEscalateModelCascade(result: ModelDetectionResult | undefined, policy: ModelCascadePolicy = loadModelCascadePolicy()): { escalate: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!result || !["detected", "not_detected"].includes(result.outcome) || result.score === null) {
    if (policy.escalateUnavailable) reasons.push("PRIMARY_UNAVAILABLE_OR_NO_SCORE");
  } else {
    // Current adapters expose only provisional calibration states. A future
    // deployment-calibrated adapter must explicitly opt into this value.
    if (policy.escalateUncalibrated && (result.calibrationStatus as string) !== "deployment_calibrated") reasons.push("PRIMARY_UNCALIBRATED");
    if (typeof result.threshold === "number" && Math.abs(result.score - result.threshold) <= policy.nearBoundaryMargin) reasons.push("PRIMARY_NEAR_BOUNDARY");
    const diagnostics = result.diagnostics;
    if (policy.escalateOutOfDistribution && (diagnostics.ood === true || diagnostics.outOfDistribution === true || (typeof diagnostics.oodScore === "number" && diagnostics.oodScore >= 0.5))) {
      reasons.push("PRIMARY_OUT_OF_DISTRIBUTION");
    }
  }
  return { escalate: reasons.length > 0, reasons };
}
