import { ForensicInspectionProfileCatalog } from "./forensic-inspection-profiles.js";

export type EvaluationRegion = readonly [number, number, number, number];
export type EvaluationSourceClass = "real" | "generated" | "difficult_control";
export type EvaluationTransformation = "original" | "resize" | "jpeg_recompression" | "crop" | "screenshot" | "blur" | "color_edit" | "overlay";

export interface ForensicEvaluationPolicy {
  schemaVersion: "1.0.0";
  policyId: string;
  target: {
    promptBundleId: string;
    promptBundleVersion: string;
    cueTaxonomyVersion: string;
    provider: string;
    model: string;
  };
  minimums: {
    totalCases: number;
    humanReviewedCases: number;
    minimumReviewers: number;
    realCases: number;
    generatedCases: number;
    difficultControlCases: number;
    promptInjectionCases: number;
    postProcessedCases: number;
    casesPerRequiredTransformation: number;
    casesPerRequiredSubgroup: number;
  };
  thresholds: {
    cuePrecisionMin: number;
    cueRecallMin: number;
    unsupportedClaimRateMax: number;
    unknownRateMax: number;
    polarityConsistencyMin: number;
    viewConsistencyMin: number;
    regionIouMin: number;
    regionPassRateMin: number;
    promptInjectionRobustnessMin: number;
    failureRateMax: number;
    p95LatencyMsMax: number;
    usefulFollowupRateMin: number;
    duplicateRequestRateMax: number;
    rejectedRequestRateMax: number;
    confirmationSeekingRateMax: number;
    stopComplianceRateMin: number;
    decisionOrderInvarianceMin: number;
    averageEvidenceGainMin: number;
    averageCallsMax: number;
    averagePixelsMax: number;
    averageOutputTokensMax: number;
  };
  requiredTransformations: EvaluationTransformation[];
  requiredSubgroups: string[];
}

export interface ExpectedVisualCue {
  id: string;
  support: "supports_synthetic" | "supports_manipulation";
  region: EvaluationRegion | null;
}

export interface EvaluationCasePlan {
  id: string;
  asset: {
    sha256: string | null;
    localPath: string | null;
    sourceClass: EvaluationSourceClass;
    sourceReference: string;
    rights: string;
  };
  transformation: EvaluationTransformation;
  subgroups: string[];
  promptInjection: boolean;
  review: {
    status: "pending" | "approved";
    reviewerIds: string[];
    blindToModelOutput: boolean;
    adjudicated: boolean;
    expectedCues: ExpectedVisualCue[];
  };
}

export interface ForensicEvaluationManifest {
  schemaVersion: "1.0.0";
  manifestId: string;
  createdAt: string;
  cases: EvaluationCasePlan[];
}

export interface EvaluationObservation {
  id: string;
  state: "present" | "absent" | "unknown";
  support: "supports_synthetic" | "supports_manipulation" | "neutral" | "unknown";
  region: EvaluationRegion | null;
}

export interface ObservationReview {
  observationId: string;
  judgment: "supported" | "unsupported" | "ambiguous";
  matchedExpectedCueId: string | null;
}

export interface ExpectedCueCoverageReview {
  expectedCueId: string;
  outcome: "detected" | "missed" | "unverifiable";
  observationId: string | null;
}

export interface ValidationReview {
  validationId: string;
  actualOutcome: "supported" | "contradicted" | "unverifiable";
  expectedOutcome: "supported" | "contradicted" | "unverifiable";
  polarityConsistent: boolean;
  viewConsistent: boolean | null;
}

export interface PlannerReview {
  requests: number;
  acceptedRequests: number;
  usefulAcceptedRequests: number;
  rejectedRequests: number;
  duplicateRejectedRequests: number;
  confirmationSeekingRequests: number;
  evidenceGainByRound: number[];
  stopCompliant: boolean;
  decisionOrderInvariant: boolean;
}

export interface ForensicEvaluationCaseResult {
  caseId: string;
  status: "completed" | "failed";
  observations: EvaluationObservation[];
  observationReviews: ObservationReview[];
  expectedCueCoverage: ExpectedCueCoverageReview[];
  validationReviews: ValidationReview[];
  planner: PlannerReview;
  reviewMetadata: {
    reviewerIds: string[];
    blindToBundle: boolean;
    adjudicated: boolean;
  };
  instructionFollowingViolation: boolean;
  latencyMs: number;
  callsUsed: number;
  pixelsUsed: number;
  outputTokensUsed: number;
  decision: "AI_GENERATED" | "LIKELY_NON_AI" | "INCONCLUSIVE";
}

export interface ForensicEvaluationRun {
  schemaVersion: "1.0.0";
  runId: string;
  createdAt: string;
  promptBundle: {
    id: string;
    version: string;
    cueTaxonomyVersion: string;
    promptHashes: Record<string, string>;
  };
  model: { provider: string; model: string };
  cases: ForensicEvaluationCaseResult[];
}

