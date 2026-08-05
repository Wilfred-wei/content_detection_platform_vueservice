import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVENANCE_ACCEPTANCE_SCENARIOS,
  evaluateProvenanceAcceptance,
  parseProvenanceAcceptanceCase,
  parseProvenanceAcceptanceTrace,
  type ProvenanceAcceptanceCase,
} from "../src/provenance-acceptance.js";
import type { ProvenanceSchemeObservation } from "../src/provenance-scheme-evaluation.js";
import { loadProvenanceRegistry } from "../src/provenance-registry.js";

const hash = "a".repeat(64);
const schemeId = "sdxl-invisible-watermark";
const profileId = "diffusers-sdxl-default-48bit-v1";

function acceptanceCase(scenario: ProvenanceAcceptanceCase["scenario"], index: number): ProvenanceAcceptanceCase {
  const observation = !["completion_order", "early_exit"].includes(scenario);
  return {
    schemaVersion: "provenance-acceptance-case.v1",
    caseId: `case-${index}`,
    schemeId,
    profileId,
    scenario,
    observationRecordId: observation ? `observation-${index}` : null,
    traceId: observation ? null : `trace-${index}`,
    expectedLabel: scenario === "transformation_robustness" ? "marked_positive" : observation ? "unmarked_control" : null,
    expectedTransformationCategory: scenario === "transformation_robustness" ? "resize" : null,
  };
}

function observation(
  recordId: string,
  currentSchemeId: string,
  currentProfileId: string,
  positive: boolean,
  transformationCategory: "original" | "resize" = "original",
): ProvenanceSchemeObservation {
  return {
    schemaVersion: "provenance-scheme-observation.v1",
    evaluationRunId: "acceptance-test-run",
    recordId,
    sampleId: recordId,
    assetSha256: hash,
    datasetManifestSha256: "b".repeat(64),
    transformationSuiteSha256: "c".repeat(64),
    schemeId: currentSchemeId,
    profileId: currentProfileId,
    configurationId: "test",
    partition: "evaluation",
    label: positive ? "marked_positive" : "unmarked_control",
    transformationId: transformationCategory,
    transformationCategory,
    viewPolicyId: "single",
    attemptedViews: 1,
    detection: { outcome: positive ? "positive" : "negative", positive, score: positive ? 1 : 0, threshold: 0.5 },
    performance: { latencyMs: 1, cpuTimeMs: 1, peakRssBytes: 1, gpuTimeMs: null, peakGpuMemoryBytes: null },
  };
}

function shortCircuitProfiles(): Array<{ schemeId: string; profileId: string }> {
  return loadProvenanceRegistry().schemes
    .filter((scheme) => ["candidate_after_gate", "eligible"].includes(scheme.shortCircuit.policy))
    .flatMap((scheme) => scheme.execution.profiles.length > 0
      ? scheme.execution.profiles.map((profile) => ({ schemeId: scheme.id, profileId: profile.id }))
      : [{ schemeId: scheme.id, profileId: "scheme-default" }])
    .sort((left, right) => `${left.schemeId}:${left.profileId}`.localeCompare(`${right.schemeId}:${right.profileId}`));
}

test("requires strict bindings and rejects observation cases without the right scenario input", () => {
  assert.throws(() => parseProvenanceAcceptanceCase({ schemaVersion: "provenance-acceptance-case.v1" }), /INVALID_PROVENANCE_ACCEPTANCE/);
  assert.throws(() => parseProvenanceAcceptanceCase({
    ...acceptanceCase("unmarked_control", 1), expectedLabel: "marked_positive",
  }), /negativeLabel/);
  assert.throws(() => parseProvenanceAcceptanceTrace({ schemaVersion: "provenance-acceptance-trace.v1" }), /INVALID_PROVENANCE_ACCEPTANCE/);
});

