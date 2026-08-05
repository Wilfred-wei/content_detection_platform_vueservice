import assert from "node:assert/strict";
import test from "node:test";

import { evaluateModelBundle } from "../src/model-evaluation-bundle.js";

function records(detectorId: string, scores: number[]) {
  return scores.map((score, index) => ({
    recordId: `${detectorId}-${index}`,
    sampleId: `sample-${index}`,
    detectorId,
    partition: index < 4 ? "calibration" as const : "evaluation" as const,
    label: index % 2 === 0 ? "real" as const : "ai_generated" as const,
    score,
    subgroup: index % 2 === 0 ? "photo" : "generator-a",
    generator: index % 2 === 0 ? null : "generator-a",
    transformation: index === 5 ? "jpeg-90" : null,
  }));
}

test("aligns candidates, reports subgroup/transformation metrics, and preserves pairwise errors", () => {
  const report = evaluateModelBundle({
    primary: records("primary", [0.01, 0.99, 0.02, 0.98, 0.1, 0.9]),
    complementary: records("complementary", [0.2, 0.8, 0.9, 0.7, 0.4, 0.6]),
  }, {
    targetFalsePositiveRate: 0.5,
    minimumCalibrationControls: 1,
    minimumEvaluationSamples: 2,
    abstentionMargin: 0,
    productionGate: {
      minimumGeneratedRecall: 0,
      maximumFalsePositiveRate: 1,
      minimumSubgroupRecords: 1,
      minimumTransformationRecords: 1,
      requireBothLabels: true,
    },
    minimumSharedSamples: 6,
    sourceEligibility: { primary: true, complementary: true },
  }, "2026-08-04T00:00:00.000Z");

  assert.deepEqual(report.detectorIds, ["complementary", "primary"]);
  assert.equal(report.sharedSamples, 6);
  assert.equal(report.domains.primary["generator-a"].generated, 3);
  assert.equal(report.transformations.primary["jpeg-90"].records, 1);
  assert.equal(report.pairwiseErrorOverlap.primary.complementary.sharedSamples, 6);
  assert.ok("jaccard" in report.pairwiseErrorOverlap.primary.complementary);
});

test("blocks a bundle with duplicate samples or insufficient shared controls", () => {
  const duplicate = records("primary", [0.1, 0.9]);
  duplicate.push({ ...duplicate[0], recordId: "duplicate" });
  assert.throws(() => evaluateModelBundle({ primary: duplicate, complementary: records("complementary", [0.1, 0.9]) }, {
    targetFalsePositiveRate: 0.1,
    minimumCalibrationControls: 1,
    minimumEvaluationSamples: 1,
    abstentionMargin: 0.01,
    minimumSharedSamples: 1,
  }), /duplicate_sample/);

  const report = evaluateModelBundle({ primary: records("primary", [0.1, 0.9]), complementary: records("complementary", [0.1, 0.9]).slice(0, 1) }, {
    targetFalsePositiveRate: 0.1,
    minimumCalibrationControls: 1,
    minimumEvaluationSamples: 1,
    abstentionMargin: 0.01,
    minimumSharedSamples: 2,
  });
  assert.equal(report.promotable, false);
  assert.ok(report.promotionReasons.some((reason) => reason.startsWith("shared_samples_insufficient:")));
});
