import assert from "node:assert/strict";
import test from "node:test";

import {
  getRuntimeEligibleModelCandidates,
  loadModelCandidateRegistry,
  validateModelCandidateRegistry,
} from "../src/model-registry.js";

test("loads a dated model registry with DDA, SAFE, MIRROR, and REM", () => {
  const registry = loadModelCandidateRegistry();
  assert.equal(registry.researchedAt, "2026-08-03");
  assert.equal(registry.policy.commercialUseRequired, true);
  assert.deepEqual(registry.candidates.map((candidate) => candidate.id), [
    "dda-dinov2-lora",
    "safe-wavelet-resnet",
    "mirror-dinov3-hplus",
    "rem-dinov3-hplus",
  ]);
});

test("admits DDA and SAFE provisionally, MIRROR experimentally, and keeps REM unavailable", () => {
  const runnable = getRuntimeEligibleModelCandidates();
  assert.deepEqual(runnable.map((candidate) => candidate.id), [
    "dda-dinov2-lora",
    "safe-wavelet-resnet",
    "mirror-dinov3-hplus",
  ]);

  const safe = loadModelCandidateRegistry().candidates.find((candidate) => candidate.id === "safe-wavelet-resnet");
  const mirror = loadModelCandidateRegistry().candidates.find((candidate) => candidate.id === "mirror-dinov3-hplus");
  const rem = loadModelCandidateRegistry().candidates.find((candidate) => candidate.id === "rem-dinov3-hplus");
  assert.equal(safe?.runtimeEligibility, "provisional_supporting");
  assert.equal(safe?.license.code, "Apache-2.0");
  assert.equal(safe?.calibration.status, "official_threshold_unverified_for_deployment");
  assert.ok(safe?.artifacts.every((artifact) => artifact.sha256));
  assert.equal(mirror?.runtimeEligibility, "experimental_supporting");
  assert.equal(mirror?.license.commercialUse, "blocked");
  assert.ok(mirror?.artifacts.every((artifact) => artifact.sha256));
  assert.equal(rem?.runtimeEligibility, "unavailable");
  assert.equal(rem?.releaseStatus, "paper_only");
});

test("rejects enabling a model with unverified artifacts", () => {
  const registry = structuredClone(loadModelCandidateRegistry());
  const mirror = registry.candidates.find((candidate) => candidate.id === "mirror-dinov3-hplus");
  assert.ok(mirror);
  mirror.runtimeEligibility = "provisional_supporting";
  mirror.runtime.adapterId = "dda-dinov2-lora-v1";
  mirror.runtime.transport = "process";
  assert.throws(() => validateModelCandidateRegistry(registry), /licenseBlockedRuntime|artifactBlockedRuntime/);
});

test("rejects an unknown executable model adapter", () => {
  const registry = structuredClone(loadModelCandidateRegistry());
  const dda = registry.candidates.find((candidate) => candidate.id === "dda-dinov2-lora");
  assert.ok(dda);
  dda.runtime.adapterId = "registry-supplied-command";
  assert.throws(() => validateModelCandidateRegistry(registry), /unknownAdapter/);
});

test("allows only a pinned production-blocked experimental MIRROR registration", () => {
  const registry = structuredClone(loadModelCandidateRegistry());
  const mirror = registry.candidates.find((candidate) => candidate.id === "mirror-dinov3-hplus");
  assert.ok(mirror);
  mirror.runtimeEligibility = "experimental_supporting";
  mirror.runtime.adapterId = "mirror-dinov3-hplus-v1";
  mirror.runtime.transport = "process";
  mirror.calibration.status = "experimental_threshold_unverified_for_deployment";
  mirror.artifacts.forEach((artifact) => {
    artifact.availability = "available_local";
    artifact.sha256 = "a".repeat(64);
  });
  assert.doesNotThrow(() => validateModelCandidateRegistry(registry));

  mirror.productionEligibility.status = "candidate";
  assert.throws(() => validateModelCandidateRegistry(registry), /invalidExperimentalRuntime/);
});