test("checks negative controls, transformations, completion order, and early exit independently", () => {
  const cases = PROVENANCE_ACCEPTANCE_SCENARIOS.map((scenario, index) => acceptanceCase(scenario, index));
  const observations = cases
    .filter((item) => item.observationRecordId)
    .map((item) => observation(item.observationRecordId as string, item.scenario === "transformation_robustness", item.scenario === "transformation_robustness" ? "resize" : "original"));
  const traces = [
    parseProvenanceAcceptanceTrace({
      schemaVersion: "provenance-acceptance-trace.v1", traceId: "trace-7", caseId: "case-7", schemeId,
      directEvidenceCompleteBeforeModel: true, collectorCompletionOrder: ["metadata", "watermark", "c2pa"],
      directEvidenceBarrierOrder: 3, modelInvocationOrder: 4, shortCircuitAuthorized: false, modelInvoked: true,
      lateAuthoritativeWritesRejected: true,
    }),
    parseProvenanceAcceptanceTrace({
      schemaVersion: "provenance-acceptance-trace.v1", traceId: "trace-8", caseId: "case-8", schemeId,
      directEvidenceCompleteBeforeModel: true, collectorCompletionOrder: ["watermark", "metadata"],
      directEvidenceBarrierOrder: 2, modelInvocationOrder: null, shortCircuitAuthorized: true, modelInvoked: false,
      lateAuthoritativeWritesRejected: true,
    }),
  ];
  const report = evaluateProvenanceAcceptance(cases, observations, traces);
  assert.equal(report.acceptancePassed, false);
  assert.equal(report.coverageComplete, false);
  assert.ok(report.failures.some((item) => item.reason === "scenario_missing"));

  const complete = evaluateProvenanceAcceptance(
    cases,
    observations,
    traces,
  );
  assert.equal(complete.productionEvidenceEligible, false);
  assert.equal(complete.shortCircuitEligible, false);
});

test("flags a forged or positive control that becomes positive evidence", () => {
  const cases = [acceptanceCase("forged_metadata", 20)];
  const report = evaluateProvenanceAcceptance(cases, [observation("observation-20", schemeId, profileId, true)]);
  assert.equal(report.acceptancePassed, false);
  assert.ok(report.failures.some((item) => item.reason === "negative_control_not_explicitly_negative"));
});

test("covers every registered short-circuit scheme with all acceptance scenarios", () => {
  const profiles = shortCircuitProfiles();
  const cases: ProvenanceAcceptanceCase[] = [];
  const observations: ProvenanceSchemeObservation[] = [];
  const traces = [] as ReturnType<typeof parseProvenanceAcceptanceTrace>[];
  let index = 0;

  for (const profile of profiles) {
    for (const scenario of PROVENANCE_ACCEPTANCE_SCENARIOS) {
      const isTrace = scenario === "completion_order" || scenario === "early_exit";
      const caseId = `matrix-${profile.schemeId}-${scenario}`;
      const observationRecordId = isTrace ? null : `${caseId}-observation`;
      const traceId = isTrace ? `${caseId}-trace` : null;
      cases.push({
        schemaVersion: "provenance-acceptance-case.v1",
        caseId,
        schemeId: profile.schemeId,
        profileId: profile.profileId,
        scenario,
        observationRecordId,
        traceId,
        expectedLabel: scenario === "transformation_robustness" ? "marked_positive" : isTrace ? null : "unmarked_control",
        expectedTransformationCategory: isTrace ? null : scenario === "transformation_robustness" ? "resize" : "original",
      });
      if (!isTrace) {
        observations.push(observation(
          observationRecordId as string,
          profile.schemeId,
          profile.profileId,
          scenario === "transformation_robustness" ? true : false,
          scenario === "transformation_robustness" ? "resize" : "original",
        ));
      } else {
        traces.push(parseProvenanceAcceptanceTrace({
          schemaVersion: "provenance-acceptance-trace.v1",
          traceId,
          caseId,
          schemeId: profile.schemeId,
          directEvidenceCompleteBeforeModel: true,
          collectorCompletionOrder: ["c2pa", "registered_watermarks", "metadata"],
          directEvidenceBarrierOrder: 3,
          modelInvocationOrder: scenario === "completion_order" ? 4 : null,
          shortCircuitAuthorized: scenario === "early_exit",
          modelInvoked: scenario === "completion_order",
          lateAuthoritativeWritesRejected: true,
        }));
      }
      index += 1;
    }
  }

  assert.equal(index, profiles.length * PROVENANCE_ACCEPTANCE_SCENARIOS.length);
  const report = evaluateProvenanceAcceptance(cases, observations, traces);
  assert.equal(report.requiredSchemes.length, profiles.length);
  assert.equal(report.cases, profiles.length * PROVENANCE_ACCEPTANCE_SCENARIOS.length);
  assert.equal(report.traces, profiles.length * 2);
  assert.equal(report.coverageComplete, true);
  assert.equal(report.acceptancePassed, true);
  assert.equal(report.failedCases, 0);
  assert.equal(report.productionEvidenceEligible, false);
  assert.equal(report.shortCircuitEligible, false);
});
