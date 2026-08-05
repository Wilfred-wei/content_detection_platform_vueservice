import { writeFile } from "node:fs/promises";

import type { DdaShadowComparisonRecord } from "./dda-model-detector.js";
import {
  evaluateDdaShadow,
  type DdaShadowEvaluationReport,
  type DdaShadowTruthRecord,
} from "./dda-shadow-evaluation.js";

export type DdaShadowReviewCriterionState = "pass" | "fail" | "insufficient";

export interface DdaShadowReviewProfile {
  schemaVersion: "dda-shadow-review-profile.v1";
  profileId: string;
  baseline: { detectorId: string; checkpointSha256: string };
  candidate: { candidateId: string; detectorId: string; checkpointSha256: string; manifestSha256: string };
  window: { minimumObservationHours: number; maximumRecords: number };
  minimums: {
    uniqueAssets: number;
    pairedCompletionRate: number;
    labeledRecords: number;
    realRecords: number;
    generatedRecords: number;
    qualifyingSubgroups: number;
    labeledPerClassPerSubgroup: number;
    candidateGeneratedRecall: number;
    candidateAccuracyDelta: number;
  };
  maximums: {
    candidateFailureRate: number;
    candidateRealFalsePositiveRate: number;
    candidateP95LatencyRatio: number;
  };
}

export interface DdaShadowReviewCriterion {
  id: string;
  state: DdaShadowReviewCriterionState;
  observed: number | string | null;
  comparator: "at_least" | "at_most" | "exact";
  threshold: number | string;
  detail: string;
}

export interface DdaShadowReviewAssessment {
  schemaVersion: "dda-shadow-review-assessment.v1";
  generatedAt: string;
  profile: { id: string; sha256: string };
  inputs: { auditSha256: string; truthSha256: string | null };
  window: {
    since: string;
    until: string;
    firstRecordAt: string | null;
    lastRecordAt: string | null;
    observationHours: number;
    records: number;
  };
  identity: {
    baselineCheckpointSha256: string[];
    candidateIds: string[];
    candidateCheckpointSha256: string[];
    candidateManifestSha256: string[];
  };
  evaluation: DdaShadowEvaluationReport;
  pairedLabelMetrics: DdaShadowEvaluationReport["labels"];
  criteria: DdaShadowReviewCriterion[];
  review: {
    eligibleForManualPromotionReview: boolean;
    productionPromotionAuthorized: false;
    automaticPolicyMutation: false;
    blockingCriteria: string[];
    remainingProductionEvidence: string[];
  };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_DDA_SHADOW_REVIEW_PROFILE:${field}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`INVALID_DDA_SHADOW_REVIEW_PROFILE:${field}:fields`);
  }
}

function text(value: unknown, field: string, maximum = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`INVALID_DDA_SHADOW_REVIEW_PROFILE:${field}`);
  }
  return value.trim();
}

function sha256(value: unknown, field: string): string {
  const normalized = text(value, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`INVALID_DDA_SHADOW_REVIEW_PROFILE:${field}`);
  return normalized;
}

function finite(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`INVALID_DDA_SHADOW_REVIEW_PROFILE:${field}`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`INVALID_DDA_SHADOW_REVIEW_PROFILE:${field}`);
  }
  return Number(value);
}

function identity(value: unknown, field: string, candidate: boolean): Record<string, string> {
  const record = object(value, field);
  exactKeys(record, candidate
    ? ["candidateId", "detectorId", "checkpointSha256", "manifestSha256"]
    : ["detectorId", "checkpointSha256"], field);
  return {
    ...(candidate ? { candidateId: text(record.candidateId, `${field}:candidateId`) } : {}),
    detectorId: text(record.detectorId, `${field}:detectorId`),
    checkpointSha256: sha256(record.checkpointSha256, `${field}:checkpointSha256`),
    ...(candidate ? { manifestSha256: sha256(record.manifestSha256, `${field}:manifestSha256`) } : {}),
  };
}

