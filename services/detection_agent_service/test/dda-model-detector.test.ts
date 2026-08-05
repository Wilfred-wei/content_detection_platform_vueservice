import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { DdaShadowConfig } from "../src/config.js";
import { assertDdaWorkerResult, DdaShadowModelDetector } from "../src/dda-model-detector.js";
import type { MediaAsset } from "../src/analysis-types.js";
import { MODEL_DETECTOR_PROTOCOL_VERSION, type ModelDetectionResult, type ModelDetector } from "../src/model-detector.js";

function validResult() {
  return {
    protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
    requestId: "request-1",
    detectorId: "dda-dinov2-lora",
    detectorVersion: "DDA-official-neurips2025",
    outcome: "detected",
    score: 0.75,
    threshold: 0.5,
    predictedClass: "ai_generated",
    latencyMs: 30,
    preprocessingId: "resize-336-clip-normalize-v1",
    checkpointSha256: "a".repeat(64),
    calibrationStatus: "official_threshold_unverified_for_deployment",
    diagnostics: { device: "cuda:1" },
  };
}

test("accepts a bounded DDA worker response", () => {
  assert.equal(assertDdaWorkerResult(validResult()).score, 0.75);
});

test("rejects malformed and out-of-range DDA worker responses", () => {
  assert.throws(() => assertDdaWorkerResult({ ...validResult(), protocolVersion: "other" }), /protocol_version/);
  assert.throws(() => assertDdaWorkerResult({ ...validResult(), score: 1.2 }), /score/);
  assert.throws(() => assertDdaWorkerResult({ ...validResult(), diagnostics: [] }), /diagnostics/);
});

function detection(score: number, checkpointSha256: string, detectorVersion: string): ModelDetectionResult {
  return {
    ...validResult(),
    detectorVersion,
    outcome: score >= 0.5 ? "detected" : "not_detected",
    score,
    predictedClass: score >= 0.5 ? "ai_generated" : "non_ai",
    checkpointSha256,
  };
}

function shadowConfig(auditLogPath: string): DdaShadowConfig {
  return {
    enabled: true,
    candidateId: "universal-test-step128",
    candidateStatus: "two_seed_offline_gates_passed_not_production_deployed",
    candidateManifestPath: "/models/selected_candidate.json",
    candidateManifestSha256: "d".repeat(64),
    auditLogPath,
    candidate: {
      enabled: true,
      uvCommand: "uv",
      workerProjectDir: "/worker",
      sourceDir: "/source",
      checkpointPath: "/models/candidate.pth",
      checkpointSha256: "c".repeat(64),
      dinov2HubDir: "/dinov2",
      device: "cuda:0",
      timeoutMs: 30_000,
      startupTimeoutMs: 180_000,
      maxQueue: 8,
      detectorVersion: "DDA-universal-universal-test-step128",
    },
  };
}

const asset: MediaAsset = {
  schemaVersion: "1.0.0",
  id: "asset-1",
  filename: "private-name.png",
  mimeType: "image/png",
  sizeBytes: 42,
  sha256: "e".repeat(64),
  width: 32,
  height: 24,
  storedPath: "/private/image.png",
  createdAt: "2026-08-01T00:00:00.000Z",
};

test("returns the active DDA result without waiting for the shadow candidate and writes a private comparison", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dda-shadow-audit-"));
  const auditLogPath = join(directory, "shadow.jsonl");
  const baselineResult = detection(0.2, "b".repeat(64), "DDA-official-neurips2025");
  let releaseCandidate!: (result: ModelDetectionResult) => void;
  const candidateResult = new Promise<ModelDetectionResult>((resolve) => { releaseCandidate = resolve; });
  const baseline: ModelDetector = { id: "dda-dinov2-lora", enabled: true, async detect() { return baselineResult; } };
  const candidate: ModelDetector = { id: "dda-dinov2-lora", enabled: true, async detect() { return candidateResult; } };
  const detector = new DdaShadowModelDetector(baseline, candidate, shadowConfig(auditLogPath));

  assert.strictEqual(await detector.detect(asset), baselineResult);
  releaseCandidate(detection(0.8, "c".repeat(64), "DDA-universal-universal-test-step128"));
  await detector.drainAudit();

  const record = JSON.parse(readFileSync(auditLogPath, "utf8").trim()) as Record<string, any>;
  assert.equal(record.schemaVersion, "dda-shadow-comparison.v1");
  assert.equal(record.asset.sha256, asset.sha256);
  assert.equal("filename" in record.asset, false);
  assert.equal("storedPath" in record.asset, false);
  assert.equal(record.baseline.score, 0.2);
  assert.equal(record.candidate.score, 0.8);
  assert.equal(record.comparison.directionAgreement, "disagreement");
  assert.ok(Math.abs(record.comparison.scoreDeltaCandidateMinusBaseline - 0.6) < 1e-12);
  assert.equal(record.decisionAuthority, "none");
  assert.equal(record.productionSwapAuthorized, false);
});