export interface ForensicEvaluationMetrics {
  totalCases: number;
  humanReviewedCases: number;
  realCases: number;
  generatedCases: number;
  difficultControlCases: number;
  promptInjectionCases: number;
  postProcessedCases: number;
  cuePrecision: number | null;
  cueRecall: number | null;
  unsupportedClaimRate: number | null;
  reviewCoverage: number | null;
  expectedCueCoverage: number | null;
  unknownRate: number | null;
  polarityConsistency: number | null;
  viewConsistency: number | null;
  meanRegionIou: number | null;
  regionPassRate: number | null;
  promptInjectionRobustness: number | null;
  failureRate: number | null;
  p95LatencyMs: number | null;
  usefulFollowupRate: number | null;
  duplicateRequestRate: number | null;
  rejectedRequestRate: number | null;
  confirmationSeekingRate: number | null;
  stopComplianceRate: number | null;
  decisionOrderInvariance: number | null;
  averageEvidenceGainByRound: number | null;
  averageCalls: number | null;
  averagePixels: number | null;
  averageOutputTokens: number | null;
  transformationCounts: Record<string, number>;
  subgroupCounts: Record<string, number>;
  dataComplete: boolean;
}

export interface PromotionCheck {
  id: string;
  passed: boolean;
  actual: string | number | boolean | null;
  operator: ">=" | "<=" | "==";
  threshold: string | number | boolean;
}

export interface ForensicPromotionReport {
  schemaVersion: "1.0.0";
  policyId: string;
  manifestId: string;
  runId: string;
  status: "promotable" | "blocked";
  metrics: ForensicEvaluationMetrics;
  checks: PromotionCheck[];
  generatedAt: string;
}

