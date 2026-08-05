import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateExplanationPromotion,
  parseExplanationEvaluationManifest,
  parseExplanationEvaluationPolicy,
  parseExplanationEvaluationRun,
  type ExplanationEvaluationManifest,
  type ExplanationEvaluationPolicy,
  type ExplanationEvaluationRun,
} from "../src/explanation-evaluation.js";
import { ACTIVE_EXPLANATION_PROMPT_BUNDLE } from "../src/explanation-prompts.js";

function policy(): ExplanationEvaluationPolicy {
  return parseExplanationEvaluationPolicy({
    schemaVersion: "1.0.0",
    policyId: "unit-explanation-policy",
    target: { promptBundleId: ACTIVE_EXPLANATION_PROMPT_BUNDLE.id, promptBundleVersion: ACTIVE_EXPLANATION_PROMPT_BUNDLE.version, provider: "test", model: "test-model" },
    minimums: {
      totalCases: 1, humanReviewedCases: 1, minimumReviewers: 2,
      aiGeneratedCases: 0, likelyNonAiCases: 0, inconclusiveCases: 1,
      fallbackControlCases: 0, promptInjectionCases: 1, casesPerRequiredGroup: 1,
    },
    thresholds: {
      requiredClaimSupportRateMin: 1, claimContradictionRateMax: 0, claimUnverifiableRateMax: 0,
      unsupportedClaimRateMax: 0, verdictConsistencyMin: 1, polarityConsistencyMin: 1,
      fallbackAppropriatenessMin: 1, publishedExplanationAcceptanceMin: 1,
      promptInjectionRobustnessMin: 1, falseAcceptRateMax: 0, falseFallbackRateMax: 0,
      exactCheckPassRateMin: 1, failureRateMax: 0, p95LatencyMsMax: 1000, averageSynthesisAttemptsMax: 1,
    },
    requiredGroups: ["neutral_control"],
  });
}

function manifest(): ExplanationEvaluationManifest {
  return parseExplanationEvaluationManifest({
    schemaVersion: "1.0.0",
    manifestId: "unit-explanation-slice",
    createdAt: "2026-07-30T00:00:00.000Z",
    cases: [{
      id: "inconclusive-injection-001",
      inputSnapshotSha256: "a".repeat(64),
      sourceReference: "owned-analysis-fixture-001",
      expectedVerdict: "INCONCLUSIVE",
      requiredClaimIds: ["claim:verdict"],
      groups: ["neutral_control"],
      promptInjection: true,
      fallbackControl: false,
      review: { status: "approved", reviewerIds: ["reviewer-a", "reviewer-b"], blindToCandidateOutput: true, adjudicated: true },
    }],
  });
}

function run(): ExplanationEvaluationRun {
  return parseExplanationEvaluationRun({
    schemaVersion: "1.0.0",
    runId: "unit-explanation-run",
    createdAt: "2026-07-30T00:00:00.000Z",
    promptBundle: {
      id: ACTIVE_EXPLANATION_PROMPT_BUNDLE.id,
      version: ACTIVE_EXPLANATION_PROMPT_BUNDLE.version,
      promptHashes: ACTIVE_EXPLANATION_PROMPT_BUNDLE.promptHashes,
    },
    model: { provider: "test", model: "test-model" },
    cases: [{
      caseId: "inconclusive-injection-001",
      status: "completed",
      explanationSha256: "b".repeat(64),
      outputType: "ai_synthesis",
      synthesisAttempts: 1,
      latencyMs: 100,
      validationStatus: "verified",
      exactChecks: { passed: 5, total: 5 },
      polarityChecks: [
        { variant: "positive", outcome: "supported" },
        { variant: "inverse", outcome: "supported" },
        { variant: "paraphrase", outcome: "supported" },
        { variant: "forced_choice", outcome: "supported" }
      ],
      humanReview: {
        reviewerIds: ["reviewer-c", "reviewer-d"], blindToBundle: true, adjudicated: true,
        claimOutcomes: [{ claimId: "claim:verdict", outcome: "supported" }],
        unsupportedClaimCount: 0, verdictConsistent: true, candidateDraftAcceptable: true,
        fallbackAppropriate: true, publishedExplanationAcceptable: true, instructionFollowingViolation: false,
      },
    }],
  });
}

test("a fully adjudicated explanation candidate passes every publication gate", () => {
  const report = evaluateExplanationPromotion(policy(), manifest(), run(), "2026-07-30T01:00:00.000Z");
  assert.equal(report.status, "promotable");
  assert.equal(report.checks.every((item) => item.passed), true);
  assert.equal(report.metrics.requiredClaimSupportRate, 1);
  assert.equal(report.metrics.polarityConsistency, 1);
  assert.equal(report.metrics.falseAcceptRate, 0);
});

test("hash drift, unsupported claims, and an unsafe published draft block promotion", () => {
  const candidate = run();
  candidate.promptBundle.promptHashes.synthesisTask = "0".repeat(64);
  candidate.cases[0].humanReview.unsupportedClaimCount = 1;
  candidate.cases[0].humanReview.candidateDraftAcceptable = false;
  candidate.cases[0].humanReview.publishedExplanationAcceptable = false;
  candidate.cases[0].humanReview.instructionFollowingViolation = true;
  const report = evaluateExplanationPromotion(policy(), manifest(), candidate);
  assert.equal(report.status, "blocked");
  for (const id of ["prompt_hashes", "unsupported_claim_rate", "false_accept_rate", "prompt_injection_robustness"]) {
    assert.equal(report.checks.find((item) => item.id === id)?.passed, false, id);
  }
});

test("the checked-in pending explanation slice is valid but blocked", () => {
  const productionPolicy = parseExplanationEvaluationPolicy(JSON.parse(readFileSync(new URL("../resources/explanation-evaluation-policy.v1.json", import.meta.url), "utf8")));
  const pendingManifest = parseExplanationEvaluationManifest(JSON.parse(readFileSync(new URL("../resources/explanation-evaluation-slice.v1.json", import.meta.url), "utf8")));
  const pendingRun = parseExplanationEvaluationRun(JSON.parse(readFileSync(new URL("../resources/explanation-evaluation-run.pending.v1.json", import.meta.url), "utf8")));
  const report = evaluateExplanationPromotion(productionPolicy, pendingManifest, pendingRun);
  assert.equal(report.status, "blocked");
  assert.equal(report.metrics.humanReviewedCases, 0);
  assert.equal(report.metrics.failureRate, null);
  assert.equal(report.checks.find((item) => item.id === "data_complete")?.passed, false);
});

test("explanation evaluation rejects incomplete polarity and malformed hashes", () => {
  const incomplete = run();
  incomplete.cases[0].polarityChecks.pop();
  const report = evaluateExplanationPromotion(policy(), manifest(), incomplete);
  assert.equal(report.metrics.dataComplete, false);
  assert.equal(report.status, "blocked");

  const malformed = JSON.parse(JSON.stringify(run())) as Record<string, any>;
  malformed.cases[0].explanationSha256 = "not-a-digest";
  assert.throws(() => parseExplanationEvaluationRun(malformed), /INVALID_EXPLANATION_SHA256/);
});
