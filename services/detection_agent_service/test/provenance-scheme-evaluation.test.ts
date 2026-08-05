import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProvenanceSchemes,
  parseProvenanceSchemeObservation,
  parseProvenanceSchemeObservationJsonl,
  type ProvenanceSchemeObservation,
} from "../src/provenance-scheme-evaluation.js";

const DATASET = "1".repeat(64);
const TRANSFORMS = "2".repeat(64);

function observation(overrides: Partial<ProvenanceSchemeObservation> & {
  recordId: string;
  sampleId: string;
}): ProvenanceSchemeObservation {
  const score = overrides.detection?.score ?? 0.9;
  const threshold = overrides.detection?.threshold ?? 0.5;
  const positive = overrides.detection?.positive ?? score >= threshold;
  return {
    schemaVersion: "provenance-scheme-observation.v1",
    evaluationRunId: "run-2026-08-03",
    recordId: overrides.recordId,
    sampleId: overrides.sampleId,
    assetSha256: overrides.assetSha256 ?? "3".repeat(64),
    datasetManifestSha256: DATASET,
    transformationSuiteSha256: TRANSFORMS,
    schemeId: "sdxl-invisible-watermark",
    profileId: "diffusers-sdxl-default-48bit-v1",
    configurationId: "single-view-v1",
    partition: "evaluation",
    label: "marked_positive",
    transformationId: "original",
    transformationCategory: "original",
    viewPolicyId: "single-view-v1",
    attemptedViews: 1,
    detection: {
      outcome: positive ? "positive" : "negative",
      positive,
      score,
      threshold,
    },
    performance: {
      latencyMs: 10,
      cpuTimeMs: 8,
      peakRssBytes: 1000,
      gpuTimeMs: null,
      peakGpuMemoryBytes: null,
    },
    ...overrides,
  };
}

test("freezes a calibration threshold and reports fixed-FPR evaluation without refitting", () => {
  const records = [
    observation({ recordId: "cal-c1", sampleId: "cal-c1", partition: "calibration", label: "unmarked_control", detection: { outcome: "negative", positive: false, score: 0.1, threshold: 0.5 } }),
    observation({ recordId: "cal-c2", sampleId: "cal-c2", partition: "calibration", label: "unmarked_control", detection: { outcome: "negative", positive: false, score: 0.2, threshold: 0.5 } }),
    observation({ recordId: "eval-p1", sampleId: "eval-p1", detection: { outcome: "positive", positive: true, score: 0.9, threshold: 0.5 } }),
    observation({ recordId: "eval-p2", sampleId: "eval-p2", transformationId: "blur-1", transformationCategory: "blur", viewPolicyId: "multi-view-v1", attemptedViews: 4, detection: { outcome: "positive", positive: true, score: 0.8, threshold: 0.5 } }),
    observation({ recordId: "eval-c1", sampleId: "eval-c1", label: "unmarked_control", detection: { outcome: "negative", positive: false, score: 0.1, threshold: 0.5 } }),
    observation({ recordId: "eval-c2", sampleId: "eval-c2", label: "unmarked_control", transformationId: "blur-1", transformationCategory: "blur", viewPolicyId: "multi-view-v1", attemptedViews: 4, detection: { outcome: "negative", positive: false, score: 0.3, threshold: 0.5 } }),
  ];

  const report = evaluateProvenanceSchemes(records, { targetFalsePositiveRate: 0.5, generatedAt: "2026-08-03T06:00:00.000Z" });
  assert.equal(report.metrics.length, 1);
  assert.equal(report.productionEvidenceEligible, false);
  assert.equal(report.automaticPolicyMutation, false);
  const metric = report.metrics[0];
  assert.equal(metric.currentPolicy.recall, 1);
  assert.equal(metric.currentPolicy.falsePositiveRate, 0);
  assert.equal(metric.fixedFpr.status, "computed");
  assert.equal(metric.fixedFpr.threshold, 0.2);
  assert.equal(metric.fixedFpr.recall, 1);
  assert.equal(metric.fixedFpr.falsePositiveRate, 0.5);
  assert.equal(metric.multiView.policies.length, 2);
  assert.equal(metric.multiView.completeCalibrationData, false);
  assert.equal(
    metric.multiView.policies.find((policy) => policy.viewPolicyId === "single-view-v1")?.fixedFprStatus,
    "computed",
  );
  assert.equal(
    metric.multiView.policies.find((policy) => policy.viewPolicyId === "multi-view-v1")?.fixedFprStatus,
    "insufficient_calibration_controls",
  );
  assert.deepEqual(metric.transformationRobustness.map((item) => item.category), ["blur", "original"]);
  assert.equal(metric.latencyMs.p95, 10);
  assert.equal(metric.resourceCost.gpuTimeMs, null);
  assert.equal(metric.releaseGateReadiness.eligible, false);
  assert.ok(metric.releaseGateReadiness.reasons.includes("minimum_unmarked_controls_not_met"));
});

