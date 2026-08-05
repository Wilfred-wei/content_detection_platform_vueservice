import type { DdaShadowComparisonRecord } from "./dda-model-detector.js";

export type DdaShadowTruthLabel = "ai_generated" | "non_ai";

export interface DdaShadowTruthRecord {
  assetSha256: string;
  label: DdaShadowTruthLabel;
  subgroup?: string;
}

interface RouteMetrics {
  labeledRecords: number;
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
  accuracy: number | null;
  generatedRecall: number | null;
  realFalsePositiveRate: number | null;
}

export interface DdaShadowEvaluationReport {
  schemaVersion: "dda-shadow-evaluation.v1";
  generatedAt: string;
  audit: {
    records: number;
    uniqueAssets: number;
    pairedCompleted: number;
    baselineFailures: number;
    candidateFailures: number;
    directionComparable: number;
    directionAgreements: number;
    directionDisagreements: number;
    directionAgreementRate: number | null;
    meanScoreDeltaCandidateMinusBaseline: number | null;
    baselineLatencyMs: { p50: number | null; p95: number | null };
    candidateLatencyMs: { p50: number | null; p95: number | null };
  };
  labels: {
    supplied: number;
    matchedRecords: number;
    baseline: RouteMetrics;
    candidate: RouteMetrics;
    candidateAccuracyDelta: number | null;
    subgroups: Record<string, { records: number; baseline: RouteMetrics; candidate: RouteMetrics }>;
  };
  promotion: {
    status: "observational_only";
    promotionAuthorized: false;
    automaticPolicyMutation: false;
    reasons: string[];
  };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_DDA_SHADOW_EVALUATION:${field}`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`INVALID_DDA_SHADOW_EVALUATION:${field}`);
  }
  return value.trim();
}

function sha256(value: unknown, field: string): string {
  const normalized = text(value, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`INVALID_DDA_SHADOW_EVALUATION:${field}`);
  return normalized;
}

function nullableScore(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`INVALID_DDA_SHADOW_EVALUATION:${field}`);
  }
  return value;
}

function nullableLatency(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`INVALID_DDA_SHADOW_EVALUATION:${field}`);
  }
  return value;
}

function predictedClass(value: unknown, field: string): "ai_generated" | "non_ai" | null {
  if (value === null) return null;
  if (value !== "ai_generated" && value !== "non_ai") {
    throw new Error(`INVALID_DDA_SHADOW_EVALUATION:${field}`);
  }
  return value;
}

export function parseDdaShadowAuditJsonl(raw: string): DdaShadowComparisonRecord[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`INVALID_DDA_SHADOW_EVALUATION:audit_json:${index + 1}`);
    }
    const root = object(value, `audit:${index + 1}`);
    const asset = object(root.asset, `audit:${index + 1}:asset`);
    const baseline = object(root.baseline, `audit:${index + 1}:baseline`);
    const candidate = object(root.candidate, `audit:${index + 1}:candidate`);
    const comparison = object(root.comparison, `audit:${index + 1}:comparison`);
    if (root.schemaVersion !== "dda-shadow-comparison.v1"
      || root.decisionAuthority !== "none" || root.productionSwapAuthorized !== false
      || !["completed", "failed"].includes(String(baseline.status))
      || !["completed", "failed"].includes(String(candidate.status))
      || !["agreement", "disagreement", "unavailable"].includes(String(comparison.directionAgreement))) {
      throw new Error(`INVALID_DDA_SHADOW_EVALUATION:audit_contract:${index + 1}`);
    }
    sha256(asset.sha256, `audit:${index + 1}:assetSha256`);
    sha256(candidate.manifestSha256, `audit:${index + 1}:manifestSha256`);
    nullableScore(baseline.score, `audit:${index + 1}:baselineScore`);
    nullableScore(candidate.score, `audit:${index + 1}:candidateScore`);
    nullableLatency(baseline.latencyMs, `audit:${index + 1}:baselineLatency`);
    nullableLatency(candidate.latencyMs, `audit:${index + 1}:candidateLatency`);
    predictedClass(baseline.predictedClass, `audit:${index + 1}:baselineDirection`);
    predictedClass(candidate.predictedClass, `audit:${index + 1}:candidateDirection`);
    return value as DdaShadowComparisonRecord;
  });
}

export function parseDdaShadowTruthJsonl(raw: string): DdaShadowTruthRecord[] {
  const labels = new Map<string, DdaShadowTruthRecord>();
  raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`INVALID_DDA_SHADOW_EVALUATION:truth_json:${index + 1}`);
    }
    const record = object(value, `truth:${index + 1}`);
    const assetSha256 = sha256(record.assetSha256, `truth:${index + 1}:assetSha256`);
    if (record.label !== "ai_generated" && record.label !== "non_ai") {
      throw new Error(`INVALID_DDA_SHADOW_EVALUATION:truth:${index + 1}:label`);
    }
    const normalized: DdaShadowTruthRecord = {
      assetSha256,
      label: record.label,
      ...(record.subgroup === undefined ? {} : { subgroup: text(record.subgroup, `truth:${index + 1}:subgroup`, 120) }),
    };
    const previous = labels.get(assetSha256);
    if (previous && (previous.label !== normalized.label || previous.subgroup !== normalized.subgroup)) {
      throw new Error(`INVALID_DDA_SHADOW_EVALUATION:truth_conflict:${assetSha256}`);
    }
    labels.set(assetSha256, normalized);
  });
  return [...labels.values()];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function mean(values: number[]): number | null {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)] ?? null;
}

function routeMetrics(
  pairs: Array<{ truth: DdaShadowTruthLabel; prediction: "ai_generated" | "non_ai" | null }>,
): RouteMetrics {
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const pair of pairs) {
    if (pair.prediction === null) continue;
    if (pair.truth === "ai_generated" && pair.prediction === "ai_generated") truePositive += 1;
    if (pair.truth === "non_ai" && pair.prediction === "non_ai") trueNegative += 1;
    if (pair.truth === "non_ai" && pair.prediction === "ai_generated") falsePositive += 1;
    if (pair.truth === "ai_generated" && pair.prediction === "non_ai") falseNegative += 1;
  }
  const labeledRecords = truePositive + trueNegative + falsePositive + falseNegative;
  return {
    labeledRecords,
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    accuracy: ratio(truePositive + trueNegative, labeledRecords),
    generatedRecall: ratio(truePositive, truePositive + falseNegative),
    realFalsePositiveRate: ratio(falsePositive, falsePositive + trueNegative),
  };
}

export function evaluateDdaShadow(
  records: readonly DdaShadowComparisonRecord[],
  truthRecords: readonly DdaShadowTruthRecord[] = [],
  generatedAt = new Date().toISOString(),
): DdaShadowEvaluationReport {
  const truthBySha = new Map(truthRecords.map((record) => [record.assetSha256, record]));
  const paired = records.filter((record) => record.baseline.status === "completed" && record.candidate.status === "completed");
  const comparable = paired.filter((record) => record.comparison.directionAgreement !== "unavailable");
  const scoreDeltas = paired.map((record) => record.comparison.scoreDeltaCandidateMinusBaseline)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const baselineLatencies = records.map((record) => record.baseline.latencyMs)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const candidateLatencies = records.map((record) => record.candidate.latencyMs)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const matched = records.flatMap((record) => {
    const truth = truthBySha.get(record.asset.sha256);
    return truth ? [{ record, truth }] : [];
  });
  const baselinePairs = matched.map(({ record, truth }) => ({ truth: truth.label, prediction: record.baseline.predictedClass }));
  const candidatePairs = matched.map(({ record, truth }) => ({ truth: truth.label, prediction: record.candidate.predictedClass }));
  const baselineMetrics = routeMetrics(baselinePairs);
  const candidateMetrics = routeMetrics(candidatePairs);
  const subgroupNames = [...new Set(matched.map(({ truth }) => truth.subgroup).filter((value): value is string => Boolean(value)))].sort();
  const subgroups = Object.fromEntries(subgroupNames.map((subgroup) => {
    const selected = matched.filter(({ truth }) => truth.subgroup === subgroup);
    return [subgroup, {
      records: selected.length,
      baseline: routeMetrics(selected.map(({ record, truth }) => ({ truth: truth.label, prediction: record.baseline.predictedClass }))),
      candidate: routeMetrics(selected.map(({ record, truth }) => ({ truth: truth.label, prediction: record.candidate.predictedClass }))),
    }];
  }));
  const reasons = [
    "shadow_statistics_do_not_mutate_policy",
    "production_swap_requires_a_separate_immutable_promotion_bundle",
  ];
  if (truthRecords.length === 0) reasons.push("source_labels_not_supplied");
  if (truthRecords.length > 0 && matched.length < records.length) reasons.push("some_shadow_records_have_no_source_label");

  return {
    schemaVersion: "dda-shadow-evaluation.v1",
    generatedAt,
    audit: {
      records: records.length,
      uniqueAssets: new Set(records.map((record) => record.asset.sha256)).size,
      pairedCompleted: paired.length,
      baselineFailures: records.filter((record) => record.baseline.status === "failed").length,
      candidateFailures: records.filter((record) => record.candidate.status === "failed").length,
      directionComparable: comparable.length,
      directionAgreements: comparable.filter((record) => record.comparison.directionAgreement === "agreement").length,
      directionDisagreements: comparable.filter((record) => record.comparison.directionAgreement === "disagreement").length,
      directionAgreementRate: ratio(
        comparable.filter((record) => record.comparison.directionAgreement === "agreement").length,
        comparable.length,
      ),
      meanScoreDeltaCandidateMinusBaseline: mean(scoreDeltas),
      baselineLatencyMs: { p50: percentile(baselineLatencies, 0.5), p95: percentile(baselineLatencies, 0.95) },
      candidateLatencyMs: { p50: percentile(candidateLatencies, 0.5), p95: percentile(candidateLatencies, 0.95) },
    },
    labels: {
      supplied: truthRecords.length,
      matchedRecords: matched.length,
      baseline: baselineMetrics,
      candidate: candidateMetrics,
      candidateAccuracyDelta: baselineMetrics.accuracy === null || candidateMetrics.accuracy === null
        ? null : candidateMetrics.accuracy - baselineMetrics.accuracy,
      subgroups,
    },
    promotion: {
      status: "observational_only",
      promotionAuthorized: false,
      automaticPolicyMutation: false,
      reasons,
    },
  };
}
