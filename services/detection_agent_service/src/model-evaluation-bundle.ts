import type {
  ModelEvaluationOptions,
  ModelEvaluationRecord,
  ModelEvaluationReport,
} from "./model-evaluation.js";
import { evaluateModelRecords, parseModelEvaluationRecords } from "./model-evaluation.js";

export interface ModelEvaluationBundleOptions extends ModelEvaluationOptions {
  minimumSharedSamples?: number;
  sourceEligibility?: Readonly<Record<string, boolean>>;
}

export interface ModelGroupMetric {
  records: number;
  real: number;
  generated: number;
  falsePositiveRate: number | null;
  generatedRecall: number | null;
}

export interface PairwiseErrorOverlap {
  sharedSamples: number;
  leftErrors: number;
  rightErrors: number;
  sharedErrors: number;
  unionErrors: number;
  jaccard: number | null;
}

export interface ModelEvaluationBundleReport {
  schemaVersion: "model-evaluation-bundle.v1";
  generatedAt: string;
  detectorIds: string[];
  records: Record<string, number>;
  sharedSamples: number;
  candidates: Record<string, ModelEvaluationReport>;
  domains: Record<string, Record<string, ModelGroupMetric>>;
  transformations: Record<string, Record<string, ModelGroupMetric>>;
  pairwiseErrorOverlap: Record<string, Record<string, PairwiseErrorOverlap>>;
  promotable: boolean;
  promotionReasons: string[];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function groupMetric(records: readonly ModelEvaluationRecord[], classify: (record: ModelEvaluationRecord) => boolean): ModelGroupMetric {
  const selected = records.filter(classify);
  const real = selected.filter((record) => record.label === "real");
  const generated = selected.filter((record) => record.label === "ai_generated");
  return {
    records: selected.length,
    real: real.length,
    generated: generated.length,
    falsePositiveRate: ratio(real.filter((record) => record.outcome === "detected").length, real.length),
    generatedRecall: ratio(generated.filter((record) => record.outcome === "detected").length, generated.length),
  };
}

function outcomeFor(record: ModelEvaluationRecord, report: ModelEvaluationReport, abstentionMargin: number): "detected" | "not_detected" | "abstained" {
  if (record.outcome) return record.outcome;
  const boundary = report.fixedFpr.threshold ?? record.threshold ?? 0.5;
  if (Math.abs(record.score - boundary) <= abstentionMargin) return "abstained";
  return record.score >= boundary ? "detected" : "not_detected";
}

function errorSet(records: readonly ModelEvaluationRecord[], report: ModelEvaluationReport, abstentionMargin: number): Set<string> {
  return new Set(records
    .filter((record) => record.partition === "evaluation")
    .filter((record) => outcomeFor(record, report, abstentionMargin) !== "abstained")
    .filter((record) => (record.label === "ai_generated") !== (outcomeFor(record, report, abstentionMargin) === "detected"))
    .map((record) => record.sampleId));
}

function sharedIds(left: readonly ModelEvaluationRecord[], right: readonly ModelEvaluationRecord[]): Set<string> {
  const rightIds = new Set(right.map((record) => record.sampleId));
  return new Set(left.map((record) => record.sampleId).filter((sampleId) => rightIds.has(sampleId)));
}

function assertUniqueAndConsistent(records: readonly ModelEvaluationRecord[], detectorId: string): void {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.detectorId !== detectorId) throw new Error(`INVALID_MODEL_EVALUATION_BUNDLE:detector_mismatch:${detectorId}`);
    if (ids.has(record.sampleId)) throw new Error(`INVALID_MODEL_EVALUATION_BUNDLE:duplicate_sample:${detectorId}:${record.sampleId}`);
    ids.add(record.sampleId);
  }
}

