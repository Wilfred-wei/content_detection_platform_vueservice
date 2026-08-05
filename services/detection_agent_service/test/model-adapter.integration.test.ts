import assert from "node:assert/strict";
import test from "node:test";

import { decideProvenanceFirst } from "../src/decision-policy.js";
import {
  MODEL_DETECTOR_PROTOCOL_VERSION,
  modelDetectionToEvidence,
  modelDetectorFailureToEvidence,
  type ModelDetectionResult,
} from "../src/model-detector.js";

function result(overrides: Partial<ModelDetectionResult> = {}): ModelDetectionResult {
  return {
    protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
    detectorId: "dda-dinov2-lora",
    detectorVersion: "DDA-official-neurips2025",
    outcome: "detected",
    score: 0.8,
    threshold: 0.5,
    predictedClass: "ai_generated",
    latencyMs: 12,
    preprocessingId: "resize-336-clip-normalize-v1",
    checkpointSha256: "a".repeat(64),
    calibrationStatus: "official_threshold_unverified_for_deployment",
    diagnostics: { device: "cuda:0" },
    ...overrides,
  };
}

test("normalizes a successful model response without allowing diagnostics to overwrite authority fields", () => {
  const evidence = modelDetectionToEvidence("analysis-1", result({
    diagnostics: { score: 0.1, detectorVersion: "hostile", outOfDistribution: false },
  }));
  assert.equal(evidence.status, "detected");
  assert.equal(evidence.strength, "supporting");
  assert.equal(evidence.facts.score, 0.8);
  assert.equal(evidence.facts.detectorVersion, "DDA-official-neurips2025");
  assert.equal(evidence.facts.applicability, "in_distribution");
});

test("normalizes malformed, timeout, unavailable, and version-mismatch failures separately", () => {
  const malformed = modelDetectorFailureToEvidence("analysis-1", "dda-dinov2-lora", new Error("DDA_MALFORMED_RESPONSE:score"));
  const timeout = modelDetectorFailureToEvidence("analysis-1", "dda-dinov2-lora", new Error("DDA_TIMEOUT:25"));
  const unavailable = modelDetectorFailureToEvidence("analysis-1", "dda-dinov2-lora", new Error("DDA_WORKER_START_FAILED:offline"));
  const version = modelDetectorFailureToEvidence("analysis-1", "dda-dinov2-lora", new Error("DDA_MALFORMED_RESPONSE:configured_identity"));

  assert.equal(malformed.status, "error");
  assert.equal(malformed.facts.failureType, "malformed_response");
  assert.equal(malformed.facts.detectionAttempted, true);
  assert.equal(timeout.status, "error");
  assert.equal(timeout.facts.failureType, "timeout");
  assert.equal(timeout.facts.detectionAttempted, true);
  assert.equal(unavailable.status, "detector_unavailable");
  assert.equal(unavailable.facts.failureType, "unavailable");
  assert.equal(unavailable.facts.detectionAttempted, false);
  assert.equal(version.status, "error");
  assert.equal(version.facts.failureType, "version_mismatch");
  assert.equal(version.facts.detectionAttempted, true);
});

test("keeps an out-of-distribution score for audit but removes supporting decision authority", () => {
  const evidence = modelDetectionToEvidence("analysis-1", result({
    diagnostics: { outOfDistribution: true, oodReason: "embedding_distance" },
  }));
  assert.equal(evidence.status, "detected");
  assert.equal(evidence.strength, "none");
  assert.equal(evidence.facts.score, 0.8);
  assert.equal(evidence.facts.outOfDistribution, true);
  assert.equal(evidence.facts.applicability, "out_of_distribution");
  assert.match(evidence.summary, /分布外/);

  const decision = decideProvenanceFirst([evidence], "2026-08-02T00:00:00.000Z", true);
  assert.equal(decision.basis.some((item) => item.includes("SUPPORTING_SIGNAL")), false);
});

test("preserves an explicit unavailable worker response without inventing a negative detection", () => {
  const evidence = modelDetectionToEvidence("analysis-1", result({
    outcome: "unavailable",
    score: null,
    threshold: null,
    predictedClass: null,
    calibrationStatus: "unavailable",
    diagnostics: { reason: "MODEL_NOT_LOADED" },
  }));
  assert.equal(evidence.status, "unavailable");
  assert.equal(evidence.strength, "none");
  assert.equal(evidence.facts.score, null);
  assert.equal(evidence.facts.detectionAttempted, false);
});
