import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadProvenanceRegistry } from "./provenance-registry.js";
import { loadProvenanceReleaseGateRegistry, wilsonUpperBound95 } from "./provenance-release-gates.js";

export type ProvenanceEvaluationPartition = "calibration" | "evaluation";
export type ProvenanceEvaluationLabel = "marked_positive" | "unmarked_control";
export type ProvenanceTransformationCategory =
  | "original"
  | "resize"
  | "recompression"
  | "crop"
  | "screenshot"
  | "blur"
  | "color_edit"
  | "overlay"
  | "metadata_removal"
  | "forged_label"
  | "forged_metadata"
  | "adversarial";
export type ProvenanceEvaluationOutcome = "positive" | "negative" | "unavailable" | "unsupported" | "timeout" | "error";

export interface ProvenanceSchemeObservation {
  schemaVersion: "provenance-scheme-observation.v1";
  evaluationRunId: string;
  recordId: string;
  sampleId: string;
  assetSha256: string;
  datasetManifestSha256: string;
  transformationSuiteSha256: string;
  schemeId: string;
  profileId: string;
  configurationId: string;
  partition: ProvenanceEvaluationPartition;
  label: ProvenanceEvaluationLabel;
  transformationId: string;
  transformationCategory: ProvenanceTransformationCategory;
  viewPolicyId: string;
  attemptedViews: number;
  detection: {
    outcome: ProvenanceEvaluationOutcome;
    positive: boolean | null;
    score: number | null;
    threshold: number | null;
  };
  performance: {
    latencyMs: number;
    cpuTimeMs: number;
    peakRssBytes: number;
    gpuTimeMs: number | null;
    peakGpuMemoryBytes: number | null;
  };
}

export interface ProvenanceSchemeMetricReport {
  schemeId: string;
  profileId: string;
  configurationId: string;
  observations: number;
  outcomes: Record<ProvenanceEvaluationOutcome, number>;
  currentPolicy: {
    evaluationMarked: number;
    truePositives: number;
    recall: number | null;
    evaluationControls: number;
    falsePositives: number;
    falsePositiveRate: number | null;
    falsePositiveWilsonUpper95: number | null;
  };
  fixedFpr: {
    targetFalsePositiveRate: number;
    status: "computed" | "not_applicable_no_score" | "insufficient_calibration_controls" | "target_unattainable" | "insufficient_evaluation_data";
    threshold: number | null;
    calibrationControls: number;
    evaluationMarked: number;
    recall: number | null;
    evaluationControls: number;
    falsePositiveRate: number | null;
    falsePositiveWilsonUpper95: number | null;
  };
  multiView: {
    completeCalibrationData: boolean;
    policies: Array<{
      viewPolicyId: string;
      observations: number;
      attemptedViewsMean: number;
      recall: number | null;
      falsePositiveRate: number | null;
      fixedFprStatus: ProvenanceSchemeMetricReport["fixedFpr"]["status"];
      fixedFprThreshold: number | null;
      fixedFprRecall: number | null;
      fixedFprFalsePositiveRate: number | null;
    }>;
  };
  transformationRobustness: Array<{
    category: ProvenanceTransformationCategory;
    markedCases: number;
    detectedCases: number;
    recall: number | null;
  }>;
  latencyMs: DistributionSummary;
  resourceCost: {
    cpuTimeMs: DistributionSummary;
    peakRssBytes: DistributionSummary;
    gpuTimeMs: DistributionSummary | null;
    peakGpuMemoryBytes: DistributionSummary | null;
    attemptedViews: DistributionSummary;
  };
  releaseGateReadiness: {
    eligible: false;
    unmarkedControlCountMet: boolean;
    falsePositiveRateMet: boolean;
    falsePositiveWilsonUpperMet: boolean;
    requiredTransformationsCovered: boolean;
    reasons: string[];
  };
}