export function parseDdaShadowReviewProfile(value: unknown): DdaShadowReviewProfile {
  const root = object(value, "root");
  exactKeys(root, ["schemaVersion", "profileId", "baseline", "candidate", "window", "minimums", "maximums"], "root");
  if (root.schemaVersion !== "dda-shadow-review-profile.v1") {
    throw new Error("INVALID_DDA_SHADOW_REVIEW_PROFILE:schemaVersion");
  }
  const baseline = identity(root.baseline, "baseline", false);
  const candidate = identity(root.candidate, "candidate", true);
  const window = object(root.window, "window");
  exactKeys(window, ["minimumObservationHours", "maximumRecords"], "window");
  const minimums = object(root.minimums, "minimums");
  exactKeys(minimums, [
    "uniqueAssets", "pairedCompletionRate", "labeledRecords", "realRecords", "generatedRecords",
    "qualifyingSubgroups", "labeledPerClassPerSubgroup", "candidateGeneratedRecall", "candidateAccuracyDelta",
  ], "minimums");
  const maximums = object(root.maximums, "maximums");
  exactKeys(maximums, ["candidateFailureRate", "candidateRealFalsePositiveRate", "candidateP95LatencyRatio"], "maximums");
  return {
    schemaVersion: "dda-shadow-review-profile.v1",
    profileId: text(root.profileId, "profileId"),
    baseline: baseline as DdaShadowReviewProfile["baseline"],
    candidate: candidate as DdaShadowReviewProfile["candidate"],
    window: {
      minimumObservationHours: finite(window.minimumObservationHours, "window:minimumObservationHours", 0, 24 * 365),
      maximumRecords: positiveInteger(window.maximumRecords, "window:maximumRecords"),
    },
    minimums: {
      uniqueAssets: positiveInteger(minimums.uniqueAssets, "minimums:uniqueAssets"),
      pairedCompletionRate: finite(minimums.pairedCompletionRate, "minimums:pairedCompletionRate", 0, 1),
      labeledRecords: positiveInteger(minimums.labeledRecords, "minimums:labeledRecords"),
      realRecords: positiveInteger(minimums.realRecords, "minimums:realRecords"),
      generatedRecords: positiveInteger(minimums.generatedRecords, "minimums:generatedRecords"),
      qualifyingSubgroups: positiveInteger(minimums.qualifyingSubgroups, "minimums:qualifyingSubgroups"),
      labeledPerClassPerSubgroup: positiveInteger(minimums.labeledPerClassPerSubgroup, "minimums:labeledPerClassPerSubgroup"),
      candidateGeneratedRecall: finite(minimums.candidateGeneratedRecall, "minimums:candidateGeneratedRecall", 0, 1),
      candidateAccuracyDelta: finite(minimums.candidateAccuracyDelta, "minimums:candidateAccuracyDelta", -1, 1),
    },
    maximums: {
      candidateFailureRate: finite(maximums.candidateFailureRate, "maximums:candidateFailureRate", 0, 1),
      candidateRealFalsePositiveRate: finite(maximums.candidateRealFalsePositiveRate, "maximums:candidateRealFalsePositiveRate", 0, 1),
      candidateP95LatencyRatio: finite(maximums.candidateP95LatencyRatio, "maximums:candidateP95LatencyRatio", 0, 100),
    },
  };
}

function instant(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`INVALID_DDA_SHADOW_REVIEW_WINDOW:${field}`);
  }
  return parsed;
}

export function selectDdaShadowReviewWindow(
  records: readonly DdaShadowComparisonRecord[],
  options: { since: string; until: string; maximumRecords: number },
): DdaShadowComparisonRecord[] {
  const since = instant(options.since, "since");
  const until = instant(options.until, "until");
  if (until <= since) throw new Error("INVALID_DDA_SHADOW_REVIEW_WINDOW:order");
  if (!Number.isSafeInteger(options.maximumRecords) || options.maximumRecords <= 0) {
    throw new Error("INVALID_DDA_SHADOW_REVIEW_WINDOW:maximumRecords");
  }
  const selected = records.filter((record, index) => {
    const createdAt = instant(record.createdAt, `record:${index + 1}:createdAt`);
    return createdAt >= since && createdAt < until;
  });
  if (selected.length > options.maximumRecords) {
    throw new Error(`DDA_SHADOW_REVIEW_WINDOW_TOO_LARGE:${selected.length}:${options.maximumRecords}`);
  }
  return selected;
}

function criterion(
  id: string,
  observed: number | string | null,
  comparator: DdaShadowReviewCriterion["comparator"],
  threshold: number | string,
  state: DdaShadowReviewCriterionState,
  detail: string,
): DdaShadowReviewCriterion {
  return { id, observed, comparator, threshold, state, detail };
}

