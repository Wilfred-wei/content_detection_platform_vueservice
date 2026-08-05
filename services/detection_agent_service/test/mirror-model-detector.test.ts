import assert from "node:assert/strict";
import test from "node:test";

import { assertMirrorWorkerResult } from "../src/mirror-model-detector.js";
import { MODEL_DETECTOR_PROTOCOL_VERSION } from "../src/model-detector.js";

function validResult() {
  return {
    protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
    requestId: "request-1",
    detectorId: "mirror-dinov3-hplus",
    detectorVersion: "MIRROR-dinov3-hplus-18c56efa",
    outcome: "detected",
    score: 0.75,
    threshold: 0.5,
    predictedClass: "ai_generated",
    latencyMs: 30,
    preprocessingId: "mirror-short512-center224-jpeg96-v1",
    checkpointSha256: "a".repeat(64),
    calibrationStatus: "experimental_threshold_unverified_for_deployment",
    diagnostics: {
      device: "cuda:1",
      memoryBankSha256: "b".repeat(64),
      backboneSha256: "c".repeat(64),
    },
  };
}

test("accepts a strict experimental MIRROR worker response", () => {
  assert.equal(assertMirrorWorkerResult(validResult()).score, 0.75);
});

test("rejects malformed MIRROR identity, calibration, and scores", () => {
  assert.throws(() => assertMirrorWorkerResult({ ...validResult(), detectorId: "dda-dinov2-lora" }), /detector_id/);
  assert.throws(() => assertMirrorWorkerResult({ ...validResult(), calibrationStatus: "official_threshold_unverified_for_deployment" }), /identity/);
  assert.throws(() => assertMirrorWorkerResult({ ...validResult(), score: -0.1 }), /score/);
});