export interface DistributionSummary {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface ProvenanceSchemeEvaluationReport {
  schemaVersion: "provenance-scheme-evaluation-report.v1";
  evaluatorVersion: "provenance-scheme-evaluator.v1";
  evaluatorSha256: string;
  evaluationRunId: string;
  inputSha256: string;
  datasetManifestSha256: string;
  transformationSuiteSha256: string;
  provenanceRegistryVersion: string;
  releaseGateRegistryVersion: string;
  targetFalsePositiveRate: number;
  generatedAt: string;
  productionEvidenceEligible: false;
  shortCircuitEligible: false;
  automaticPolicyMutation: false;
  metrics: ProvenanceSchemeMetricReport[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const EVALUATOR_IMPLEMENTATION_PATH = fileURLToPath(import.meta.url);
const PARTITIONS: readonly ProvenanceEvaluationPartition[] = ["calibration", "evaluation"];
const LABELS: readonly ProvenanceEvaluationLabel[] = ["marked_positive", "unmarked_control"];
const TRANSFORMATIONS: readonly ProvenanceTransformationCategory[] = [
  "original", "resize", "recompression", "crop", "screenshot", "blur", "color_edit", "overlay",
  "metadata_removal", "forged_label", "forged_metadata", "adversarial",
];
const OUTCOMES: readonly ProvenanceEvaluationOutcome[] = ["positive", "negative", "unavailable", "unsupported", "timeout", "error"];

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function provenanceSchemeEvaluationDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_PROVENANCE_SCHEME_OBSERVATION:${field}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`INVALID_PROVENANCE_SCHEME_OBSERVATION:${field}:fields`);
  }
}

