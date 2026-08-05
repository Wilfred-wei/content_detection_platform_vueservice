import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { DdaShadowComparisonRecord } from "../src/dda-model-detector.js";
import {
  assessDdaShadowReview,
  parseDdaShadowReviewProfile,
  selectDdaShadowReviewWindow,
  writePrivateDdaShadowReviewSnapshot,
  type DdaShadowReviewProfile,
} from "../src/dda-shadow-review.js";

const BASELINE_SHA = "a".repeat(64);
const CANDIDATE_SHA = "b".repeat(64);
const MANIFEST_SHA = "c".repeat(64);

function profileValue(): Record<string, unknown> {
  return {
    schemaVersion: "dda-shadow-review-profile.v1",
    profileId: "test-review.v1",
    baseline: { detectorId: "dda-dinov2-lora", checkpointSha256: BASELINE_SHA },
    candidate: {
      candidateId: "candidate-v1",
      detectorId: "dda-dinov2-lora",
      checkpointSha256: CANDIDATE_SHA,
      manifestSha256: MANIFEST_SHA,
    },
    window: { minimumObservationHours: 2, maximumRecords: 100 },
    minimums: {
      uniqueAssets: 4,
      pairedCompletionRate: 1,
      labeledRecords: 4,
      realRecords: 2,
      generatedRecords: 2,
      qualifyingSubgroups: 1,
      labeledPerClassPerSubgroup: 2,
      candidateGeneratedRecall: 0.8,
      candidateAccuracyDelta: 0,
    },
    maximums: {
      candidateFailureRate: 0,
      candidateRealFalsePositiveRate: 0,
      candidateP95LatencyRatio: 1.25,
    },
  };
}

function record(
  suffix: string,
  hour: number,
  baseline: "ai_generated" | "non_ai",
  candidate: "ai_generated" | "non_ai",
): DdaShadowComparisonRecord {
  const baselineScore = baseline === "ai_generated" ? 0.8 : 0.2;
  const candidateScore = candidate === "ai_generated" ? 0.9 : 0.1;
  return {
    schemaVersion: "dda-shadow-comparison.v1",
    id: `record-${suffix}`,
    createdAt: `2026-08-01T0${hour}:00:00.000Z`,
    asset: { id: `asset-${suffix}`, sha256: suffix.repeat(64), mimeType: "image/png", width: 32, height: 32 },
    baseline: {
      role: "active_evidence_route",
      detectorId: "dda-dinov2-lora",
      checkpointSha256: BASELINE_SHA,
      status: "completed",
      score: baselineScore,
      predictedClass: baseline,
      latencyMs: 100,
      error: null,
    },
    candidate: {
      role: "shadow_only",
      candidateId: "candidate-v1",
      candidateStatus: "shadow",
      detectorId: "dda-dinov2-lora",
      checkpointSha256: CANDIDATE_SHA,
      manifestSha256: MANIFEST_SHA,
      status: "completed",
      score: candidateScore,
      predictedClass: candidate,
      latencyMs: 110,
      error: null,
    },
    comparison: {
      scoreDeltaCandidateMinusBaseline: candidateScore - baselineScore,
      directionAgreement: candidate === baseline ? "agreement" : "disagreement",
    },
    decisionAuthority: "none",
    productionSwapAuthorized: false,
  };
}

function fixture(): {
  records: DdaShadowComparisonRecord[];
  labels: Array<{ assetSha256: string; label: "ai_generated" | "non_ai"; subgroup: string }>;
  profile: DdaShadowReviewProfile;
} {
  const records = [
    record("1", 0, "non_ai", "non_ai"),
    record("2", 1, "ai_generated", "non_ai"),
    record("3", 2, "non_ai", "ai_generated"),
    record("4", 3, "ai_generated", "ai_generated"),
  ];
  const labels = [
    { assetSha256: "1".repeat(64), label: "non_ai" as const, subgroup: "domain-a" },
    { assetSha256: "2".repeat(64), label: "non_ai" as const, subgroup: "domain-a" },
    { assetSha256: "3".repeat(64), label: "ai_generated" as const, subgroup: "domain-a" },
    { assetSha256: "4".repeat(64), label: "ai_generated" as const, subgroup: "domain-a" },
  ];
  return { records, labels, profile: parseDdaShadowReviewProfile(profileValue()) };
}

test("marks a complete labelled shadow window eligible only for manual review", () => {
  const { records, labels, profile } = fixture();
  const assessment = assessDdaShadowReview(records, labels, profile, {
    since: "2026-08-01T00:00:00.000Z",
    until: "2026-08-02T00:00:00.000Z",
    profileSha256: "d".repeat(64),
    auditSha256: "e".repeat(64),
    truthSha256: "f".repeat(64),
    generatedAt: "2026-08-02T01:00:00.000Z",
  });

  assert.equal(assessment.criteria.every((criterion) => criterion.state === "pass"), true);
  assert.equal(assessment.review.eligibleForManualPromotionReview, true);
  assert.equal(assessment.review.productionPromotionAuthorized, false);
  assert.equal(assessment.review.automaticPolicyMutation, false);
  assert.ok(assessment.review.remainingProductionEvidence.includes("separate_immutable_policy_promotion"));
  assert.equal(assessment.inputs.auditSha256, "e".repeat(64));
});

