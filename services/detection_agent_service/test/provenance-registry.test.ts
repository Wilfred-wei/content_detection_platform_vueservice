import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getProductionRunnableSchemes,
  loadProvenanceRegistry,
  validateProvenanceRegistry,
} from "../src/provenance-registry.js";

test("loads a dated, versioned provenance registry with required governance fields", () => {
  const registry = loadProvenanceRegistry();
  assert.equal(registry.researchedAt, "2026-07-29");
  assert.equal(registry.policy.commercialApisAllowed, false);
  assert.equal(registry.policy.commercialUseRequired, true);
  assert.equal(registry.schemes.length >= 17, true);
  assert.ok(registry.schemes.every((scheme) => scheme.primarySources.length > 0));
  assert.ok(registry.schemes.every((scheme) => scheme.compatibility.length > 0));
  assert.ok(registry.schemes.every((scheme) => scheme.shortCircuit.policy !== "eligible"));
});

test("keeps closed and commercial vendor detectors out of the local runtime", () => {
  const runnable = getProductionRunnableSchemes();
  assert.ok(runnable.some((scheme) => scheme.id === "c2pa"));
  assert.ok(runnable.some((scheme) => scheme.id === "sdxl-invisible-watermark"));
  assert.ok(runnable.some((scheme) => scheme.id === "adobe-trustmark"));
  assert.ok(runnable.some((scheme) => scheme.id === "meta-videoseal-v1"));
  assert.ok(runnable.some((scheme) => scheme.id === "meta-watermark-anything-mit"));
  assert.ok(runnable.some((scheme) => scheme.id === "classic-dwt-dct-svd"));
  assert.ok(runnable.some((scheme) => scheme.id === "classic-rivagan-32"));
  assert.ok(!runnable.some((scheme) => scheme.id === "meta-pixelseal"));
  assert.ok(!runnable.some((scheme) => scheme.id === "meta-chunkyseal"));
  assert.ok(!runnable.some((scheme) => scheme.family === "closed_vendor_verifier"));
  assert.ok(!runnable.some((scheme) => scheme.family === "commercial_vendor_api"));
});

test("rejects an approved production registration outside the code-owned adapter allowlist", () => {
  const registry = structuredClone(loadProvenanceRegistry());
  const detector = registry.schemes.find((scheme) => scheme.id === "sdxl-invisible-watermark");
  assert.ok(detector);
  detector.execution.adapterId = "arbitrary-module-from-registry";
  assert.throws(() => validateProvenanceRegistry(registry), /unknownAdapter/);
});

test("rejects an unknown adapter even when the registry labels it as a candidate", () => {
  const registry = structuredClone(loadProvenanceRegistry());
  const candidate = registry.schemes.find((scheme) => scheme.id === "adobe-trustmark");
  assert.ok(candidate);
  candidate.execution.adapterId = "plugin-from-registry";
  candidate.execution.transport = "process";

  assert.throws(() => validateProvenanceRegistry(registry), /unknownAdapter/);
});

test("pins TrustMark P/Q, rotation, calibration, and payload-registry controls", () => {
  const detector = loadProvenanceRegistry().schemes.find((scheme) => scheme.id === "adobe-trustmark");
  assert.ok(detector);
  assert.equal(detector.execution.adapterId, "trustmark-pq-v1");
  assert.equal(detector.execution.transport, "process");
  assert.equal(detector.execution.profiles[0]?.settings.models, "P,Q");
  assert.equal(detector.execution.profiles[0]?.settings.rotations, "0,90,180,270");
  assert.equal(detector.execution.profiles[0]?.settings.calibrationApproved, false);
  assert.equal(detector.shortCircuit.policy, "candidate_after_gate");
  assert.ok(detector.execution.artifacts.some((artifact) => artifact.id === "trustmark-registered-payloads-v1"));
});

test("TrustMark registration digests match the committed worker controls", () => {
  const detector = loadProvenanceRegistry().schemes.find((scheme) => scheme.id === "adobe-trustmark");
  assert.ok(detector);
  const paths = new Map([
    ["trustmark-model-artifact-manifest", "../workers/trustmark/resources/model-artifacts.v1.json"],
    ["trustmark-registered-payloads-v1", "../workers/trustmark/resources/registered-payloads.v1.json"],
    ["trustmark-uv-lock", "../workers/trustmark/uv.lock"],
  ]);
  for (const [artifactId, relativePath] of paths) {
    const artifact = detector.execution.artifacts.find((item) => item.id === artifactId);
    assert.ok(artifact?.sha256);
    const path = fileURLToPath(new URL(relativePath, import.meta.url));
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), artifact.sha256);
  }
});