function text(value: unknown, field: string, maximum = 200): string {
  if (typeof value !== "string") throw new Error(`INVALID_PROVENANCE_SCHEME_OBSERVATION:${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f]/.test(normalized)) {
    throw new Error(`INVALID_PROVENANCE_SCHEME_OBSERVATION:${field}`);
  }
  return normalized;
}

function sha256(value: unknown, field: string): string {
  const normalized = text(value, field, 64).toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(`INVALID_PROVENANCE_SCHEME_OBSERVATION:${field}`);
  return normalized;
}

function nonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`INVALID_PROVENANCE_SCHEME_OBSERVATION:${field}`);
  }
  return value;
}

function optionalNonNegative(value: unknown, field: string): number | null {
  return value === null ? null : nonNegative(value, field);
}

function optionalScore(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`INVALID_PROVENANCE_SCHEME_OBSERVATION:${field}`);
  }
  return value;
}

export function parseProvenanceSchemeObservation(value: unknown): ProvenanceSchemeObservation {
  const root = object(value, "root");
  exactKeys(root, [
    "schemaVersion", "evaluationRunId", "recordId", "sampleId", "assetSha256", "datasetManifestSha256",
    "transformationSuiteSha256", "schemeId", "profileId", "configurationId", "partition", "label",
    "transformationId", "transformationCategory", "viewPolicyId", "attemptedViews", "detection", "performance",
  ], "root");
  if (root.schemaVersion !== "provenance-scheme-observation.v1") {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:schemaVersion");
  }
  if (!PARTITIONS.includes(root.partition as ProvenanceEvaluationPartition)) {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:partition");
  }
  if (!LABELS.includes(root.label as ProvenanceEvaluationLabel)) {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:label");
  }
  if (!TRANSFORMATIONS.includes(root.transformationCategory as ProvenanceTransformationCategory)) {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:transformationCategory");
  }
  if (!Number.isInteger(root.attemptedViews) || (root.attemptedViews as number) < 0 || (root.attemptedViews as number) > 256) {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:attemptedViews");
  }
  const detection = object(root.detection, "detection");
  exactKeys(detection, ["outcome", "positive", "score", "threshold"], "detection");
  if (!OUTCOMES.includes(detection.outcome as ProvenanceEvaluationOutcome)) {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:detection:outcome");
  }
  if (detection.positive !== null && typeof detection.positive !== "boolean") {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:detection:positive");
  }
  const score = optionalScore(detection.score, "detection:score");
  const threshold = optionalScore(detection.threshold, "detection:threshold");
  const completed = detection.outcome === "positive" || detection.outcome === "negative";
  if (
    (completed && typeof detection.positive !== "boolean")
    || (!completed && detection.positive !== null)
    || (detection.outcome === "positive" && detection.positive !== true)
    || (detection.outcome === "negative" && detection.positive !== false)
    || (score === null) !== (threshold === null)
  ) {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:detection:consistency");
  }
  const performance = object(root.performance, "performance");
  exactKeys(performance, ["latencyMs", "cpuTimeMs", "peakRssBytes", "gpuTimeMs", "peakGpuMemoryBytes"], "performance");
  const registry = loadProvenanceRegistry();
  const schemeId = text(root.schemeId, "schemeId", 160);
  const profileId = text(root.profileId, "profileId", 160);
  const scheme = registry.schemes.find((candidate) => candidate.id === schemeId);
  const profileMatches = scheme && (
    scheme.execution.profiles.some((profile) => profile.id === profileId)
    || (scheme.execution.profiles.length === 0 && profileId === "scheme-default")
  );
  if (!scheme || !profileMatches) {
    throw new Error("INVALID_PROVENANCE_SCHEME_OBSERVATION:schemeProfile");
  }
  return {
    schemaVersion: "provenance-scheme-observation.v1",
    evaluationRunId: text(root.evaluationRunId, "evaluationRunId", 160),
    recordId: text(root.recordId, "recordId", 200),
    sampleId: text(root.sampleId, "sampleId", 200),
    assetSha256: sha256(root.assetSha256, "assetSha256"),
    datasetManifestSha256: sha256(root.datasetManifestSha256, "datasetManifestSha256"),
    transformationSuiteSha256: sha256(root.transformationSuiteSha256, "transformationSuiteSha256"),
    schemeId,
    profileId,
    configurationId: text(root.configurationId, "configurationId", 160),
    partition: root.partition as ProvenanceEvaluationPartition,
    label: root.label as ProvenanceEvaluationLabel,
    transformationId: text(root.transformationId, "transformationId", 160),
    transformationCategory: root.transformationCategory as ProvenanceTransformationCategory,
    viewPolicyId: text(root.viewPolicyId, "viewPolicyId", 160),
    attemptedViews: root.attemptedViews as number,
    detection: {
      outcome: detection.outcome as ProvenanceEvaluationOutcome,
      positive: detection.positive as boolean | null,
      score,
      threshold,
    },
    performance: {
      latencyMs: nonNegative(performance.latencyMs, "performance:latencyMs"),
      cpuTimeMs: nonNegative(performance.cpuTimeMs, "performance:cpuTimeMs"),
      peakRssBytes: nonNegative(performance.peakRssBytes, "performance:peakRssBytes"),
      gpuTimeMs: optionalNonNegative(performance.gpuTimeMs, "performance:gpuTimeMs"),
      peakGpuMemoryBytes: optionalNonNegative(performance.peakGpuMemoryBytes, "performance:peakGpuMemoryBytes"),
    },
  };
}

export function parseProvenanceSchemeObservationJsonl(input: string): ProvenanceSchemeObservation[] {
  const records = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return parseProvenanceSchemeObservation(JSON.parse(line) as unknown);
      } catch (error) {
        throw new Error(`INVALID_PROVENANCE_SCHEME_OBSERVATION_JSONL:${index + 1}:${error instanceof Error ? error.message : "unknown"}`);
      }
    });
  if (records.length === 0) throw new Error("EMPTY_PROVENANCE_SCHEME_OBSERVATIONS");
  if (new Set(records.map((record) => record.recordId)).size !== records.length) {
    throw new Error("DUPLICATE_PROVENANCE_SCHEME_OBSERVATION");
  }
  if (new Set(records.map(logicalObservationKey)).size !== records.length) {
    throw new Error("DUPLICATE_PROVENANCE_SCHEME_OBSERVATION_LOGICAL_KEY");
  }
  const runIds = new Set(records.map((record) => record.evaluationRunId));
  const datasetDigests = new Set(records.map((record) => record.datasetManifestSha256));
  const transformationDigests = new Set(records.map((record) => record.transformationSuiteSha256));
  if (runIds.size !== 1 || datasetDigests.size !== 1 || transformationDigests.size !== 1) {
    throw new Error("MIXED_PROVENANCE_SCHEME_EVALUATION_INPUT");
  }
  return records;
}

export function loadProvenanceSchemeObservationJsonl(path: string): ProvenanceSchemeObservation[] {
  return parseProvenanceSchemeObservationJsonl(readFileSync(path, "utf8"));
}

function distribution(values: number[]): DistributionSummary {
  if (values.length === 0) throw new Error("EMPTY_DISTRIBUTION");
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio: number) => sorted[Math.max(0, Math.ceil(ratio * sorted.length) - 1)];
  return {
    count: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[sorted.length - 1],
  };
}

function optionalDistribution(values: Array<number | null>): DistributionSummary | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? distribution(present) : null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function completed(records: ProvenanceSchemeObservation[]): ProvenanceSchemeObservation[] {
  return records.filter((record) => record.detection.positive !== null);
}

function freezeThreshold(controlScores: number[], targetFpr: number): number | null {
  if (controlScores.length === 0) return null;
  const unique = [...new Set(controlScores)].sort((left, right) => left - right);
  const maximum = unique[unique.length - 1];
  const aboveMaximum = maximum < 1 ? (maximum + 1) / 2 : null;
  const candidates = aboveMaximum === null ? unique : [...unique, aboveMaximum];
  for (const threshold of candidates.sort((left, right) => left - right)) {
    const falsePositiveRate = controlScores.filter((score) => score >= threshold).length / controlScores.length;
    if (falsePositiveRate <= targetFpr) return threshold;
  }
  return null;
}

function metricGroupKey(record: ProvenanceSchemeObservation): string {
  return `${record.schemeId}\u0000${record.profileId}\u0000${record.configurationId}`;
}

function logicalObservationKey(record: ProvenanceSchemeObservation): string {
  return [
    record.sampleId,
    record.schemeId,
    record.profileId,
    record.configurationId,
    record.partition,
    record.transformationId,
    record.viewPolicyId,
  ].join("\u0000");
}

function fixedFprMetric(
  records: ProvenanceSchemeObservation[],
  targetFpr: number,
): ProvenanceSchemeMetricReport["fixedFpr"] {
  const calibration = records.filter((record) => record.partition === "calibration" && record.detection.score !== null);
  const calibrationControls = calibration.filter((record) => record.label === "unmarked_control");
  const hasAnyScore = records.some((record) => record.detection.score !== null);
  const threshold = freezeThreshold(calibrationControls.map((record) => record.detection.score as number), targetFpr);
  const evaluationWithScores = records.filter((record) => record.partition === "evaluation" && record.detection.score !== null);
  const marked = evaluationWithScores.filter((record) => record.label === "marked_positive");
  const controls = evaluationWithScores.filter((record) => record.label === "unmarked_control");
  const truePositives = threshold === null ? 0 : marked.filter((record) => (record.detection.score as number) >= threshold).length;
  const falsePositives = threshold === null ? 0 : controls.filter((record) => (record.detection.score as number) >= threshold).length;
  const status = !hasAnyScore
    ? "not_applicable_no_score"
    : calibrationControls.length === 0
      ? "insufficient_calibration_controls"
      : threshold === null
        ? "target_unattainable"
        : marked.length === 0 || controls.length === 0
          ? "insufficient_evaluation_data"
          : "computed";
  return {
    targetFalsePositiveRate: targetFpr,
    status,
    threshold: status === "computed" ? threshold : null,
    calibrationControls: calibrationControls.length,
    evaluationMarked: marked.length,
    recall: status === "computed" ? ratio(truePositives, marked.length) : null,
    evaluationControls: controls.length,
    falsePositiveRate: status === "computed" ? ratio(falsePositives, controls.length) : null,
    falsePositiveWilsonUpper95: status === "computed" && controls.length > 0
      ? wilsonUpperBound95(falsePositives, controls.length)
      : null,
  };
}

function evaluateGroup(records: ProvenanceSchemeObservation[], targetFpr: number): ProvenanceSchemeMetricReport {
  const first = records[0];
  const evaluation = completed(records.filter((record) => record.partition === "evaluation"));
  const evaluationMarked = evaluation.filter((record) => record.label === "marked_positive");
  const evaluationControls = evaluation.filter((record) => record.label === "unmarked_control");
  const truePositives = evaluationMarked.filter((record) => record.detection.positive).length;
  const falsePositives = evaluationControls.filter((record) => record.detection.positive).length;
  const falsePositiveRate = ratio(falsePositives, evaluationControls.length);
  const currentPolicy = {
    evaluationMarked: evaluationMarked.length,
    truePositives,
    recall: ratio(truePositives, evaluationMarked.length),
    evaluationControls: evaluationControls.length,
    falsePositives,
    falsePositiveRate,
    falsePositiveWilsonUpper95: evaluationControls.length > 0 ? wilsonUpperBound95(falsePositives, evaluationControls.length) : null,
  };

  const fixedFpr = fixedFprMetric(records, targetFpr);

  const viewPolicyIds = [...new Set(records.map((record) => record.viewPolicyId))].sort();
  const multiViewPolicies = viewPolicyIds.map((viewPolicyId) => {
    const allViewRecords = records.filter((record) => record.viewPolicyId === viewPolicyId);
    const viewRecords = completed(allViewRecords.filter((record) => record.partition === "evaluation"));
    const marked = viewRecords.filter((record) => record.label === "marked_positive");
    const controls = viewRecords.filter((record) => record.label === "unmarked_control");
    const calibrated = fixedFprMetric(allViewRecords, targetFpr);
    return {
      viewPolicyId,
      observations: viewRecords.length,
      attemptedViewsMean: viewRecords.length
        ? viewRecords.reduce((sum, record) => sum + record.attemptedViews, 0) / viewRecords.length
        : 0,
      recall: ratio(marked.filter((record) => record.detection.positive).length, marked.length),
      falsePositiveRate: ratio(controls.filter((record) => record.detection.positive).length, controls.length),
      fixedFprStatus: calibrated.status,
      fixedFprThreshold: calibrated.threshold,
      fixedFprRecall: calibrated.recall,
      fixedFprFalsePositiveRate: calibrated.falsePositiveRate,
    };
  });

  const transformationRobustness = [...new Set(records.map((record) => record.transformationCategory))]
    .sort()
    .map((category) => {
      const marked = completed(records.filter(
        (record) => record.partition === "evaluation" && record.label === "marked_positive" && record.transformationCategory === category,
      ));
      const detectedCases = marked.filter((record) => record.detection.positive).length;
      return { category, markedCases: marked.length, detectedCases, recall: ratio(detectedCases, marked.length) };
    });

  const gatePolicy = loadProvenanceReleaseGateRegistry().policy;
  const covered = new Set(records.filter((record) => record.partition === "evaluation").map((record) => record.transformationCategory));
  const unmarkedControlCountMet = evaluationControls.length >= gatePolicy.minimumUnmarkedControls;
  const falsePositiveRateMet = falsePositiveRate !== null && falsePositiveRate <= gatePolicy.maximumFalsePositiveRate;
  const upper = currentPolicy.falsePositiveWilsonUpper95;
  const falsePositiveWilsonUpperMet = upper !== null && upper <= gatePolicy.maximumWilsonUpperBound95;
  const requiredTransformationsCovered = gatePolicy.requiredTransformations.every((category) => covered.has(category as ProvenanceTransformationCategory));
  const reasons = [
    ...(!unmarkedControlCountMet ? ["minimum_unmarked_controls_not_met"] : []),
    ...(!falsePositiveRateMet ? ["false_positive_rate_not_met"] : []),
    ...(!falsePositiveWilsonUpperMet ? ["false_positive_wilson_upper_not_met"] : []),
    ...(!requiredTransformationsCovered ? ["required_transformations_missing"] : []),
    "metric_report_never_authorizes_release",
  ];

  const outcomes = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<ProvenanceEvaluationOutcome, number>;
  for (const record of records) outcomes[record.detection.outcome] += 1;
  return {
    schemeId: first.schemeId,
    profileId: first.profileId,
    configurationId: first.configurationId,
    observations: records.length,
    outcomes,
    currentPolicy,
    fixedFpr,
    multiView: {
      completeCalibrationData: multiViewPolicies.every(
        (policy) => policy.fixedFprStatus === "computed" || policy.fixedFprStatus === "not_applicable_no_score",
      ),
      policies: multiViewPolicies,
    },
    transformationRobustness,
    latencyMs: distribution(records.map((record) => record.performance.latencyMs)),
    resourceCost: {
      cpuTimeMs: distribution(records.map((record) => record.performance.cpuTimeMs)),
      peakRssBytes: distribution(records.map((record) => record.performance.peakRssBytes)),
      gpuTimeMs: optionalDistribution(records.map((record) => record.performance.gpuTimeMs)),
      peakGpuMemoryBytes: optionalDistribution(records.map((record) => record.performance.peakGpuMemoryBytes)),
      attemptedViews: distribution(records.map((record) => record.attemptedViews)),
    },
    releaseGateReadiness: {
      eligible: false,
      unmarkedControlCountMet,
      falsePositiveRateMet,
      falsePositiveWilsonUpperMet,
      requiredTransformationsCovered,
      reasons,
    },
  };
}

export function evaluateProvenanceSchemes(
  input: ProvenanceSchemeObservation[],
  options: { targetFalsePositiveRate?: number; generatedAt?: string } = {},
): ProvenanceSchemeEvaluationReport {
  if (input.length === 0) throw new Error("EMPTY_PROVENANCE_SCHEME_OBSERVATIONS");
  const records = input.map(parseProvenanceSchemeObservation);
  if (new Set(records.map((record) => record.recordId)).size !== records.length) {
    throw new Error("DUPLICATE_PROVENANCE_SCHEME_OBSERVATION");
  }
  if (new Set(records.map(logicalObservationKey)).size !== records.length) {
    throw new Error("DUPLICATE_PROVENANCE_SCHEME_OBSERVATION_LOGICAL_KEY");
  }
  const runIds = new Set(records.map((record) => record.evaluationRunId));
  const datasetDigests = new Set(records.map((record) => record.datasetManifestSha256));
  const transformationDigests = new Set(records.map((record) => record.transformationSuiteSha256));
  if (runIds.size !== 1 || datasetDigests.size !== 1 || transformationDigests.size !== 1) {
    throw new Error("MIXED_PROVENANCE_SCHEME_EVALUATION_INPUT");
  }
  const gateRegistry = loadProvenanceReleaseGateRegistry();
  const targetFalsePositiveRate = options.targetFalsePositiveRate ?? gateRegistry.policy.maximumFalsePositiveRate;
  if (!Number.isFinite(targetFalsePositiveRate) || targetFalsePositiveRate < 0 || targetFalsePositiveRate > 1) {
    throw new Error("INVALID_PROVENANCE_SCHEME_TARGET_FPR");
  }
  const groups = new Map<string, ProvenanceSchemeObservation[]>();
  for (const record of records) groups.set(metricGroupKey(record), [...(groups.get(metricGroupKey(record)) || []), record]);
  const metrics = [...groups.values()]
    .map((group) => evaluateGroup(group, targetFalsePositiveRate))
    .sort((left, right) => `${left.schemeId}/${left.profileId}/${left.configurationId}`.localeCompare(`${right.schemeId}/${right.profileId}/${right.configurationId}`));
  const registry = loadProvenanceRegistry();
  return {
    schemaVersion: "provenance-scheme-evaluation-report.v1",
    evaluatorVersion: "provenance-scheme-evaluator.v1",
    evaluatorSha256: createHash("sha256").update(readFileSync(EVALUATOR_IMPLEMENTATION_PATH)).digest("hex"),
    evaluationRunId: records[0].evaluationRunId,
    inputSha256: provenanceSchemeEvaluationDigest([...records].sort((left, right) => left.recordId.localeCompare(right.recordId))),
    datasetManifestSha256: records[0].datasetManifestSha256,
    transformationSuiteSha256: records[0].transformationSuiteSha256,
    provenanceRegistryVersion: registry.registryVersion,
    releaseGateRegistryVersion: gateRegistry.gateRegistryVersion,
    targetFalsePositiveRate,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    productionEvidenceEligible: false,
    shortCircuitEligible: false,
    automaticPolicyMutation: false,
    metrics,
  };
}
