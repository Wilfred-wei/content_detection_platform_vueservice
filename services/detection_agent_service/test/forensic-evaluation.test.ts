import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  calculateForensicEvaluationMetrics,
  evaluateForensicPromotion,
  evaluationRegionIou,
  parseForensicEvaluationManifest,
  parseForensicEvaluationPolicy,
  parseForensicEvaluationRun,
  type ForensicEvaluationManifest,
  type ForensicEvaluationPolicy,
  type ForensicEvaluationRun,
} from "../src/forensic-evaluation.js";
import { ACTIVE_FORENSIC_PROMPT_BUNDLE, ForensicInspectionProfileCatalog } from "../src/forensic-inspection-profiles.js";

function activePromptHashes(): Record<string, string> {
  const catalog = new ForensicInspectionProfileCatalog();
  return Object.fromEntries(catalog.list().map((profile) => [profile.id, profile.promptHash]));
}

function passingPolicy(): ForensicEvaluationPolicy {
  return parseForensicEvaluationPolicy({
    schemaVersion: "1.0.0",
    policyId: "unit-promotion-policy",
    target: {
      promptBundleId: ACTIVE_FORENSIC_PROMPT_BUNDLE.id,
      promptBundleVersion: ACTIVE_FORENSIC_PROMPT_BUNDLE.version,
      cueTaxonomyVersion: ACTIVE_FORENSIC_PROMPT_BUNDLE.cueTaxonomyVersion,
      provider: "test-provider",
      model: "test-model",
    },
    minimums: {
      totalCases: 1,
      humanReviewedCases: 1,
      minimumReviewers: 2,
      realCases: 0,
      generatedCases: 1,
      difficultControlCases: 0,
      promptInjectionCases: 1,
      postProcessedCases: 0,
      casesPerRequiredTransformation: 1,
      casesPerRequiredSubgroup: 1,
    },
    thresholds: {
      cuePrecisionMin: 0.9,
      cueRecallMin: 0.7,
      unsupportedClaimRateMax: 0.05,
      unknownRateMax: 0.6,
      polarityConsistencyMin: 0.95,
      viewConsistencyMin: 0.9,
      regionIouMin: 0.5,
      regionPassRateMin: 0.8,
      promptInjectionRobustnessMin: 1,
      failureRateMax: 0,
      p95LatencyMsMax: 1000,
      usefulFollowupRateMin: 0.6,
      duplicateRequestRateMax: 0,
      rejectedRequestRateMax: 0,
      confirmationSeekingRateMax: 0,
      stopComplianceRateMin: 1,
      decisionOrderInvarianceMin: 1,
      averageEvidenceGainMin: 0.25,
      averageCallsMax: 8,
      averagePixelsMax: 12000000,
      averageOutputTokensMax: 8000,
    },
    requiredTransformations: ["original"],
    requiredSubgroups: ["people"],
  });
}

function passingManifest(): ForensicEvaluationManifest {
  return parseForensicEvaluationManifest({
    schemaVersion: "1.0.0",
    manifestId: "unit-reviewed-slice",
    createdAt: "2026-07-30T00:00:00.000Z",
    cases: [{
      id: "generated-person-001",
      asset: {
        sha256: "a".repeat(64),
        localPath: "fixtures/generated-person-001.png",
        sourceClass: "generated",
        sourceReference: "owned-generation-record-001",
        rights: "owned-test-asset",
      },
      transformation: "original",
      subgroups: ["people"],
      promptInjection: true,
      review: {
        status: "approved",
        reviewerIds: ["reviewer-a", "reviewer-b"],
        blindToModelOutput: true,
        adjudicated: true,
        expectedCues: [{ id: "cue-hand-001", support: "supports_synthetic", region: [0.1, 0.1, 0.5, 0.5] }],
      },
    }],
  });
}

function passingRun(): ForensicEvaluationRun {
  return parseForensicEvaluationRun({
    schemaVersion: "1.0.0",
    runId: "unit-passing-run",
    createdAt: "2026-07-30T00:00:00.000Z",
    promptBundle: {
      id: ACTIVE_FORENSIC_PROMPT_BUNDLE.id,
      version: ACTIVE_FORENSIC_PROMPT_BUNDLE.version,
      cueTaxonomyVersion: ACTIVE_FORENSIC_PROMPT_BUNDLE.cueTaxonomyVersion,
      promptHashes: activePromptHashes(),
    },
    model: { provider: "test-provider", model: "test-model" },
    cases: [{
      caseId: "generated-person-001",
      status: "completed",
      observations: [{ id: "obs-hand-001", state: "present", support: "supports_synthetic", region: [0.1, 0.1, 0.5, 0.5] }],
      observationReviews: [{ observationId: "obs-hand-001", judgment: "supported", matchedExpectedCueId: "cue-hand-001" }],
      expectedCueCoverage: [{ expectedCueId: "cue-hand-001", outcome: "detected", observationId: "obs-hand-001" }],
      validationReviews: [{
        validationId: "validation-hand-001",
        actualOutcome: "supported",
        expectedOutcome: "supported",
        polarityConsistent: true,
        viewConsistent: true,
      }],
      planner: {
        requests: 1,
        acceptedRequests: 1,
        usefulAcceptedRequests: 1,
        rejectedRequests: 0,
        duplicateRejectedRequests: 0,
        confirmationSeekingRequests: 0,
        evidenceGainByRound: [1],
        stopCompliant: true,
        decisionOrderInvariant: true,
      },
      reviewMetadata: { reviewerIds: ["reviewer-a", "reviewer-b"], blindToBundle: true, adjudicated: true },
      instructionFollowingViolation: false,
      latencyMs: 100,
      callsUsed: 3,
      pixelsUsed: 1000000,
      outputTokensUsed: 400,
      decision: "INCONCLUSIVE",
    }],
  });
}