function minimumCriterion(id: string, observed: number, threshold: number, detail: string): DdaShadowReviewCriterion {
  return criterion(id, observed, "at_least", threshold, observed >= threshold ? "pass" : "insufficient", detail);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function identitiesMatch(actual: string[], expected: string): boolean {
  return actual.length === 1 && actual[0] === expected;
}

function metricCriterion(
  id: string,
  observed: number | null,
  comparator: "at_least" | "at_most",
  threshold: number,
  sufficientlySampled: boolean,
  detail: string,
): DdaShadowReviewCriterion {
  if (!sufficientlySampled || observed === null) return criterion(id, observed, comparator, threshold, "insufficient", detail);
  const passed = comparator === "at_least" ? observed >= threshold : observed <= threshold;
  return criterion(id, observed, comparator, threshold, passed ? "pass" : "fail", detail);
}

export function assessDdaShadowReview(
  records: readonly DdaShadowComparisonRecord[],
  truthRecords: readonly DdaShadowTruthRecord[],
  profile: DdaShadowReviewProfile,
  context: {
    since: string;
    until: string;
    profileSha256: string;
    auditSha256: string;
    truthSha256: string | null;
    generatedAt?: string;
  },
): DdaShadowReviewAssessment {
  sha256(context.profileSha256, "context:profileSha256");
  sha256(context.auditSha256, "context:auditSha256");
  if (context.truthSha256 !== null) sha256(context.truthSha256, "context:truthSha256");
  instant(context.since, "since");
  instant(context.until, "until");
  const generatedAt = context.generatedAt || new Date().toISOString();
  instant(generatedAt, "generatedAt");
  const evaluation = evaluateDdaShadow(records, truthRecords, generatedAt);
  const pairedLabelMetrics = evaluateDdaShadow(
    records.filter((record) => record.baseline.status === "completed" && record.candidate.status === "completed"),
    truthRecords,
    generatedAt,
  ).labels;
  const timestamps = records.map((record, index) => instant(record.createdAt, `record:${index + 1}:createdAt`)).sort((a, b) => a - b);
  const observationHours = timestamps.length < 2 ? 0 : ((timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0)) / 3_600_000;
  const identitySummary = {
    baselineCheckpointSha256: sortedUnique(records.map((record) => record.baseline.checkpointSha256)),
    candidateIds: sortedUnique(records.map((record) => record.candidate.candidateId)),
    candidateCheckpointSha256: sortedUnique(records.map((record) => record.candidate.checkpointSha256)),
    candidateManifestSha256: sortedUnique(records.map((record) => record.candidate.manifestSha256)),
  };
  const identityMatches = records.length > 0
    && records.every((record) => record.baseline.detectorId === profile.baseline.detectorId
      && record.candidate.detectorId === profile.candidate.detectorId)
    && identitiesMatch(identitySummary.baselineCheckpointSha256, profile.baseline.checkpointSha256)
    && identitiesMatch(identitySummary.candidateIds, profile.candidate.candidateId)
    && identitiesMatch(identitySummary.candidateCheckpointSha256, profile.candidate.checkpointSha256)
    && identitiesMatch(identitySummary.candidateManifestSha256, profile.candidate.manifestSha256);
  const realRecords = pairedLabelMetrics.candidate.trueNegative + pairedLabelMetrics.candidate.falsePositive;
  const generatedRecords = pairedLabelMetrics.candidate.truePositive + pairedLabelMetrics.candidate.falseNegative;
  const qualifyingSubgroups = Object.values(pairedLabelMetrics.subgroups).filter((subgroup) => {
    const real = subgroup.candidate.trueNegative + subgroup.candidate.falsePositive;
    const generated = subgroup.candidate.truePositive + subgroup.candidate.falseNegative;
    return real >= profile.minimums.labeledPerClassPerSubgroup
      && generated >= profile.minimums.labeledPerClassPerSubgroup;
  }).length;
  const pairedCompletionRate = ratio(evaluation.audit.pairedCompleted, evaluation.audit.records);
  const candidateFailureRate = ratio(evaluation.audit.candidateFailures, evaluation.audit.records);
  const baselineP95 = evaluation.audit.baselineLatencyMs.p95;
  const candidateP95 = evaluation.audit.candidateLatencyMs.p95;
  const p95LatencyRatio = baselineP95 === null || candidateP95 === null || baselineP95 === 0
    ? null : candidateP95 / baselineP95;
  const enoughReal = realRecords >= profile.minimums.realRecords;
  const enoughGenerated = generatedRecords >= profile.minimums.generatedRecords;
  const enoughLabels = pairedLabelMetrics.matchedRecords >= profile.minimums.labeledRecords;
  const enoughOperationalVolume = evaluation.audit.uniqueAssets >= profile.minimums.uniqueAssets;
  const criteria: DdaShadowReviewCriterion[] = [
    criterion("candidate_identity", identityMatches ? "matched" : "mismatched", "exact", "matched", identityMatches ? "pass" : records.length === 0 ? "insufficient" : "fail", "All records must bind the profile baseline and candidate identities."),
    minimumCriterion("observation_hours", observationHours, profile.window.minimumObservationHours, "The bounded window must represent sustained observation rather than a burst replay."),
    minimumCriterion("unique_assets", evaluation.audit.uniqueAssets, profile.minimums.uniqueAssets, "Repeated assets do not satisfy traffic-volume evidence."),
    metricCriterion("paired_completion_rate", pairedCompletionRate, "at_least", profile.minimums.pairedCompletionRate, enoughOperationalVolume, "Both routes must finish the same assets reliably after minimum traffic volume is reached."),
    metricCriterion("candidate_failure_rate", candidateFailureRate, "at_most", profile.maximums.candidateFailureRate, enoughOperationalVolume, "Candidate failures include every typed terminal failure after minimum traffic volume is reached."),
    metricCriterion("candidate_p95_latency_ratio", p95LatencyRatio, "at_most", profile.maximums.candidateP95LatencyRatio, enoughOperationalVolume && evaluation.audit.pairedCompleted > 0, "Candidate p95 is divided by active-baseline p95 only after minimum traffic volume is reached."),
    minimumCriterion("labeled_records", pairedLabelMetrics.matchedRecords, profile.minimums.labeledRecords, "Accuracy claims require source-owned labels on records completed by both routes."),
    minimumCriterion("real_records", realRecords, profile.minimums.realRecords, "Real-image false-positive evaluation requires sufficient source-owned real controls."),
    minimumCriterion("generated_records", generatedRecords, profile.minimums.generatedRecords, "Generated-image recall requires sufficient source-owned generated samples."),
    minimumCriterion("qualifying_subgroups", qualifyingSubgroups, profile.minimums.qualifyingSubgroups, `Each subgroup needs at least ${profile.minimums.labeledPerClassPerSubgroup} records per class.`),
    metricCriterion("candidate_real_false_positive_rate", pairedLabelMetrics.candidate.realFalsePositiveRate, "at_most", profile.maximums.candidateRealFalsePositiveRate, enoughReal && enoughLabels, "Low-volume or missing real labels remain insufficient rather than passing."),
    metricCriterion("candidate_generated_recall", pairedLabelMetrics.candidate.generatedRecall, "at_least", profile.minimums.candidateGeneratedRecall, enoughGenerated && enoughLabels, "Low-volume or missing generated labels remain insufficient rather than passing."),
    metricCriterion("candidate_accuracy_delta", pairedLabelMetrics.candidateAccuracyDelta, "at_least", profile.minimums.candidateAccuracyDelta, enoughReal && enoughGenerated && enoughLabels, "Candidate and c0 are compared only on the same source-labelled records completed by both routes."),
  ];
  const blockingCriteria = criteria.filter((item) => item.state !== "pass").map((item) => item.id);
  return {
    schemaVersion: "dda-shadow-review-assessment.v1",
    generatedAt,
    profile: { id: profile.profileId, sha256: context.profileSha256 },
    inputs: { auditSha256: context.auditSha256, truthSha256: context.truthSha256 },
    window: {
      since: context.since,
      until: context.until,
      firstRecordAt: timestamps.length > 0 ? new Date(timestamps[0] ?? 0).toISOString() : null,
      lastRecordAt: timestamps.length > 0 ? new Date(timestamps.at(-1) ?? 0).toISOString() : null,
      observationHours,
      records: records.length,
    },
    identity: identitySummary,
    evaluation,
    pairedLabelMetrics,
    criteria,
    review: {
      eligibleForManualPromotionReview: blockingCriteria.length === 0,
      productionPromotionAuthorized: false,
      automaticPolicyMutation: false,
      blockingCriteria,
      remainingProductionEvidence: [
        "untouched_deployment_domain_evaluation",
        "transformation_robustness_and_calibration",
        "capacity_and_failure_injection",
        "rollback_runbook",
        "separate_immutable_policy_promotion",
      ],
    },
  };
}

export async function writePrivateDdaShadowReviewSnapshot(path: string, assessment: DdaShadowReviewAssessment): Promise<void> {
  await writeFile(path, `${JSON.stringify(assessment, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}