test("reports thresholdless cryptographic schemes as not applicable instead of inventing scores", () => {
  const record = observation({
    recordId: "c2pa-1",
    sampleId: "c2pa-1",
    schemeId: "c2pa",
    profileId: "scheme-default",
    configurationId: "local-validation-v1",
    detection: { outcome: "positive", positive: true, score: null, threshold: null },
  });
  const metric = evaluateProvenanceSchemes([record], { generatedAt: "2026-08-03T06:00:00.000Z" }).metrics[0];
  assert.equal(metric.fixedFpr.status, "not_applicable_no_score");
  assert.equal(metric.fixedFpr.threshold, null);
});

test("reports insufficient calibration and evaluation data explicitly", () => {
  const noCalibration = observation({ recordId: "eval-only", sampleId: "eval-only" });
  assert.equal(evaluateProvenanceSchemes([noCalibration]).metrics[0].fixedFpr.status, "insufficient_calibration_controls");

  const calibrationOnly = observation({
    recordId: "cal-only",
    sampleId: "cal-only",
    partition: "calibration",
    label: "unmarked_control",
    detection: { outcome: "negative", positive: false, score: 0.1, threshold: 0.5 },
  });
  assert.equal(evaluateProvenanceSchemes([calibrationOnly]).metrics[0].fixedFpr.status, "insufficient_evaluation_data");

  const unattainable = [
    observation({ recordId: "cal-max", sampleId: "cal-max", partition: "calibration", label: "unmarked_control", detection: { outcome: "positive", positive: true, score: 1, threshold: 0.5 } }),
    observation({ recordId: "eval-positive", sampleId: "eval-positive" }),
    observation({ recordId: "eval-control", sampleId: "eval-control", label: "unmarked_control", detection: { outcome: "negative", positive: false, score: 0.1, threshold: 0.5 } }),
  ];
  assert.equal(
    evaluateProvenanceSchemes(unattainable, { targetFalsePositiveRate: 0 }).metrics[0].fixedFpr.status,
    "target_unattainable",
  );
});

test("rejects malformed authority fields, mixed inputs, and duplicate logical observations", () => {
  const extraField: any = observation({ recordId: "one", sampleId: "one" });
  extraField.productionEvidenceEligible = true;
  assert.throws(() => parseProvenanceSchemeObservation(extraField), /root:fields/);

  const invalidOutcome: any = observation({ recordId: "two", sampleId: "two" });
  invalidOutcome.detection = { outcome: "positive", positive: false, score: 0.9, threshold: 0.5 };
  assert.throws(() => parseProvenanceSchemeObservation(invalidOutcome), /detection:consistency/);

  const first = observation({ recordId: "a", sampleId: "same" });
  const second = observation({ recordId: "b", sampleId: "same" });
  assert.throws(
    () => parseProvenanceSchemeObservationJsonl(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`),
    /DUPLICATE.*LOGICAL_KEY/,
  );

  const mixed = observation({ recordId: "c", sampleId: "other", evaluationRunId: "other-run" });
  assert.throws(() => evaluateProvenanceSchemes([first, mixed]), /MIXED.*INPUT/);
});