test("isolates candidate and audit persistence failures from the active DDA result", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dda-shadow-audit-failure-"));
  const invalidParent = join(directory, "not-a-directory");
  writeFileSync(invalidParent, "file");
  const baselineResult = detection(0.7, "b".repeat(64), "DDA-official-neurips2025");
  const baseline: ModelDetector = { id: "dda-dinov2-lora", enabled: true, async detect() { return baselineResult; } };
  const candidate: ModelDetector = { id: "dda-dinov2-lora", enabled: true, async detect() { throw new Error("DDA_TIMEOUT:1"); } };
  const detector = new DdaShadowModelDetector(baseline, candidate, shadowConfig(join(invalidParent, "audit.jsonl")));

  assert.strictEqual(await detector.detect(asset), baselineResult);
  await detector.drainAudit();
  assert.match(detector.lastAuditError() || "", /(ENOTDIR|EEXIST)/);
});

test("records a typed candidate failure without changing the active DDA result", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dda-shadow-candidate-failure-"));
  const auditLogPath = join(directory, "shadow.jsonl");
  const baselineResult = detection(0.7, "b".repeat(64), "DDA-official-neurips2025");
  const baseline: ModelDetector = { id: "dda-dinov2-lora", enabled: true, async detect() { return baselineResult; } };
  const candidate: ModelDetector = { id: "dda-dinov2-lora", enabled: true, async detect() { throw new Error("DDA_TIMEOUT:1"); } };
  const detector = new DdaShadowModelDetector(baseline, candidate, shadowConfig(auditLogPath));

  assert.strictEqual(await detector.detect(asset), baselineResult);
  await detector.drainAudit();
  const record = JSON.parse(readFileSync(auditLogPath, "utf8").trim()) as Record<string, any>;
  assert.equal(record.baseline.status, "completed");
  assert.equal(record.candidate.status, "failed");
  assert.match(record.candidate.error, /DDA_TIMEOUT/);
  assert.equal(record.comparison.directionAgreement, "unavailable");
});

test("keeps baseline authority for a true shadow batch and audits each asset", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dda-shadow-batch-"));
  const auditLogPath = join(directory, "shadow.jsonl");
  const baselineResults = [detection(0.2, "b".repeat(64), "DDA-official-neurips2025"), detection(0.3, "b".repeat(64), "DDA-official-neurips2025")];
  const candidateResults = [detection(0.8, "c".repeat(64), "DDA-universal-universal-test-step128"), detection(0.7, "c".repeat(64), "DDA-universal-universal-test-step128")];
  const baseline: ModelDetector = {
    id: "dda-dinov2-lora",
    enabled: true,
    async detect() { return baselineResults[0]; },
    async detectBatch() { return baselineResults; },
  };
  const candidate: ModelDetector = {
    id: "dda-dinov2-lora",
    enabled: true,
    async detect() { return candidateResults[0]; },
    async detectBatch() { return candidateResults; },
  };
  const detector = new DdaShadowModelDetector(baseline, candidate, shadowConfig(auditLogPath));
  const secondAsset = { ...asset, id: "asset-2", sha256: "f".repeat(64) };
  const result = await detector.detectBatch([asset, secondAsset]);
  assert.equal(result.length, 2);
  assert.strictEqual(result[0], baselineResults[0]);
  assert.strictEqual(result[1], baselineResults[1]);
  await detector.drainAudit();
  const records = readFileSync(auditLogPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, any>);
  assert.equal(records.length, 2);
  assert.equal(records[0].baseline.score, 0.2);
  assert.equal(records[1].candidate.score, 0.7);
  assert.equal(records[0].decisionAuthority, "none");
});