const POSITIVE_SUPPORT = new Set(["supports_synthetic", "supports_manipulation"]);
const SOURCE_CLASSES = new Set<EvaluationSourceClass>(["real", "generated", "difficult_control"]);
const TRANSFORMATIONS = new Set<EvaluationTransformation>(["original", "resize", "jpeg_recompression", "crop", "screenshot", "blur", "color_edit", "overlay"]);
const OBSERVATION_STATES = new Set<EvaluationObservation["state"]>(["present", "absent", "unknown"]);
const OBSERVATION_SUPPORT = new Set<EvaluationObservation["support"]>(["supports_synthetic", "supports_manipulation", "neutral", "unknown"]);
const REVIEW_JUDGMENTS = new Set<ObservationReview["judgment"]>(["supported", "unsupported", "ambiguous"]);
const COVERAGE_OUTCOMES = new Set<ExpectedCueCoverageReview["outcome"]>(["detected", "missed", "unverifiable"]);
const VALIDATION_OUTCOMES = new Set<ValidationReview["actualOutcome"]>(["supported", "contradicted", "unverifiable"]);
const DECISIONS = new Set<ForensicEvaluationCaseResult["decision"]>(["AI_GENERATED", "LIKELY_NON_AI", "INCONCLUSIVE"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`INVALID_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`INVALID_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error(`INVALID_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function requireNumber(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new Error(`INVALID_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function requireRatio(value: unknown, name: string): number {
  const number = requireNumber(value, name);
  if (number > 1) throw new Error(`INVALID_EVALUATION_${name.toUpperCase()}`);
  return number;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`INVALID_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function requireRegion(value: unknown, nullable = true): EvaluationRegion | null {
  if (value === null && nullable) return null;
  if (!Array.isArray(value) || value.length !== 4 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw new Error("INVALID_EVALUATION_REGION");
  const [x1, y1, x2, y2] = value as number[];
  if (!(x1 >= 0 && y1 >= 0 && x1 < x2 && y1 < y2 && x2 <= 1 && y2 <= 1)) throw new Error("INVALID_EVALUATION_REGION");
  return [x1, y1, x2, y2];
}

function requireStringArray(value: unknown, name: string): string[] {
  return requireArray(value, name).map((item) => requireString(item, name));
}

function requireEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, name: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`INVALID_EVALUATION_${name.toUpperCase()}`);
  return value as T;
}

function requireInteger(value: unknown, name: string, minimum = 0): number {
  const parsed = requireNumber(value, name, minimum);
  if (!Number.isInteger(parsed)) throw new Error(`INVALID_EVALUATION_${name.toUpperCase()}`);
  return parsed;
}

export function parseForensicEvaluationPolicy(value: unknown): ForensicEvaluationPolicy {
  const root = requireRecord(value, "policy");
  if (root.schemaVersion !== "1.0.0") throw new Error("UNSUPPORTED_EVALUATION_POLICY_SCHEMA");
  const target = requireRecord(root.target, "target");
  const minimums = requireRecord(root.minimums, "minimums");
  const thresholds = requireRecord(root.thresholds, "thresholds");
  const integerMinimum = (name: string, minimum = 0) => requireInteger(minimums[name], name, minimum);
  return {
    schemaVersion: "1.0.0",
    policyId: requireString(root.policyId, "policy_id"),
    target: {
      promptBundleId: requireString(target.promptBundleId, "prompt_bundle_id"),
      promptBundleVersion: requireString(target.promptBundleVersion, "prompt_bundle_version"),
      cueTaxonomyVersion: requireString(target.cueTaxonomyVersion, "cue_taxonomy_version"),
      provider: requireString(target.provider, "provider"),
      model: requireString(target.model, "model"),
    },
    minimums: {
      totalCases: integerMinimum("totalCases", 1),
      humanReviewedCases: integerMinimum("humanReviewedCases", 1),
      minimumReviewers: integerMinimum("minimumReviewers", 1),
      realCases: integerMinimum("realCases"),
      generatedCases: integerMinimum("generatedCases"),
      difficultControlCases: integerMinimum("difficultControlCases"),
      promptInjectionCases: integerMinimum("promptInjectionCases"),
      postProcessedCases: integerMinimum("postProcessedCases"),
      casesPerRequiredTransformation: integerMinimum("casesPerRequiredTransformation"),
      casesPerRequiredSubgroup: integerMinimum("casesPerRequiredSubgroup"),
    },
    thresholds: {
      cuePrecisionMin: requireRatio(thresholds.cuePrecisionMin, "cue_precision_min"),
      cueRecallMin: requireRatio(thresholds.cueRecallMin, "cue_recall_min"),
      unsupportedClaimRateMax: requireRatio(thresholds.unsupportedClaimRateMax, "unsupported_claim_rate_max"),
      unknownRateMax: requireRatio(thresholds.unknownRateMax, "unknown_rate_max"),
      polarityConsistencyMin: requireRatio(thresholds.polarityConsistencyMin, "polarity_consistency_min"),
      viewConsistencyMin: requireRatio(thresholds.viewConsistencyMin, "view_consistency_min"),
      regionIouMin: requireRatio(thresholds.regionIouMin, "region_iou_min"),
      regionPassRateMin: requireRatio(thresholds.regionPassRateMin, "region_pass_rate_min"),
      promptInjectionRobustnessMin: requireRatio(thresholds.promptInjectionRobustnessMin, "prompt_injection_robustness_min"),
      failureRateMax: requireRatio(thresholds.failureRateMax, "failure_rate_max"),
      p95LatencyMsMax: requireNumber(thresholds.p95LatencyMsMax, "p95_latency_ms_max", 1),
      usefulFollowupRateMin: requireRatio(thresholds.usefulFollowupRateMin, "useful_followup_rate_min"),
      duplicateRequestRateMax: requireRatio(thresholds.duplicateRequestRateMax, "duplicate_request_rate_max"),
      rejectedRequestRateMax: requireRatio(thresholds.rejectedRequestRateMax, "rejected_request_rate_max"),
      confirmationSeekingRateMax: requireRatio(thresholds.confirmationSeekingRateMax, "confirmation_seeking_rate_max"),
      stopComplianceRateMin: requireRatio(thresholds.stopComplianceRateMin, "stop_compliance_rate_min"),
      decisionOrderInvarianceMin: requireRatio(thresholds.decisionOrderInvarianceMin, "decision_order_invariance_min"),
      averageEvidenceGainMin: requireRatio(thresholds.averageEvidenceGainMin, "average_evidence_gain_min"),
      averageCallsMax: requireNumber(thresholds.averageCallsMax, "average_calls_max", 1),
      averagePixelsMax: requireNumber(thresholds.averagePixelsMax, "average_pixels_max", 1),
      averageOutputTokensMax: requireNumber(thresholds.averageOutputTokensMax, "average_output_tokens_max", 1),
    },
    requiredTransformations: requireStringArray(root.requiredTransformations, "required_transformations")
      .map((item) => requireEnum(item, TRANSFORMATIONS, "transformation")),
    requiredSubgroups: requireStringArray(root.requiredSubgroups, "required_subgroups"),
  };
}

export function parseForensicEvaluationManifest(value: unknown): ForensicEvaluationManifest {
  const root = requireRecord(value, "manifest");
  if (root.schemaVersion !== "1.0.0") throw new Error("UNSUPPORTED_EVALUATION_MANIFEST_SCHEMA");
  const seen = new Set<string>();
  const cases = requireArray(root.cases, "cases").map((value): EvaluationCasePlan => {
    const item = requireRecord(value, "case");
    const id = requireString(item.id, "case_id");
    if (seen.has(id)) throw new Error("DUPLICATE_EVALUATION_CASE");
    seen.add(id);
    const asset = requireRecord(item.asset, "asset");
    const review = requireRecord(item.review, "review");
    const status = review.status;
    if (status !== "pending" && status !== "approved") throw new Error("INVALID_EVALUATION_REVIEW_STATUS");
    const expectedCues = requireArray(review.expectedCues, "expected_cues").map((cue): ExpectedVisualCue => {
      const record = requireRecord(cue, "expected_cue");
      if (!POSITIVE_SUPPORT.has(record.support as string)) throw new Error("INVALID_EXPECTED_CUE_SUPPORT");
      return { id: requireString(record.id, "expected_cue_id"), support: record.support as ExpectedVisualCue["support"], region: requireRegion(record.region) };
    });
    if (new Set(expectedCues.map((cue) => cue.id)).size !== expectedCues.length) throw new Error("DUPLICATE_EXPECTED_CUE");
    return {
      id,
      asset: {
        sha256: asset.sha256 === null ? null : requireString(asset.sha256, "asset_sha256"),
        localPath: asset.localPath === null ? null : requireString(asset.localPath, "asset_local_path"),
        sourceClass: requireEnum(asset.sourceClass, SOURCE_CLASSES, "source_class"),
        sourceReference: requireString(asset.sourceReference, "source_reference"),
        rights: requireString(asset.rights, "rights"),
      },
      transformation: requireEnum(item.transformation, TRANSFORMATIONS, "transformation"),
      subgroups: requireStringArray(item.subgroups, "subgroups"),
      promptInjection: requireBoolean(item.promptInjection, "prompt_injection"),
      review: {
        status,
        reviewerIds: requireStringArray(review.reviewerIds, "reviewer_ids"),
        blindToModelOutput: requireBoolean(review.blindToModelOutput, "blind_to_model_output"),
        adjudicated: requireBoolean(review.adjudicated, "adjudicated"),
        expectedCues,
      },
    };
  });
  return { schemaVersion: "1.0.0", manifestId: requireString(root.manifestId, "manifest_id"), createdAt: requireString(root.createdAt, "created_at"), cases };
}

export function parseForensicEvaluationRun(value: unknown): ForensicEvaluationRun {
  const root = requireRecord(value, "run");
  if (root.schemaVersion !== "1.0.0") throw new Error("UNSUPPORTED_EVALUATION_RUN_SCHEMA");
  const bundle = requireRecord(root.promptBundle, "prompt_bundle");
  const model = requireRecord(root.model, "model");
  const promptHashesRecord = requireRecord(bundle.promptHashes, "prompt_hashes");
  const promptHashes = Object.fromEntries(Object.entries(promptHashesRecord).map(([key, hash]) => [requireString(key, "profile_id"), requireString(hash, "prompt_hash")]));
  const seen = new Set<string>();
  const cases = requireArray(root.cases, "run_cases").map((value): ForensicEvaluationCaseResult => {
    const item = requireRecord(value, "run_case");
    const caseId = requireString(item.caseId, "case_id");
    if (seen.has(caseId)) throw new Error("DUPLICATE_EVALUATION_RUN_CASE");
    seen.add(caseId);
    const reviewMetadata = requireRecord(item.reviewMetadata, "review_metadata");
    const planner = requireRecord(item.planner, "planner");
    const status = item.status;
    if (status !== "completed" && status !== "failed") throw new Error("INVALID_EVALUATION_CASE_STATUS");
    const observations = requireArray(item.observations, "observations").map((value): EvaluationObservation => {
      const observation = requireRecord(value, "observation");
      return {
        id: requireString(observation.id, "observation_id"),
        state: requireEnum(observation.state, OBSERVATION_STATES, "observation_state"),
        support: requireEnum(observation.support, OBSERVATION_SUPPORT, "observation_support"),
        region: requireRegion(observation.region),
      };
    });
    const observationReviews = requireArray(item.observationReviews, "observation_reviews").map((value): ObservationReview => {
      const review = requireRecord(value, "observation_review");
      return {
        observationId: requireString(review.observationId, "observation_id"),
        judgment: requireEnum(review.judgment, REVIEW_JUDGMENTS, "review_judgment"),
        matchedExpectedCueId: review.matchedExpectedCueId === null ? null : requireString(review.matchedExpectedCueId, "expected_cue_id"),
      };
    });
    const expectedCueCoverage = requireArray(item.expectedCueCoverage, "expected_cue_coverage").map((value): ExpectedCueCoverageReview => {
      const review = requireRecord(value, "expected_cue_review");
      return {
        expectedCueId: requireString(review.expectedCueId, "expected_cue_id"),
        outcome: requireEnum(review.outcome, COVERAGE_OUTCOMES, "coverage_outcome"),
        observationId: review.observationId === null ? null : requireString(review.observationId, "observation_id"),
      };
    });
    const validationReviews = requireArray(item.validationReviews, "validation_reviews").map((value): ValidationReview => {
      const review = requireRecord(value, "validation_review");
      return {
        validationId: requireString(review.validationId, "validation_id"),
        actualOutcome: requireEnum(review.actualOutcome, VALIDATION_OUTCOMES, "actual_outcome"),
        expectedOutcome: requireEnum(review.expectedOutcome, VALIDATION_OUTCOMES, "expected_outcome"),
        polarityConsistent: requireBoolean(review.polarityConsistent, "polarity_consistent"),
        viewConsistent: review.viewConsistent === null ? null : requireBoolean(review.viewConsistent, "view_consistent"),
      };
    });
    const parsed: ForensicEvaluationCaseResult = {
      caseId,
      status,
      observations,
      observationReviews,
      expectedCueCoverage,
      validationReviews,
      planner: {
        requests: requireInteger(planner.requests, "planner_requests"),
        acceptedRequests: requireInteger(planner.acceptedRequests, "accepted_requests"),
        usefulAcceptedRequests: requireInteger(planner.usefulAcceptedRequests, "useful_requests"),
        rejectedRequests: requireInteger(planner.rejectedRequests, "rejected_requests"),
        duplicateRejectedRequests: requireInteger(planner.duplicateRejectedRequests, "duplicate_requests"),
        confirmationSeekingRequests: requireInteger(planner.confirmationSeekingRequests, "confirmation_requests"),
        evidenceGainByRound: requireArray(planner.evidenceGainByRound, "evidence_gain").map((entry) => requireNumber(entry, "evidence_gain")),
        stopCompliant: requireBoolean(planner.stopCompliant, "stop_compliant"),
        decisionOrderInvariant: requireBoolean(planner.decisionOrderInvariant, "decision_order_invariant"),
      },
      reviewMetadata: {
        reviewerIds: requireStringArray(reviewMetadata.reviewerIds, "reviewer_ids"),
        blindToBundle: requireBoolean(reviewMetadata.blindToBundle, "blind_to_bundle"),
        adjudicated: requireBoolean(reviewMetadata.adjudicated, "adjudicated"),
      },
      instructionFollowingViolation: requireBoolean(item.instructionFollowingViolation, "instruction_following_violation"),
      latencyMs: requireNumber(item.latencyMs, "latency_ms"),
      callsUsed: requireInteger(item.callsUsed, "calls_used"),
      pixelsUsed: requireInteger(item.pixelsUsed, "pixels_used"),
      outputTokensUsed: requireInteger(item.outputTokensUsed, "output_tokens_used"),
      decision: requireEnum(item.decision, DECISIONS, "decision"),
    };
    const observationIds = parsed.observations.map((observation) => observation.id);
    if (new Set(observationIds).size !== observationIds.length) throw new Error("DUPLICATE_EVALUATION_OBSERVATION");
    const reviewedIds = parsed.observationReviews.map((review) => review.observationId);
    if (new Set(reviewedIds).size !== reviewedIds.length) throw new Error("DUPLICATE_OBSERVATION_REVIEW");
    if (reviewedIds.some((id) => !observationIds.includes(id))) throw new Error("UNKNOWN_REVIEWED_OBSERVATION");
    const coveredCueIds = parsed.expectedCueCoverage.map((review) => review.expectedCueId);
    if (new Set(coveredCueIds).size !== coveredCueIds.length) throw new Error("DUPLICATE_EXPECTED_CUE_REVIEW");
    if (parsed.expectedCueCoverage.some((review) => review.observationId !== null && !observationIds.includes(review.observationId))) {
      throw new Error("UNKNOWN_COVERAGE_OBSERVATION");
    }
    if (parsed.planner.acceptedRequests + parsed.planner.rejectedRequests !== parsed.planner.requests) throw new Error("INVALID_PLANNER_REQUEST_TOTAL");
    if (parsed.planner.usefulAcceptedRequests > parsed.planner.acceptedRequests) throw new Error("INVALID_USEFUL_REQUEST_TOTAL");
    if (parsed.planner.duplicateRejectedRequests > parsed.planner.rejectedRequests) throw new Error("INVALID_DUPLICATE_REQUEST_TOTAL");
    if (parsed.planner.confirmationSeekingRequests > parsed.planner.requests) throw new Error("INVALID_CONFIRMATION_REQUEST_TOTAL");
    return parsed;
  });
  return {
    schemaVersion: "1.0.0",
    runId: requireString(root.runId, "run_id"),
    createdAt: requireString(root.createdAt, "created_at"),
    promptBundle: {
      id: requireString(bundle.id, "prompt_bundle_id"),
      version: requireString(bundle.version, "prompt_bundle_version"),
      cueTaxonomyVersion: requireString(bundle.cueTaxonomyVersion, "cue_taxonomy_version"),
      promptHashes,
    },
    model: { provider: requireString(model.provider, "provider"), model: requireString(model.model, "model") },
    cases,
  };
}

function divide(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile95(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

export function evaluationRegionIou(left: EvaluationRegion, right: EvaluationRegion): number {
  const intersectionWidth = Math.max(0, Math.min(left[2], right[2]) - Math.max(left[0], right[0]));
  const intersectionHeight = Math.max(0, Math.min(left[3], right[3]) - Math.max(left[1], right[1]));
  const intersection = intersectionWidth * intersectionHeight;
  const leftArea = (left[2] - left[0]) * (left[3] - left[1]);
  const rightArea = (right[2] - right[0]) * (right[3] - right[1]);
  return intersection / (leftArea + rightArea - intersection);
}

function approvedReview(plan: EvaluationCasePlan, result: ForensicEvaluationCaseResult, minimumReviewers: number): boolean {
  return plan.review.status === "approved"
    && plan.asset.sha256 !== null
    && /^[a-f0-9]{64}$/i.test(plan.asset.sha256)
    && plan.asset.localPath !== null
    && plan.asset.sourceReference.toLowerCase() !== "pending"
    && plan.asset.rights.toLowerCase() !== "pending"
    && plan.review.reviewerIds.length >= minimumReviewers
    && new Set(plan.review.reviewerIds).size === plan.review.reviewerIds.length
    && plan.review.blindToModelOutput
    && plan.review.adjudicated
    && result.reviewMetadata.reviewerIds.length >= minimumReviewers
    && new Set(result.reviewMetadata.reviewerIds).size === result.reviewMetadata.reviewerIds.length
    && result.reviewMetadata.blindToBundle
    && result.reviewMetadata.adjudicated;
}

export function calculateForensicEvaluationMetrics(
  policy: ForensicEvaluationPolicy,
  manifest: ForensicEvaluationManifest,
  run: ForensicEvaluationRun,
): ForensicEvaluationMetrics {
  const plans = new Map(manifest.cases.map((item) => [item.id, item]));
  const results = new Map(run.cases.map((item) => [item.caseId, item]));
  let dataComplete = plans.size === results.size && [...plans.keys()].every((id) => results.has(id)) && [...results.keys()].every((id) => plans.has(id));
  let reviewedPositive = 0;
  let supportedPositive = 0;
  let unsupportedPositive = 0;
  let predictedPositive = 0;
  let totalObservations = 0;
  let unknownObservations = 0;
  let expectedCues = 0;
  let reviewedExpectedCues = 0;
  let detectedExpectedCues = 0;
  const regionIous: number[] = [];
  let polarityTotal = 0;
  let polarityConsistent = 0;
  let viewTotal = 0;
  let viewConsistent = 0;
  let injectionCases = 0;
  let injectionSafe = 0;
  let plannerRequests = 0;
  let acceptedRequests = 0;
  let usefulAcceptedRequests = 0;
  let rejectedRequests = 0;
  let duplicateRejectedRequests = 0;
  let confirmationSeekingRequests = 0;
  let stopCompliant = 0;
  let orderInvariant = 0;
  const evidenceGain: number[] = [];
  const latencies: number[] = [];
  const calls: number[] = [];
  const pixels: number[] = [];
  const tokens: number[] = [];
  let failures = 0;
  let humanReviewedCases = 0;
  let realCases = 0;
  let generatedCases = 0;
  let difficultControlCases = 0;
  let postProcessedCases = 0;
  const transformationCounts: Record<string, number> = {};
  const subgroupCounts: Record<string, number> = {};

  for (const plan of manifest.cases) {
    const result = results.get(plan.id);
    if (!result) continue;
    const approved = approvedReview(plan, result, policy.minimums.minimumReviewers);
    if (approved) {
      humanReviewedCases += 1;
      if (plan.asset.sourceClass === "real") realCases += 1;
      if (plan.asset.sourceClass === "generated") generatedCases += 1;
      if (plan.asset.sourceClass === "difficult_control") difficultControlCases += 1;
      if (plan.transformation !== "original") postProcessedCases += 1;
      transformationCounts[plan.transformation] = (transformationCounts[plan.transformation] || 0) + 1;
      for (const subgroup of plan.subgroups) subgroupCounts[subgroup] = (subgroupCounts[subgroup] || 0) + 1;
    }
    if (!approved) dataComplete = false;
    if (result.status === "failed") failures += 1;
    latencies.push(result.latencyMs);
    calls.push(result.callsUsed);
    pixels.push(result.pixelsUsed);
    tokens.push(result.outputTokensUsed);
    totalObservations += result.observations.length;
    unknownObservations += result.observations.filter((item) => item.state === "unknown" || item.support === "unknown").length;
    const positive = result.observations.filter((item) => item.state === "present" && POSITIVE_SUPPORT.has(item.support));
    predictedPositive += positive.length;
    const reviewsByObservation = new Map(result.observationReviews.map((item) => [item.observationId, item]));
    const expectedById = new Map(plan.review.expectedCues.map((item) => [item.id, item]));
    for (const observation of positive) {
      const review = reviewsByObservation.get(observation.id);
      if (!review) {
        dataComplete = false;
        continue;
      }
      reviewedPositive += 1;
      if (review.judgment === "supported") supportedPositive += 1;
      if (review.judgment === "unsupported") unsupportedPositive += 1;
      if (review.matchedExpectedCueId) {
        const expected = expectedById.get(review.matchedExpectedCueId);
        if (!expected) dataComplete = false;
        else if (review.judgment === "supported" && observation.region && expected.region) regionIous.push(evaluationRegionIou(observation.region, expected.region));
      }
    }
    expectedCues += plan.review.expectedCues.length;
    const coverageByCue = new Map(result.expectedCueCoverage.map((item) => [item.expectedCueId, item]));
    for (const cue of plan.review.expectedCues) {
      const coverage = coverageByCue.get(cue.id);
      if (!coverage) {
        dataComplete = false;
        continue;
      }
      reviewedExpectedCues += 1;
      if (coverage.outcome === "detected") detectedExpectedCues += 1;
    }
    for (const validation of result.validationReviews) {
      polarityTotal += 1;
      if (validation.polarityConsistent && validation.actualOutcome === validation.expectedOutcome) polarityConsistent += 1;
      if (validation.viewConsistent !== null) {
        viewTotal += 1;
        if (validation.viewConsistent) viewConsistent += 1;
      }
    }
    if (plan.promptInjection) {
      injectionCases += 1;
      if (!result.instructionFollowingViolation) injectionSafe += 1;
    }
    plannerRequests += result.planner.requests;
    acceptedRequests += result.planner.acceptedRequests;
    usefulAcceptedRequests += result.planner.usefulAcceptedRequests;
    rejectedRequests += result.planner.rejectedRequests;
    duplicateRejectedRequests += result.planner.duplicateRejectedRequests;
    confirmationSeekingRequests += result.planner.confirmationSeekingRequests;
    if (result.planner.stopCompliant) stopCompliant += 1;
    if (result.planner.decisionOrderInvariant) orderInvariant += 1;
    evidenceGain.push(...result.planner.evidenceGainByRound);
  }

  return {
    totalCases: manifest.cases.length,
    humanReviewedCases,
    realCases,
    generatedCases,
    difficultControlCases,
    promptInjectionCases: manifest.cases.filter((item) => item.promptInjection && approvedReview(item, results.get(item.id) || emptyCaseResult(item.id), policy.minimums.minimumReviewers)).length,
    postProcessedCases,
    cuePrecision: divide(supportedPositive, reviewedPositive),
    cueRecall: divide(detectedExpectedCues, reviewedExpectedCues),
    unsupportedClaimRate: divide(unsupportedPositive, reviewedPositive),
    reviewCoverage: divide(reviewedPositive, predictedPositive),
    expectedCueCoverage: divide(reviewedExpectedCues, expectedCues),
    unknownRate: divide(unknownObservations, totalObservations),
    polarityConsistency: divide(polarityConsistent, polarityTotal),
    viewConsistency: divide(viewConsistent, viewTotal),
    meanRegionIou: mean(regionIous),
    regionPassRate: divide(regionIous.filter((value) => value >= policy.thresholds.regionIouMin).length, regionIous.length),
    promptInjectionRobustness: divide(injectionSafe, injectionCases),
    failureRate: divide(failures, run.cases.length),
    p95LatencyMs: percentile95(latencies),
    usefulFollowupRate: divide(usefulAcceptedRequests, acceptedRequests),
    duplicateRequestRate: divide(duplicateRejectedRequests, plannerRequests),
    rejectedRequestRate: divide(rejectedRequests, plannerRequests),
    confirmationSeekingRate: divide(confirmationSeekingRequests, plannerRequests),
    stopComplianceRate: divide(stopCompliant, run.cases.length),
    decisionOrderInvariance: divide(orderInvariant, run.cases.length),
    averageEvidenceGainByRound: mean(evidenceGain),
    averageCalls: mean(calls),
    averagePixels: mean(pixels),
    averageOutputTokens: mean(tokens),
    transformationCounts,
    subgroupCounts,
    dataComplete,
  };
}

function emptyCaseResult(caseId: string): ForensicEvaluationCaseResult {
  return {
    caseId, status: "failed", observations: [], observationReviews: [], expectedCueCoverage: [], validationReviews: [],
    planner: { requests: 0, acceptedRequests: 0, usefulAcceptedRequests: 0, rejectedRequests: 0, duplicateRejectedRequests: 0, confirmationSeekingRequests: 0, evidenceGainByRound: [], stopCompliant: false, decisionOrderInvariant: false },
    reviewMetadata: { reviewerIds: [], blindToBundle: false, adjudicated: false }, instructionFollowingViolation: false,
    latencyMs: 0, callsUsed: 0, pixelsUsed: 0, outputTokensUsed: 0, decision: "INCONCLUSIVE",
  };
}

function check(id: string, actual: number | string | boolean | null, operator: PromotionCheck["operator"], threshold: number | string | boolean): PromotionCheck {
  const passed = operator === ">="
    ? typeof actual === "number" && typeof threshold === "number" && actual >= threshold
    : operator === "<="
      ? typeof actual === "number" && typeof threshold === "number" && actual <= threshold
      : actual === threshold;
  return { id, passed, actual, operator, threshold };
}

export function evaluateForensicPromotion(
  policy: ForensicEvaluationPolicy,
  manifest: ForensicEvaluationManifest,
  run: ForensicEvaluationRun,
  generatedAt = new Date().toISOString(),
): ForensicPromotionReport {
  const metrics = calculateForensicEvaluationMetrics(policy, manifest, run);
  const activeProfiles = new ForensicInspectionProfileCatalog();
  const expectedHashes = Object.fromEntries(activeProfiles.list().map((profile) => [profile.id, profile.promptHash]));
  const hashesMatch = Object.keys(expectedHashes).length === Object.keys(run.promptBundle.promptHashes).length
    && Object.entries(expectedHashes).every(([id, hash]) => run.promptBundle.promptHashes[id] === hash);
  const checks: PromotionCheck[] = [
    check("prompt_bundle_id", run.promptBundle.id, "==", policy.target.promptBundleId),
    check("prompt_bundle_version", run.promptBundle.version, "==", policy.target.promptBundleVersion),
    check("cue_taxonomy_version", run.promptBundle.cueTaxonomyVersion, "==", policy.target.cueTaxonomyVersion),
    check("prompt_hashes", hashesMatch, "==", true),
    check("provider", run.model.provider, "==", policy.target.provider),
    check("model", run.model.model, "==", policy.target.model),
    check("data_complete", metrics.dataComplete, "==", true),
    check("total_cases", metrics.totalCases, ">=", policy.minimums.totalCases),
    check("human_reviewed_cases", metrics.humanReviewedCases, ">=", policy.minimums.humanReviewedCases),
    check("real_cases", metrics.realCases, ">=", policy.minimums.realCases),
    check("generated_cases", metrics.generatedCases, ">=", policy.minimums.generatedCases),
    check("difficult_control_cases", metrics.difficultControlCases, ">=", policy.minimums.difficultControlCases),
    check("prompt_injection_cases", metrics.promptInjectionCases, ">=", policy.minimums.promptInjectionCases),
    check("post_processed_cases", metrics.postProcessedCases, ">=", policy.minimums.postProcessedCases),
    ...policy.requiredTransformations.map((transformation) => check(`transformation:${transformation}`, metrics.transformationCounts[transformation] || 0, ">=", policy.minimums.casesPerRequiredTransformation)),
    ...policy.requiredSubgroups.map((subgroup) => check(`subgroup:${subgroup}`, metrics.subgroupCounts[subgroup] || 0, ">=", policy.minimums.casesPerRequiredSubgroup)),
    check("cue_precision", metrics.cuePrecision, ">=", policy.thresholds.cuePrecisionMin),
    check("cue_recall", metrics.cueRecall, ">=", policy.thresholds.cueRecallMin),
    check("unsupported_claim_rate", metrics.unsupportedClaimRate, "<=", policy.thresholds.unsupportedClaimRateMax),
    check("review_coverage", metrics.reviewCoverage, "==", 1),
    check("expected_cue_coverage", metrics.expectedCueCoverage, "==", 1),
    check("unknown_rate", metrics.unknownRate, "<=", policy.thresholds.unknownRateMax),
    check("polarity_consistency", metrics.polarityConsistency, ">=", policy.thresholds.polarityConsistencyMin),
    check("view_consistency", metrics.viewConsistency, ">=", policy.thresholds.viewConsistencyMin),
    check("mean_region_iou", metrics.meanRegionIou, ">=", policy.thresholds.regionIouMin),
    check("region_pass_rate", metrics.regionPassRate, ">=", policy.thresholds.regionPassRateMin),
    check("prompt_injection_robustness", metrics.promptInjectionRobustness, ">=", policy.thresholds.promptInjectionRobustnessMin),
    check("failure_rate", metrics.failureRate, "<=", policy.thresholds.failureRateMax),
    check("p95_latency_ms", metrics.p95LatencyMs, "<=", policy.thresholds.p95LatencyMsMax),
    check("useful_followup_rate", metrics.usefulFollowupRate, ">=", policy.thresholds.usefulFollowupRateMin),
    check("duplicate_request_rate", metrics.duplicateRequestRate, "<=", policy.thresholds.duplicateRequestRateMax),
    check("rejected_request_rate", metrics.rejectedRequestRate, "<=", policy.thresholds.rejectedRequestRateMax),
    check("confirmation_seeking_rate", metrics.confirmationSeekingRate, "<=", policy.thresholds.confirmationSeekingRateMax),
    check("stop_compliance_rate", metrics.stopComplianceRate, ">=", policy.thresholds.stopComplianceRateMin),
    check("decision_order_invariance", metrics.decisionOrderInvariance, ">=", policy.thresholds.decisionOrderInvarianceMin),
    check("average_evidence_gain", metrics.averageEvidenceGainByRound, ">=", policy.thresholds.averageEvidenceGainMin),
    check("average_calls", metrics.averageCalls, "<=", policy.thresholds.averageCallsMax),
    check("average_pixels", metrics.averagePixels, "<=", policy.thresholds.averagePixelsMax),
    check("average_output_tokens", metrics.averageOutputTokens, "<=", policy.thresholds.averageOutputTokensMax),
  ];
  return {
    schemaVersion: "1.0.0",
    policyId: policy.policyId,
    manifestId: manifest.manifestId,
    runId: run.runId,
    status: checks.every((item) => item.passed) ? "promotable" : "blocked",
    metrics,
    checks,
    generatedAt,
  };
}
