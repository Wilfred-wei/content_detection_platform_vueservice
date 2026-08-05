import assert from "node:assert/strict";
import test from "node:test";

import { parseModelCascadePolicy, planModelCascade, shouldEscalateModelCascade } from "../src/model-cascade.js";
import { MODEL_DETECTOR_PROTOCOL_VERSION, type ModelDetector } from "../src/model-detector.js";

const policy = parseModelCascadePolicy({
  schemaVersion: "model-cascade-policy.v1",
  policyVersion: "test-v1",
  primaryDetectorId: "primary",
  complementaryDetectorIds: ["secondary", "tertiary"],
  nearBoundaryMargin: 0.1,
  escalateUncalibrated: true,
  escalateUnavailable: true,
  escalateOutOfDistribution: true,
  maxComplementaryDetectors: 2,
  fusionPolicy: "none_preserve_disagreement",
});

function detector(id: string): ModelDetector {
  return { id, enabled: true, async detect() { throw new Error("not used"); } };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
    detectorId: "primary",
    detectorVersion: "test",
    outcome: "detected" as const,
    score: 0.9,
    threshold: 0.5,
    predictedClass: "ai_generated" as const,
    latencyMs: 1,
    preprocessingId: "test",
    checkpointSha256: null,
    calibrationStatus: "official_threshold_unverified_for_deployment" as const,
    diagnostics: {},
    ...overrides,
  };
}

test("selects a registered primary and escalates provisional results", () => {
  const plan = planModelCascade([detector("tertiary"), detector("primary"), detector("secondary")], policy);
  assert.equal(plan.primary?.id, "primary");
  assert.deepEqual(plan.complementary.map((item) => item.id), ["secondary", "tertiary"]);
  const decision = shouldEscalateModelCascade(result(), policy);
  assert.equal(decision.escalate, true);
  assert.ok(decision.reasons.includes("PRIMARY_UNCALIBRATED"));
});

test("requires an explicit non-voting fusion policy", () => {
  assert.throws(() => parseModelCascadePolicy({
    schemaVersion: "model-cascade-policy.v1",
    policyVersion: "test-v1",
    primaryDetectorId: "primary",
    complementaryDetectorIds: ["secondary"],
    nearBoundaryMargin: 0.1,
    escalateUncalibrated: true,
    escalateUnavailable: true,
    escalateOutOfDistribution: true,
    maxComplementaryDetectors: 1,
    fusionPolicy: "majority_vote",
  }), /fusionPolicy/);
});

test("escalates only on declared boundary, OOD, or unavailable conditions after calibration", () => {
  const calibrated = result({ calibrationStatus: "deployment_calibrated", score: 0.9 });
  assert.equal(shouldEscalateModelCascade(calibrated, policy).escalate, false);
  assert.ok(shouldEscalateModelCascade(result({ calibrationStatus: "deployment_calibrated", score: 0.53 }), policy).reasons.includes("PRIMARY_NEAR_BOUNDARY"));
  assert.ok(shouldEscalateModelCascade(result({ calibrationStatus: "deployment_calibrated", diagnostics: { ood: true } }), policy).reasons.includes("PRIMARY_OUT_OF_DISTRIBUTION"));
  assert.ok(shouldEscalateModelCascade(undefined, policy).reasons.includes("PRIMARY_UNAVAILABLE_OR_NO_SCORE"));
});