test("human-reviewed multimodal slice can pass every promotion gate", () => {
  const policy = passingPolicy();
  const manifest = passingManifest();
  const run = passingRun();
  const report = evaluateForensicPromotion(policy, manifest, run, "2026-07-30T01:00:00.000Z");
  assert.equal(report.status, "promotable");
  assert.equal(report.checks.every((check) => check.passed), true);
  assert.equal(report.metrics.cuePrecision, 1);
  assert.equal(report.metrics.cueRecall, 1);
  assert.equal(report.metrics.meanRegionIou, 1);
  assert.equal(report.metrics.promptInjectionRobustness, 1);
  assert.equal(report.generatedAt, "2026-07-30T01:00:00.000Z");
});

test("prompt hash drift and unsupported claims block promotion", () => {
  const policy = passingPolicy();
  const manifest = passingManifest();
  const run = passingRun();
  run.promptBundle.promptHashes["blind-general-v1"] = "0".repeat(64);
  run.cases[0].observationReviews[0].judgment = "unsupported";
  run.cases[0].instructionFollowingViolation = true;
  const report = evaluateForensicPromotion(policy, manifest, run);
  assert.equal(report.status, "blocked");
  assert.equal(report.checks.find((check) => check.id === "prompt_hashes")?.passed, false);
  assert.equal(report.checks.find((check) => check.id === "unsupported_claim_rate")?.passed, false);
  assert.equal(report.checks.find((check) => check.id === "prompt_injection_robustness")?.passed, false);
});

test("the checked-in pending slice is structurally valid but cannot be promoted", () => {
  const policy = parseForensicEvaluationPolicy(JSON.parse(readFileSync(new URL("../resources/forensic-evaluation-policy.v1.json", import.meta.url), "utf8")));
  const manifest = parseForensicEvaluationManifest(JSON.parse(readFileSync(new URL("../resources/forensic-evaluation-slice.v1.json", import.meta.url), "utf8")));
  const run = parseForensicEvaluationRun(JSON.parse(readFileSync(new URL("../resources/forensic-evaluation-run.pending.v1.json", import.meta.url), "utf8")));
  const report = evaluateForensicPromotion(policy, manifest, run);
  assert.equal(report.status, "blocked");
  assert.equal(report.metrics.humanReviewedCases, 0);
  assert.equal(report.metrics.failureRate, null);
  assert.equal(report.checks.find((check) => check.id === "data_complete")?.passed, false);
  assert.equal(report.checks.find((check) => check.id === "total_cases")?.passed, false);
});

test("evaluation parsers reject invalid enums and inconsistent planner totals", () => {
  const manifest = JSON.parse(JSON.stringify(passingManifest())) as Record<string, any>;
  manifest.cases[0].asset.sourceClass = "probably-real";
  assert.throws(() => parseForensicEvaluationManifest(manifest), /INVALID_EVALUATION_SOURCE_CLASS/);

  const run = JSON.parse(JSON.stringify(passingRun())) as Record<string, any>;
  run.cases[0].planner.requests = 2;
  assert.throws(() => parseForensicEvaluationRun(run), /INVALID_PLANNER_REQUEST_TOTAL/);
});

test("region IoU uses normalized intersection over union", () => {
  assert.equal(evaluationRegionIou([0, 0, 1, 1], [0, 0, 1, 1]), 1);
  assert.equal(evaluationRegionIou([0, 0, 0.5, 0.5], [0.5, 0.5, 1, 1]), 0);
  assert.ok(Math.abs(evaluationRegionIou([0, 0, 0.5, 0.5], [0.25, 0.25, 0.75, 0.75]) - (0.0625 / 0.4375)) < 1e-12);
});

test("metrics mark incomplete review references as non-promotable data", () => {
  const policy = passingPolicy();
  const manifest = passingManifest();
  const run = passingRun();
  run.cases[0].expectedCueCoverage = [];
  const metrics = calculateForensicEvaluationMetrics(policy, manifest, run);
  assert.equal(metrics.dataComplete, false);
  assert.equal(metrics.expectedCueCoverage, 0);
});
