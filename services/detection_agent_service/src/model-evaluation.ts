export type ModelEvaluationPartition = "calibration" | "evaluation";
export type ModelEvaluationLabel = "real" | "ai_generated";

export interface ModelEvaluationRecord {
  recordId: string;
  sampleId: string;
  detectorId: string;
  partition: ModelEvaluationPartition;
  label: ModelEvaluationLabel;
  score: number;
  threshold?: number | null;
  outcome?: "detected" | "not_detected" | "abstained";
  subgroup: string;
  generator?: string | null;
  transformation?: string | null;
  latencyMs?: number | null;
}

export interface ModelEvaluationOptions {
  targetFalsePositiveRate: number;
  minimumCalibrationControls: number;
  minimumEvaluationSamples: number;
  abstentionMargin: number;
  /** Optional production release gate. Omitted for descriptive analysis only. */
  productionGate?: {
    minimumGeneratedRecall: number;
    maximumFalsePositiveRate: number;
    minimumSubgroupRecords: number;
    minimumTransformationRecords: number;
    requiredSubgroups?: readonly string[];
    requiredTransformations?: readonly string[];
    requireBothLabels: boolean;
  };
}

export interface ModelEvaluationReport {
  schemaVersion: "model-evaluation-report.v1";
  generatedAt: string;
  detectorIds: string[];
  records: number;
  fixedFpr: {
    status: "computed" | "insufficient_calibration" | "insufficient_evaluation" | "target_unattainable";
    targetFalsePositiveRate: number;
    threshold: number | null;
    falsePositiveRate: number | null;
    generatedRecall: number | null;
  };
  confusion: { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number; abstained: number };
  calibration: { expectedCalibrationError: number | null; bins: Array<{ lower: number; upper: number; count: number; meanScore: number; empiricalRate: number }> };
  subgroups: Record<string, { records: number; accuracy: number | null; falsePositiveRate: number | null; generatedRecall: number | null }>;
  transformations: Record<string, { records: number; accuracy: number | null; generatedRecall: number | null }>;
  errorOverlap: Record<string, Record<string, { sharedSamples: number; leftErrors: number; rightErrors: number }> >;
  latency: { p50Ms: number | null; p95Ms: number | null };
  abstentionRate: number;
  promotable: boolean;
  promotionReasons: string[];
}

function finiteRatio(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`INVALID_MODEL_EVALUATION:${field}`);
  return value;
}

function text(value: unknown, field: string, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`INVALID_MODEL_EVALUATION:${field}`);
  return value.trim();
}

export function parseModelEvaluationRecords(value: unknown): ModelEvaluationRecord[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("INVALID_MODEL_EVALUATION:records");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`INVALID_MODEL_EVALUATION:record:${index}`);
    const raw = item as Record<string, unknown>;
    const partition = raw.partition;
    const label = raw.label;
    if (partition !== "calibration" && partition !== "evaluation") throw new Error(`INVALID_MODEL_EVALUATION:partition:${index}`);
    if (label !== "real" && label !== "ai_generated") throw new Error(`INVALID_MODEL_EVALUATION:label:${index}`);
    const score = finiteRatio(raw.score, `score:${index}`);
    const threshold = raw.threshold === undefined || raw.threshold === null ? null : finiteRatio(raw.threshold, `threshold:${index}`);
    const outcome = raw.outcome === undefined ? undefined : raw.outcome;
    if (outcome !== undefined && outcome !== "detected" && outcome !== "not_detected" && outcome !== "abstained") throw new Error(`INVALID_MODEL_EVALUATION:outcome:${index}`);
    const latencyMs = raw.latencyMs === undefined || raw.latencyMs === null ? null : raw.latencyMs;
    if (latencyMs !== null && (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0)) throw new Error(`INVALID_MODEL_EVALUATION:latency:${index}`);
    return {
      recordId: text(raw.recordId, `recordId:${index}`),
      sampleId: text(raw.sampleId, `sampleId:${index}`),
      detectorId: text(raw.detectorId, `detectorId:${index}`),
      partition,
      label,
      score,
      threshold,
      outcome,
      subgroup: text(raw.subgroup, `subgroup:${index}`),
      generator: raw.generator === undefined || raw.generator === null ? null : text(raw.generator, `generator:${index}`),
      transformation: raw.transformation === undefined || raw.transformation === null ? null : text(raw.transformation, `transformation:${index}`),
      latencyMs,
    };
  });
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function ratio(numerator: number, denominator: number): number | null { return denominator ? numerator / denominator : null; }