export function evaluateModelBundle(
  input: Readonly<Record<string, readonly ModelEvaluationRecord[]>>,
  options: ModelEvaluationBundleOptions,
  generatedAt = new Date().toISOString(),
): ModelEvaluationBundleReport {
  const detectorIds = Object.keys(input).sort();
  if (detectorIds.length === 0) throw new Error("INVALID_MODEL_EVALUATION_BUNDLE:no_candidates");
  const minimumSharedSamples = options.minimumSharedSamples ?? 100;
  if (!Number.isInteger(minimumSharedSamples) || minimumSharedSamples < 1) throw new Error("INVALID_MODEL_EVALUATION_BUNDLE:minimum_shared_samples");

  const candidates: Record<string, ModelEvaluationReport> = {};
  const normalized: Record<string, ModelEvaluationRecord[]> = {};
  const promotionReasons: string[] = [];
  for (const detectorId of detectorIds) {
    const parsed = parseModelEvaluationRecords(input[detectorId]);
    assertUniqueAndConsistent(parsed, detectorId);
    normalized[detectorId] = parsed;
    candidates[detectorId] = evaluateModelRecords(parsed, options, generatedAt);
    if (!candidates[detectorId].promotable) promotionReasons.push(`candidate_not_promotable:${detectorId}`);
    if (options.sourceEligibility?.[detectorId] !== true) promotionReasons.push(`source_not_production_eligible:${detectorId}`);
  }
  if (detectorIds.length < 2) promotionReasons.push("candidate_comparison_requires_two_detectors");

  const firstRecords = normalized[detectorIds[0]];
  const commonIds = detectorIds.slice(1).reduce((ids, detectorId) => {
    const current = new Set(normalized[detectorId].map((record) => record.sampleId));
    return new Set([...ids].filter((sampleId) => current.has(sampleId)));
  }, new Set(firstRecords.map((record) => record.sampleId)));
  const sharedSamples = commonIds.size;
  if (sharedSamples < minimumSharedSamples) promotionReasons.push(`shared_samples_insufficient:${sharedSamples}<${minimumSharedSamples}`);

  for (const detectorId of detectorIds) {
    const records = normalized[detectorId].map((record) => ({ ...record, outcome: outcomeFor(record, candidates[detectorId], options.abstentionMargin) }));
    normalized[detectorId] = records;
  }

  const domains: ModelEvaluationBundleReport["domains"] = {};
  const transformations: ModelEvaluationBundleReport["transformations"] = {};
  for (const detectorId of detectorIds) {
    domains[detectorId] = {};
    transformations[detectorId] = {};
    const domainValues = new Set(normalized[detectorId].map((record) => record.generator || record.subgroup));
    for (const domain of domainValues) domains[detectorId][domain] = groupMetric(normalized[detectorId], (record) => (record.generator || record.subgroup) === domain);
    const transformationValues = new Set(normalized[detectorId].map((record) => record.transformation).filter((value): value is string => Boolean(value)));
    for (const transformation of transformationValues) transformations[detectorId][transformation] = groupMetric(normalized[detectorId], (record) => record.transformation === transformation);
  }

  const pairwiseErrorOverlap: ModelEvaluationBundleReport["pairwiseErrorOverlap"] = {};
  for (const leftId of detectorIds) {
    pairwiseErrorOverlap[leftId] = {};
    for (const rightId of detectorIds) {
      const shared = sharedIds(normalized[leftId], normalized[rightId]);
      const leftErrors = new Set([...errorSet(normalized[leftId], candidates[leftId], options.abstentionMargin)].filter((id) => shared.has(id)));
      const rightErrors = new Set([...errorSet(normalized[rightId], candidates[rightId], options.abstentionMargin)].filter((id) => shared.has(id)));
      const sharedErrors = [...leftErrors].filter((id) => rightErrors.has(id)).length;
      const unionErrors = new Set([...leftErrors, ...rightErrors]).size;
      pairwiseErrorOverlap[leftId][rightId] = {
        sharedSamples: shared.size,
        leftErrors: leftErrors.size,
        rightErrors: rightErrors.size,
        sharedErrors,
        unionErrors,
        jaccard: ratio(sharedErrors, unionErrors),
      };
    }
  }

  return {
    schemaVersion: "model-evaluation-bundle.v1",
    generatedAt,
    detectorIds,
    records: Object.fromEntries(detectorIds.map((detectorId) => [detectorId, normalized[detectorId].length])),
    sharedSamples,
    candidates,
    domains,
    transformations,
    pairwiseErrorOverlap,
    promotable: promotionReasons.length === 0,
    promotionReasons,
  };
}
