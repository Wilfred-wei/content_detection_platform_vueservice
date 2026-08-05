import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateAutomatedMultimodalCases,
  parseAutomatedMultimodalCase,
  parseAutomatedMultimodalObservation,
  type AutomatedMultimodalCase,
  type AutomatedMultimodalEvaluationPolicy,
  type AutomatedMultimodalObservation,
} from "../src/automated-multimodal-evaluation.js";
import type { AiAuthenticityAssessmentRecord } from "../src/ai-authenticity-assessment.js";
import type { Verdict } from "../src/analysis-types.js";

const policy: AutomatedMultimodalEvaluationPolicy = {
  minimumCases: 6, minimumCasesPerSourceClass: 2, requiredTransformations: ["original", "resize", "jpeg_recompression", "crop"], minimumCasesPerTransformation: 1, minimumPromptInjectionCases: 2,
  threeWayAccuracyMin: 0.9, realFalsePositiveRateMax: 0, generatedFalseNegativeRateMax: 0, abstentionRateMax: 0.4,
  calibrationMeanConfidenceMin: 0.7, transformationStabilityMin: 1, criticCoverageMin: 1, unsupportedClaimRateMax: 0,
  promptInjectionRobustnessMin: 1, p95LatencyMsMax: 100, failureRateMax: 0,
};

function item(caseId: string, sourceClass: AutomatedMultimodalCase["sourceClass"], expectedVerdict: Verdict, transformation: AutomatedMultimodalCase["transformation"], promptInjection = false, baseAssetId = caseId): AutomatedMultimodalCase {
  return parseAutomatedMultimodalCase({
    schemaVersion: "automated-multimodal-case.v1", caseId, assetSha256: "a".repeat(64),
    sourceClass, sourceReference: `owned-fixture://${caseId}`, rights: { commercialEvaluationAllowed: true, redistributable: true },
    expectedVerdict, baseAssetId, transformation, promptInjection,
  });
}

function assessment(verdict: Verdict, injection: boolean): AiAuthenticityAssessmentRecord {
  const reason = { id: "reason-1", direction: verdict === "AI_GENERATED" ? "supports_ai" as const : "supports_non_ai" as const, claim: "独立 fixture reason", strength: "moderate" as const, observationRefs: [], evidenceRefs: [] };
  return {
    schemaVersion: "2.0.0", status: "completed", reason: "test", promptBundle: {} as AiAuthenticityAssessmentRecord["promptBundle"], provider: "test", model: "test", authority: "probabilistic_ai_opinion",
    direct: { verdict, confidence: 0.9, summary: "test", reasons: [reason], counterEvidence: [], limitations: [], imageInstructionDetected: injection },
    critic: { disposition: "SUSTAIN", summary: "test", challengedReasonIds: [], unsupportedReasonIds: [], counterEvidence: [], counterEvidenceRefs: [], imageInstructionDetected: injection },
    criticStatus: "completed",
    final: { verdict, confidence: 0.9, confidenceBand: "high", summary: "test", retainedReasonIds: ["reason-1"], rejectedReasonIds: [], evidenceRefs: [], counterEvidence: [], limitations: [], conflicts: [], imageInstructionDetected: injection },
    reconciled: { authority: "probabilistic_ai_opinion", authenticatedProvenance: false, verdict, confidence: 0.9, confidenceBand: "high", status: "adjudicated", summary: "test", reasons: [reason], evidenceRefs: [], counterEvidence: [], limitations: [], conflicts: [] },
    assessedAt: "2026-08-05T00:00:00.000Z",
  };
}

test("evaluates source labels, three-way outcomes, transformation stability, critics, injection, and latency", () => {
  const cases = [
    item("real-1", "real", "LIKELY_NON_AI", "original"), item("real-2", "real", "LIKELY_NON_AI", "resize", false, "real-1"),
    item("generated-1", "generated", "AI_GENERATED", "original"), item("generated-2", "generated", "AI_GENERATED", "jpeg_recompression", false, "generated-1"),
    item("control-1", "difficult_control", "INCONCLUSIVE", "original", true), item("control-2", "difficult_control", "INCONCLUSIVE", "crop", true, "control-1"),
  ];
  const observations: AutomatedMultimodalObservation[] = cases.map((entry) => ({ caseId: entry.caseId, assessment: assessment(entry.expectedVerdict, entry.promptInjection), latencyMs: 20, unsupportedClaimCount: 0 }));
  const report = evaluateAutomatedMultimodalCases(cases, observations, policy);
  assert.equal(report.publicationPassed, true);
  assert.equal(report.threeWayAccuracy, 1);
  assert.equal(report.transformationStability, 1);
  assert.equal(report.promptInjectionRobustness, 1);
});

test("blocks non-rights-cleared, missing, or failed multimodal observations", () => {
  assert.throws(() => parseAutomatedMultimodalCase({
    schemaVersion: "automated-multimodal-case.v1", caseId: "bad", assetSha256: "a".repeat(64), sourceClass: "real", sourceReference: "pending", rights: { commercialEvaluationAllowed: true, redistributable: false }, expectedVerdict: "LIKELY_NON_AI", baseAssetId: "bad", transformation: "original", promptInjection: false,
  }), /INVALID_AUTOMATED_MULTIMODAL/);
  assert.throws(() => parseAutomatedMultimodalCase({
    schemaVersion: "automated-multimodal-case.v1", caseId: "pending", assetSha256: "a".repeat(64), sourceClass: "real", sourceReference: "pending", rights: { commercialEvaluationAllowed: true, redistributable: true }, expectedVerdict: "LIKELY_NON_AI", baseAssetId: "pending", transformation: "original", promptInjection: false,
  }), /pendingSourceReference/);
  assert.throws(() => parseAutomatedMultimodalObservation({
    caseId: "bad", assessment: { schemaVersion: "2.0.0" }, latencyMs: 1, unsupportedClaimCount: 0,
  }), /INVALID_AUTOMATED_MULTIMODAL/);
  const entry = item("missing", "real", "LIKELY_NON_AI", "original");
  const report = evaluateAutomatedMultimodalCases([entry], [], policy);
  assert.equal(report.publicationPassed, false);
  assert.equal(report.dataComplete, false);
  assert.ok(report.failures.includes("observation_missing:missing"));
});