function groupMetrics(records: ModelEvaluationRecord[], classify: (record: ModelEvaluationRecord) => boolean): { records: number; accuracy: number | null; falsePositiveRate: number | null; generatedRecall: number | null } {
  const selected = records.filter(classify);
  const predicted = selected.map((record) => record.outcome === "abstained" ? null : record.outcome === "detected");
  const evaluated = selected.filter((_record, index) => predicted[index] !== null);
  const correct = evaluated.filter((record, index) => predicted[selected.indexOf(record)] === (record.label === "ai_generated")).length;
  const real = selected.filter((record) => record.label === "real");
  const generated = selected.filter((record) => record.label === "ai_generated");
  return {
    records: selected.length,
    accuracy: ratio(correct, evaluated.length),
    falsePositiveRate: ratio(real.filter((record) => record.outcome === "detected").length, real.length),
    generatedRecall: ratio(generated.filter((record) => record.outcome === "detected").length, generated.length),
  };
}

export function evaluateModelRecords(
  records: readonly ModelEvaluationRecord[],
  options: ModelEvaluationOptions = { targetFalsePositiveRate: 0.01, minimumCalibrationControls: 100, minimumEvaluationSamples: 100, abstentionMargin: 0.05 },
  generatedAt = new Date().toISOString(),
): ModelEvaluationReport {
  if (!Number.isFinite(options.targetFalsePositiveRate) || options.targetFalsePositiveRate < 0 || options.targetFalsePositiveRate > 1) throw new Error("INVALID_MODEL_EVALUATION:targetFalsePositiveRate");
  const detectorIds = [...new Set(records.map((record) => record.detectorId))].sort();
  const calibrationControls = records.filter((record) => record.partition === "calibration" && record.label === "real");
  const evaluation = records.filter((record) => record.partition === "evaluation");
  const reasons: string[] = [];
  let threshold: number | null = null;
  let fixedStatus: ModelEvaluationReport["fixedFpr"]["status"] = "computed";
  if (calibrationControls.length < options.minimumCalibrationControls) {
    fixedStatus = "insufficient_calibration";
    reasons.push("insufficient_calibration_controls");
  } else if (evaluation.length < options.minimumEvaluationSamples) {
    fixedStatus = "insufficient_evaluation";
    reasons.push("insufficient_evaluation_samples");
  } else {
    const sorted = [...calibrationControls].map((record) => record.score).sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((1 - options.targetFalsePositiveRate) * sorted.length) - 1));
    threshold = sorted[index] ?? null;
    const achievedFpr = calibrationControls.filter((record) => record.score >= (threshold ?? 1)).length / calibrationControls.length;
    if (achievedFpr > options.targetFalsePositiveRate && threshold === 1) {
      fixedStatus = "target_unattainable";
      reasons.push("target_false_positive_rate_unattainable");
    }
  }
  const evaluated = evaluation.map((record) => {
    const boundary = threshold ?? record.threshold ?? 0.5;
    const outcome = record.outcome || (Math.abs(record.score - boundary) <= options.abstentionMargin ? "abstained" : record.score >= boundary ? "detected" : "not_detected");
    return { ...record, outcome };
  });
  const confusion = {
    truePositive: evaluated.filter((record) => record.label === "ai_generated" && record.outcome === "detected").length,
    falsePositive: evaluated.filter((record) => record.label === "real" && record.outcome === "detected").length,
    trueNegative: evaluated.filter((record) => record.label === "real" && record.outcome === "not_detected").length,
    falseNegative: evaluated.filter((record) => record.label === "ai_generated" && record.outcome === "not_detected").length,
    abstained: evaluated.filter((record) => record.outcome === "abstained").length,
  };
  const bins = Array.from({ length: 10 }, (_unused, index) => {
    const lower = index / 10;
    const upper = (index + 1) / 10;
    const bin = evaluated.filter((record) => record.score >= lower && (index === 9 ? record.score <= upper : record.score < upper));
    return { lower, upper, count: bin.length, meanScore: ratio(bin.reduce((sum, record) => sum + record.score, 0), bin.length) || 0, empiricalRate: ratio(bin.filter((record) => record.label === "ai_generated").length, bin.length) || 0 };
  });
  const calibration = { expectedCalibrationError: ratio(bins.reduce((sum, bin) => sum + bin.count * Math.abs(bin.meanScore - bin.empiricalRate), 0), evaluated.length), bins };
  const subgroups: ModelEvaluationReport["subgroups"] = {};
  for (const subgroup of new Set(evaluated.map((record) => record.subgroup))) subgroups[subgroup] = groupMetrics(evaluated, (record) => record.subgroup === subgroup);
  const transformations: ModelEvaluationReport["transformations"] = {};
  for (const transformation of new Set(evaluated.map((record) => record.transformation).filter((value): value is string => Boolean(value))) as Set<string>) transformations[transformation] = groupMetrics(evaluated, (record) => record.transformation === transformation);
  const errorOverlap: ModelEvaluationReport["errorOverlap"] = {};
  const byDetector = new Map<string, ModelEvaluationRecord[]>();
  for (const record of evaluated) byDetector.set(record.detectorId, [...(byDetector.get(record.detectorId) || []), record]);
  for (const left of detectorIds) {
    errorOverlap[left] = {};
    for (const right of detectorIds) {
      const leftErrors = new Set((byDetector.get(left) || []).filter((record) => (record.label === "ai_generated") !== (record.outcome === "detected") && record.outcome !== "abstained").map((record) => record.sampleId));
      const rightErrors = new Set((byDetector.get(right) || []).filter((record) => (record.label === "ai_generated") !== (record.outcome === "detected") && record.outcome !== "abstained").map((record) => record.sampleId));
      errorOverlap[left][right] = { sharedSamples: [...leftErrors].filter((sampleId) => rightErrors.has(sampleId)).length, leftErrors: leftErrors.size, rightErrors: rightErrors.size };
    }
  }
  const latencyValues = evaluated.map((record) => record.latencyMs).filter((value): value is number => typeof value === "number");
  const realCount = evaluated.filter((record) => record.label === "real").length;
  const generatedCount = evaluated.filter((record) => record.label === "ai_generated").length;
  const falsePositiveRate = ratio(confusion.falsePositive, realCount);
  const generatedRecall = ratio(confusion.truePositive, generatedCount);
  if (fixedStatus === "computed" && (falsePositiveRate === null || generatedRecall === null)) reasons.push("missing_label_partition");
  const gate = options.productionGate;
  if (gate) {
    if (!Number.isFinite(gate.minimumGeneratedRecall) || gate.minimumGeneratedRecall < 0 || gate.minimumGeneratedRecall > 1) throw new Error("INVALID_MODEL_EVALUATION:minimumGeneratedRecall");
    if (!Number.isFinite(gate.maximumFalsePositiveRate) || gate.maximumFalsePositiveRate < 0 || gate.maximumFalsePositiveRate > 1) throw new Error("INVALID_MODEL_EVALUATION:maximumFalsePositiveRate");
    if (!Number.isInteger(gate.minimumSubgroupRecords) || gate.minimumSubgroupRecords < 1) throw new Error("INVALID_MODEL_EVALUATION:minimumSubgroupRecords");
    if (!Number.isInteger(gate.minimumTransformationRecords) || gate.minimumTransformationRecords < 0) throw new Error("INVALID_MODEL_EVALUATION:minimumTransformationRecords");
    if (gate.requireBothLabels && (realCount === 0 || generatedCount === 0)) reasons.push("evaluation_missing_both_labels");
    if (generatedRecall === null || generatedRecall < gate.minimumGeneratedRecall) reasons.push("generated_recall_below_production_gate");
    if (falsePositiveRate === null || falsePositiveRate > gate.maximumFalsePositiveRate) reasons.push("false_positive_rate_above_production_gate");
    for (const subgroup of gate.requiredSubgroups || []) {
      if (!subgroups[subgroup] || subgroups[subgroup].records < gate.minimumSubgroupRecords) reasons.push(`subgroup_insufficient:${subgroup}`);
    }
    for (const transformation of gate.requiredTransformations || []) {
      if (!transformations[transformation] || transformations[transformation].records < gate.minimumTransformationRecords) reasons.push(`transformation_insufficient:${transformation}`);
    }
    for (const [subgroup, metrics] of Object.entries(subgroups)) {
      if (metrics.records < gate.minimumSubgroupRecords) reasons.push(`subgroup_insufficient:${subgroup}`);
    }
    for (const [transformation, metrics] of Object.entries(transformations)) {
      if (metrics.records < gate.minimumTransformationRecords) reasons.push(`transformation_insufficient:${transformation}`);
    }
  }
  const promotable = fixedStatus === "computed" && reasons.length === 0;
  return {
    schemaVersion: "model-evaluation-report.v1",
    generatedAt,
    detectorIds,
    records: records.length,
    fixedFpr: { status: fixedStatus, targetFalsePositiveRate: options.targetFalsePositiveRate, threshold, falsePositiveRate, generatedRecall },
    confusion,
    calibration,
    subgroups,
    transformations,
    errorOverlap,
    latency: { p50Ms: percentile(latencyValues, 0.5), p95Ms: percentile(latencyValues, 0.95) },
    abstentionRate: ratio(confusion.abstained, evaluated.length) || 0,
    promotable,
    promotionReasons: reasons,
  };
}
