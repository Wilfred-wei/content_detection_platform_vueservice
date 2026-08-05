import assert from "node:assert/strict";
import test from "node:test";

import type { DdaShadowComparisonRecord } from "../src/dda-model-detector.js";
import {
  evaluateDdaShadow,
  parseDdaShadowAuditJsonl,
  parseDdaShadowTruthJsonl,
} from "../src/dda-shadow-evaluation.js";

function record(
  suffix: string,
  baseline: "ai_generated" | "non_ai" | null,
  candidate: "ai_generated" | "non_ai" | null,
): DdaShadowComparisonRecord {
  const baselineCompleted = baseline !== null;
  const candidateCompleted = candidate !== null;
  const comparable = baselineCompleted && candidateCompleted;
  return {
    schemaVersion: "dda-shadow-comparison.v1",
    id: `record-${suffix}`,
    createdAt: "2026-08-01T00:00:00.000Z",
    asset: { id: `asset-${suffix}`, sha256: suffix.repeat(64), mimeType: "image/png", width: 32, height: 32 },
    baseline: {
      role: "active_evidence_route", detectorId: "dda-dinov2-lora", checkpointSha256: "a".repeat(64),
      status: baselineCompleted ? "completed" : "failed", score: baseline === "ai_generated" ? 0.8 : baseline === "non_ai" ? 0.2 : null,
      predictedClass: baseline, latencyMs: baselineCompleted ? Number.parseInt(suffix, 16) * 10 : null,
      error: baselineCompleted ? null : "DDA_TIMEOUT",
    },
    candidate: {
      role: "shadow_only", candidateId: "candidate", candidateStatus: "shadow", detectorId: "dda-dinov2-lora",
      checkpointSha256: "b".repeat(64), manifestSha256: "c".repeat(64),
      status: candidateCompleted ? "completed" : "failed", score: candidate === "ai_generated" ? 0.9 : candidate === "non_ai" ? 0.1 : null,
      predictedClass: candidate, latencyMs: candidateCompleted ? Number.parseInt(suffix, 16) * 20 : null,
      error: candidateCompleted ? null : "DDA_QUEUE_FULL",
    },
    comparison: {
      scoreDeltaCandidateMinusBaseline: comparable
        ? (candidate === "ai_generated" ? 0.9 : 0.1) - (baseline === "ai_generated" ? 0.8 : 0.2)
        : null,
      directionAgreement: comparable ? baseline === candidate ? "agreement" : "disagreement" : "unavailable",
    },
    decisionAuthority: "none",
    productionSwapAuthorized: false,
  };
}

test("summarizes operational shadow drift and optional source-label accuracy without authorizing promotion", () => {
  const records = [
    record("1", "non_ai", "ai_generated"),
    record("2", "non_ai", "non_ai"),
    record("3", "ai_generated", null),
    record("4", null, "ai_generated"),
  ];
  const labels = [
    { assetSha256: "1".repeat(64), label: "ai_generated" as const, subgroup: "modern-generator" },
    { assetSha256: "2".repeat(64), label: "non_ai" as const, subgroup: "real-control" },
    { assetSha256: "3".repeat(64), label: "ai_generated" as const, subgroup: "modern-generator" },
  ];

  const report = evaluateDdaShadow(records, labels, "2026-08-01T01:00:00.000Z");

  assert.equal(report.audit.records, 4);
  assert.equal(report.audit.uniqueAssets, 4);
  assert.equal(report.audit.pairedCompleted, 2);
  assert.equal(report.audit.baselineFailures, 1);
  assert.equal(report.audit.candidateFailures, 1);
  assert.equal(report.audit.directionAgreementRate, 0.5);
  assert.equal(report.labels.matchedRecords, 3);
  assert.equal(report.labels.baseline.accuracy, 2 / 3);
  assert.equal(report.labels.baseline.generatedRecall, 0.5);
  assert.equal(report.labels.baseline.realFalsePositiveRate, 0);
  assert.equal(report.labels.candidate.accuracy, 1);
  assert.ok(Math.abs((report.labels.candidateAccuracyDelta ?? 0) - 1 / 3) < 1e-12);
  assert.equal(report.labels.subgroups["modern-generator"]?.candidate.labeledRecords, 1);
  assert.equal(report.promotion.status, "observational_only");
  assert.equal(report.promotion.promotionAuthorized, false);
  assert.equal(report.promotion.automaticPolicyMutation, false);
});

test("strictly parses audit authority and rejects a promoted shadow record", () => {
  const valid = record("a", "ai_generated", "ai_generated");
  assert.equal(parseDdaShadowAuditJsonl(JSON.stringify(valid)).length, 1);
  assert.throws(
    () => parseDdaShadowAuditJsonl(JSON.stringify({ ...valid, productionSwapAuthorized: true })),
    /audit_contract/,
  );
});

test("deduplicates identical truth labels and rejects conflicting source labels", () => {
  const sha = "f".repeat(64);
  const duplicate = `${JSON.stringify({ assetSha256: sha, label: "ai_generated", subgroup: "g1" })}\n${JSON.stringify({ assetSha256: sha, label: "ai_generated", subgroup: "g1" })}`;
  assert.equal(parseDdaShadowTruthJsonl(duplicate).length, 1);
  const conflicting = `${JSON.stringify({ assetSha256: sha, label: "ai_generated" })}\n${JSON.stringify({ assetSha256: sha, label: "non_ai" })}`;
  assert.throws(() => parseDdaShadowTruthJsonl(conflicting), /truth_conflict/);
});