test("pins commercial Meta profiles and excludes noncommercial WAM weights", () => {
  const registry = loadProvenanceRegistry();
  const videoSeal = registry.schemes.find((scheme) => scheme.id === "meta-videoseal-v1");
  const wamMit = registry.schemes.find((scheme) => scheme.id === "meta-watermark-anything-mit");
  const wamCoco = registry.schemes.find((scheme) => scheme.id === "meta-watermark-anything-coco");
  assert.equal(videoSeal?.execution.adapterId, "meta-watermarks-v1");
  assert.equal(videoSeal?.execution.profiles[0]?.id, "videoseal-v1");
  assert.equal(wamMit?.execution.adapterId, "meta-watermarks-v1");
  assert.equal(wamMit?.execution.profiles[0]?.id, "wam-mit");
  assert.equal(wamCoco?.productionEligibility.status, "prohibited");
  assert.equal(wamCoco?.execution.adapterId, null);
});

test("Meta registration digests match the committed worker controls", () => {
  const detector = loadProvenanceRegistry().schemes.find((scheme) => scheme.id === "meta-videoseal-v1");
  assert.ok(detector);
  const paths = new Map([
    ["meta-watermarks-model-artifact-manifest", "../workers/meta_watermarks/resources/model-artifacts.v1.json"],
    ["meta-watermarks-registered-payloads-v1", "../workers/meta_watermarks/resources/registered-payloads.v1.json"],
    ["meta-watermarks-uv-lock", "../workers/meta_watermarks/uv.lock"],
  ]);
  for (const [artifactId, relativePath] of paths) {
    const artifact = detector.execution.artifacts.find((item) => item.id === artifactId);
    assert.ok(artifact?.sha256);
    const path = fileURLToPath(new URL(relativePath, import.meta.url));
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), artifact.sha256);
  }
});

test("classic registered-payload schemes pin their dependency and model controls", () => {
  const registry = loadProvenanceRegistry();
  const svd = registry.schemes.find((scheme) => scheme.id === "classic-dwt-dct-svd");
  const rivagan = registry.schemes.find((scheme) => scheme.id === "classic-rivagan-32");
  assert.equal(svd?.execution.adapterId, "classic-invisible-watermarks-v1");
  assert.equal(svd?.execution.profiles[0]?.settings.method, "dwtDctSvd");
  assert.equal(rivagan?.execution.profiles[0]?.settings.method, "rivaGan");
  assert.ok(rivagan?.execution.artifacts.some((artifact) => artifact.id === "rivagan-decoder-onnx"));

  const controls = new Map([
    ["watermark-classic-uv-lock", "../workers/watermark_classic/uv.lock"],
    ["classic-watermark-model-artifact-manifest", "../workers/watermark_classic/resources/model-artifacts.v1.json"],
  ]);
  for (const [artifactId, relativePath] of controls) {
    const artifact = rivagan?.execution.artifacts.find((item) => item.id === artifactId);
    assert.ok(artifact?.sha256);
    const path = fileURLToPath(new URL(relativePath, import.meta.url));
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), artifact.sha256);
  }
});

test("keeps noncommercial reverse-engineered detectors non-runnable", () => {
  const registry = loadProvenanceRegistry();
  const detector = registry.schemes.find((scheme) => scheme.id === "google-synthid-reverse");
  assert.equal(detector?.productionEligibility.status, "prohibited");
  assert.equal(detector?.execution.adapterId, null);
  assert.ok(!getProductionRunnableSchemes().some((scheme) => scheme.id === detector?.id));
});

test("rejects uncalibrated short-circuit eligibility", () => {
  const registry = structuredClone(loadProvenanceRegistry());
  registry.schemes[0].shortCircuit.policy = "eligible";
  registry.schemes[0].calibration.status = "required";
  assert.throws(() => validateProvenanceRegistry(registry), /uncalibratedShortCircuit/);
});

test("rejects a closed manual verifier registered as runnable", () => {
  const registry = structuredClone(loadProvenanceRegistry());
  const verifier = registry.schemes.find((scheme) => scheme.id === "openai-verify");
  assert.ok(verifier);
  verifier.runtimeEligibility = "planned_local";
  assert.throws(() => validateProvenanceRegistry(registry), /closedVerifierRuntime/);
});
