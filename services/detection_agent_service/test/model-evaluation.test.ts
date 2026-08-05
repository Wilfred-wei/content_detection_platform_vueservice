import assert from "node:assert/strict";
import test from "node:test";

import { evaluateModelRecords, parseModelEvaluationRecords, type ModelEvaluationRecord } from "../src/model-evaluation.js";

function record(overrides: Partial<ModelEvaluationRecord>): ModelEvaluationRecord {
  return {
    recordId: `${overrides.detectorId || "dda"}-${overrides.sampleId || Math.random()}`,
    sampleId: overrides.sampleId || "sample",
    detectorId: overrides.detectorId || "dda",
    partition: overrides.partition || "evaluation",
    label: overrides.label || "real",
    score: overrides.score ?? 0.1,
    subgroup: overrides.subgroup || "photo",
    transformation: overrides.transformation || null,
    ...overrides,
  };
}

test("computes fixed-FPR recall, calibration, subgroups, transformations, and overlap", () => {
  const records = [
    record({ recordId: "c1", sampleId: "c1", partition: "calibration", label: "real", score: 0.1 }),
    record({ recordId: "c2", sampleId: "c2", partition: "calibration", label: "real", score: 0.2 }),
    record({ recordId: "c3", sampleId: "c3", partition: "calibration", label: "real", score: 0.3 }),
    record({ recordId: "e1", sampleId: "e1", label: "ai_generated", score: 0.9, outcome: "detected", latencyMs: 10, transformation: "resize" }),
    record({ recordId: "e2", sampleId: "e2", label: "real", score: 0.1, outcome: "not_detected", latencyMs: 20, transformation: "resize" }),
    record({ recordId: "e3", sampleId: "e3", label: "ai_generated", score: 0.49, outcome: "abstained", latencyMs: 30, subgroup: "portrait" }),
    record({ recordId: "m1", sampleId: "e1", detectorId: "mirror", label: "ai_generated", score: 0.1, outcome: "not_detected", latencyMs: 40 }),
  ];
  const parsed = parseModelEvaluationRecords(JSON.parse(JSON.stringify(records)));
  const report = evaluateModelRecords(parsed, { targetFalsePositiveRate: 0, minimumCalibrationControls: 3, minimumEvaluationSamples: 3, abstentionMargin: 0.01 });
  assert.equal(report.fixedFpr.status, "computed");
  assert.equal(report.fixedFpr.threshold, 0.3);
  assert.equal(report.confusion.abstained, 1);
  assert.ok(report.subgroups.portrait);
  assert.equal(report.transformations.resize.records, 2);
  assert.equal(report.errorOverlap.dda.mirror.sharedSamples, 0);
  assert.equal(report.latency.p95Ms, 40);
  assert.equal(report.promotable, true);
});

test("blocks promotion when calibration or evaluation volume is insufficient", () => {
  const report = evaluateModelRecords([record({ partition: "calibration", label: "real" })], { targetFalsePositiveRate: 0.01, minimumCalibrationControls: 2, minimumEvaluationSamples: 2, abstentionMargin: 0.05 });
  assert.equal(report.promotable, false);
  assert.ok(report.promotionReasons.includes("insufficient_calibration_controls"));
  assert.throws(() => parseModelEvaluationRecords([{ score: 2 }]), /INVALID_MODEL_EVALUATION/);
});

test("separates descriptive metrics from the explicit production accuracy gate", () => {
  const records = [
    record({ recordId: "cal-real-1", sampleId: "cal-real-1", partition: "calibration", label: "real", score: 0.1 }),
    record({ recordId: "cal-real-2", sampleId: "cal-real-2", partition: "calibration", label: "real", score: 0.2 }),
    record({ recordId: "cal-real-3", sampleId: "cal-real-3", partition: "calibration", label: "real", score: 0.3 }),
    record({ recordId: "eval-real", sampleId: "eval-real", partition: "evaluation", label: "real", score: 0.1, outcome: "not_detected", subgroup: "photo" }),
    record({ recordId: "eval-ai", sampleId: "eval-ai", partition: "evaluation", label: "ai_generated", score: 0.4, outcome: "not_detected", subgroup: "t2i" }),
  ];
  const report = evaluateModelRecords(records, {
    targetFalsePositiveRate: 0,
    minimumCalibrationControls: 3,
    minimumEvaluationSamples: 2,
    abstentionMargin: 0,
    productionGate: {
      minimumGeneratedRecall: 0.9,
      maximumFalsePositiveRate: 0.01,
      minimumSubgroupRecords: 1,
      minimumTransformationRecords: 0,
      requireBothLabels: true,
    },
  });
  assert.equal(report.fixedFpr.status, "computed");
  assert.equal(report.promotable, false);
  assert.ok(report.promotionReasons.includes("generated_recall_below_production_gate"));
});