test("keeps source-label criteria insufficient when traffic is unlabelled", () => {
  const { records, profile } = fixture();
  const assessment = assessDdaShadowReview(records, [], profile, {
    since: "2026-08-01T00:00:00.000Z",
    until: "2026-08-02T00:00:00.000Z",
    profileSha256: "d".repeat(64),
    auditSha256: "e".repeat(64),
    truthSha256: null,
  });

  for (const id of ["labeled_records", "real_records", "generated_records", "qualifying_subgroups", "candidate_real_false_positive_rate", "candidate_generated_recall", "candidate_accuracy_delta"]) {
    assert.equal(assessment.criteria.find((criterion) => criterion.id === id)?.state, "insufficient");
  }
  assert.equal(assessment.review.eligibleForManualPromotionReview, false);
  assert.equal(assessment.review.productionPromotionAuthorized, false);
});

test("keeps operational rates insufficient below the minimum unique-asset volume", () => {
  const { records, profile } = fixture();
  const assessment = assessDdaShadowReview(records.slice(0, 1), [], profile, {
    since: "2026-08-01T00:00:00.000Z",
    until: "2026-08-02T00:00:00.000Z",
    profileSha256: "d".repeat(64),
    auditSha256: "e".repeat(64),
    truthSha256: null,
  });
  for (const id of ["paired_completion_rate", "candidate_failure_rate", "candidate_p95_latency_ratio"]) {
    assert.equal(assessment.criteria.find((criterion) => criterion.id === id)?.state, "insufficient");
  }
});

test("compares labelled accuracy only on records completed by both routes", () => {
  const { records, labels, profile } = fixture();
  records[0] = {
    ...records[0]!,
    candidate: {
      ...records[0]!.candidate,
      status: "failed",
      score: null,
      predictedClass: null,
      latencyMs: null,
      error: "DDA_TIMEOUT",
    },
    comparison: { scoreDeltaCandidateMinusBaseline: null, directionAgreement: "unavailable" },
  };
  const assessment = assessDdaShadowReview(records, labels, profile, {
    since: "2026-08-01T00:00:00.000Z",
    until: "2026-08-02T00:00:00.000Z",
    profileSha256: "d".repeat(64),
    auditSha256: "e".repeat(64),
    truthSha256: "f".repeat(64),
  });
  assert.equal(assessment.evaluation.labels.matchedRecords, 4);
  assert.equal(assessment.pairedLabelMetrics.matchedRecords, 3);
  assert.equal(assessment.criteria.find((criterion) => criterion.id === "labeled_records")?.state, "insufficient");
  assert.equal(assessment.review.eligibleForManualPromotionReview, false);
});

test("fails a mixed or unexpected candidate identity without authorizing promotion", () => {
  const { records, labels, profile } = fixture();
  records[0] = { ...records[0]!, candidate: { ...records[0]!.candidate, candidateId: "other-candidate" } };
  const assessment = assessDdaShadowReview(records, labels, profile, {
    since: "2026-08-01T00:00:00.000Z",
    until: "2026-08-02T00:00:00.000Z",
    profileSha256: "d".repeat(64),
    auditSha256: "e".repeat(64),
    truthSha256: "f".repeat(64),
  });
  assert.equal(assessment.criteria.find((criterion) => criterion.id === "candidate_identity")?.state, "fail");
  assert.equal(assessment.review.eligibleForManualPromotionReview, false);
  assert.equal(assessment.review.productionPromotionAuthorized, false);
});

test("selects a strict bounded half-open review window", () => {
  const { records } = fixture();
  const selected = selectDdaShadowReviewWindow(records, {
    since: "2026-08-01T01:00:00.000Z",
    until: "2026-08-01T03:00:00.000Z",
    maximumRecords: 2,
  });
  assert.deepEqual(selected.map((item) => item.id), ["record-2", "record-3"]);
  assert.throws(() => selectDdaShadowReviewWindow(records, {
    since: "2026-08-01T00:00:00.000Z",
    until: "2026-08-02T00:00:00.000Z",
    maximumRecords: 3,
  }), /WINDOW_TOO_LARGE/);
  assert.throws(() => selectDdaShadowReviewWindow(records, {
    since: "2026-08-02T00:00:00.000Z",
    until: "2026-08-01T00:00:00.000Z",
    maximumRecords: 10,
  }), /WINDOW:order/);
});

test("strictly parses the profile and writes a private create-only snapshot", async () => {
  assert.throws(() => parseDdaShadowReviewProfile({ ...profileValue(), extra: true }), /root:fields/);
  const { records, labels, profile } = fixture();
  const assessment = assessDdaShadowReview(records, labels, profile, {
    since: "2026-08-01T00:00:00.000Z",
    until: "2026-08-02T00:00:00.000Z",
    profileSha256: "d".repeat(64),
    auditSha256: "e".repeat(64),
    truthSha256: "f".repeat(64),
  });
  const directory = await mkdtemp(join(tmpdir(), "dda-shadow-review-"));
  const path = join(directory, "snapshot.json");
  try {
    await writePrivateDdaShadowReviewSnapshot(path, assessment);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(path, "utf8")).review.productionPromotionAuthorized, false);
    await assert.rejects(() => writePrivateDdaShadowReviewSnapshot(path, assessment), /EEXIST/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
