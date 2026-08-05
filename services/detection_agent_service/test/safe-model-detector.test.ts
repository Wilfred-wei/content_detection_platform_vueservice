import assert from "node:assert/strict";
import test from "node:test";

import { assertSafeWorkerResult } from "../src/safe-model-detector.js";
import { MODEL_DETECTOR_PROTOCOL_VERSION } from "../src/model-detector.js";

function validResult() {
  return {
    protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
    requestId: "request-1",
    detectorId: "safe-wavelet-resnet",
    detectorVersion: "SAFE-official-kdd2025-4e998724",
    outcome: "detected",
    score: 0.75,
    threshold: 0.5,
    predictedClass: "ai_generated",
    latencyMs: 12,
    preprocessingId: "safe-center-crop256-totensor-v1",
    checkpointSha256: "a".repeat(64),
    calibrationStatus: "official_threshold_unverified_for_deployment",
    diagnostics: {
      device: "cuda:3",
      sourceRevision: "b".repeat(40),
      sourceSha256: "c".repeat(64),
    },
  };
}

test("accepts a strict SAFE worker response", () => {
  assert.equal(assertSafeWorkerResult(validResult()).score, 0.75);
});

test("accepts the official strict threshold boundary as non-AI direction", () => {
  const result = assertSafeWorkerResult({
    ...validResult(),
    outcome: "not_detected",
    score: 0.5,
    predictedClass: "non_ai",
  });
  assert.equal(result.predictedClass, "non_ai");
});

test("rejects malformed SAFE identity, score, and direction", () => {
  assert.throws(() => assertSafeWorkerResult({ ...validResult(), detectorId: "dda-dinov2-lora" }), /detector_id/);
  assert.throws(() => assertSafeWorkerResult({ ...validResult(), score: 1.1 }), /score/);
  assert.throws(() => assertSafeWorkerResult({ ...validResult(), score: 0.2 }), /score_direction/);
  assert.throws(() => assertSafeWorkerResult({ ...validResult(), preprocessingId: "resize-256" }), /identity/);
});
