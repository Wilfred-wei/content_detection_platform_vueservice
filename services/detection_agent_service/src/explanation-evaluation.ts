import type { Verdict } from "./analysis-types.js";
import { ACTIVE_EXPLANATION_PROMPT_BUNDLE } from "./explanation-prompts.js";

export interface ExplanationEvaluationPolicy {
  schemaVersion: "1.0.0";
  policyId: string;
  target: {
    promptBundleId: string;
    promptBundleVersion: string;
    provider: string;
    model: string;
  };
  minimums: {
    totalCases: number;
    humanReviewedCases: number;
    minimumReviewers: number;
    aiGeneratedCases: number;
    likelyNonAiCases: number;
    inconclusiveCases: number;
    fallbackControlCases: number;
    promptInjectionCases: number;
    casesPerRequiredGroup: number;
  };
  thresholds: {
    requiredClaimSupportRateMin: number;
    claimContradictionRateMax: number;
    claimUnverifiableRateMax: number;
    unsupportedClaimRateMax: number;
    verdictConsistencyMin: number;
    polarityConsistencyMin: number;
    fallbackAppropriatenessMin: number;
    publishedExplanationAcceptanceMin: number;
    promptInjectionRobustnessMin: number;
    falseAcceptRateMax: number;
    falseFallbackRateMax: number;
    exactCheckPassRateMin: number;
    failureRateMax: number;
    p95LatencyMsMax: number;
    averageSynthesisAttemptsMax: number;
  };
  requiredGroups: string[];
}

export interface ExplanationEvaluationCasePlan {
  id: string;
  inputSnapshotSha256: string | null;
  sourceReference: string;
  expectedVerdict: Verdict;
  requiredClaimIds: string[];
  groups: string[];
  promptInjection: boolean;
  fallbackControl: boolean;
  review: {
    status: "pending" | "approved";
    reviewerIds: string[];
    blindToCandidateOutput: boolean;
    adjudicated: boolean;
  };
}

export interface ExplanationEvaluationManifest {
  schemaVersion: "1.0.0";
  manifestId: string;
  createdAt: string;
  cases: ExplanationEvaluationCasePlan[];
}

export type HumanClaimOutcome = "supported" | "contradicted" | "unverifiable";

export interface ExplanationEvaluationCaseResult {
  caseId: string;
  status: "completed" | "failed";
  explanationSha256: string | null;
  outputType: "ai_synthesis" | "deterministic_fallback";
  synthesisAttempts: number;
  latencyMs: number;
  validationStatus: "verified" | "fallback" | "failed";
  exactChecks: { passed: number; total: number };
  polarityChecks: Array<{
    variant: "positive" | "inverse" | "paraphrase" | "forced_choice";
    outcome: "supported" | "contradicted" | "unverifiable";
  }>;
  humanReview: {
    reviewerIds: string[];
    blindToBundle: boolean;
    adjudicated: boolean;
    claimOutcomes: Array<{ claimId: string; outcome: HumanClaimOutcome }>;
    unsupportedClaimCount: number;
    verdictConsistent: boolean;
    candidateDraftAcceptable: boolean;
    fallbackAppropriate: boolean;
    publishedExplanationAcceptable: boolean;
    instructionFollowingViolation: boolean;
  };
}

export interface ExplanationEvaluationRun {
  schemaVersion: "1.0.0";
  runId: string;
  createdAt: string;
  promptBundle: { id: string; version: string; promptHashes: Record<string, string> };
  model: { provider: string; model: string };
  cases: ExplanationEvaluationCaseResult[];
}

export interface ExplanationEvaluationMetrics {
  totalCases: number;
  humanReviewedCases: number;
  aiGeneratedCases: number;
  likelyNonAiCases: number;
  inconclusiveCases: number;
  fallbackControlCases: number;
  promptInjectionCases: number;
  requiredClaimSupportRate: number | null;
  claimContradictionRate: number | null;
  claimUnverifiableRate: number | null;
  unsupportedClaimRate: number | null;
  verdictConsistency: number | null;
  polarityConsistency: number | null;
  fallbackAppropriateness: number | null;
  publishedExplanationAcceptance: number | null;
  promptInjectionRobustness: number | null;
  falseAcceptRate: number | null;
  falseFallbackRate: number | null;
  fallbackRate: number | null;
  exactCheckPassRate: number | null;
  failureRate: number | null;
  p95LatencyMs: number | null;
  averageSynthesisAttempts: number | null;
  groupCounts: Record<string, number>;
  dataComplete: boolean;
}

export interface ExplanationPromotionCheck {
  id: string;
  passed: boolean;
  actual: string | number | boolean | null;
  operator: ">=" | "<=" | "==";
  threshold: string | number | boolean;
}

export interface ExplanationPromotionReport {
  schemaVersion: "1.0.0";
  policyId: string;
  manifestId: string;
  runId: string;
  status: "promotable" | "blocked";
  metrics: ExplanationEvaluationMetrics;
  checks: ExplanationPromotionCheck[];
  generatedAt: string;
}

const VERDICTS = new Set<Verdict>(["AI_GENERATED", "LIKELY_NON_AI", "INCONCLUSIVE"]);
const OUTPUT_TYPES = new Set<ExplanationEvaluationCaseResult["outputType"]>(["ai_synthesis", "deterministic_fallback"]);
const VALIDATION_STATUSES = new Set<ExplanationEvaluationCaseResult["validationStatus"]>(["verified", "fallback", "failed"]);
const CLAIM_OUTCOMES = new Set<HumanClaimOutcome>(["supported", "contradicted", "unverifiable"]);
const POLARITY_VARIANTS = new Set<ExplanationEvaluationCaseResult["polarityChecks"][number]["variant"]>(["positive", "inverse", "paraphrase", "forced_choice"]);

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`INVALID_EXPLANATION_EVALUATION_${name.toUpperCase()}`);
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`INVALID_EXPLANATION_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function text(value: unknown, name: string, maximum = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`INVALID_EXPLANATION_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function numberValue(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new Error(`INVALID_EXPLANATION_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function integer(value: unknown, name: string, minimum = 0): number {
  const parsed = numberValue(value, name, minimum);
  if (!Number.isInteger(parsed)) throw new Error(`INVALID_EXPLANATION_EVALUATION_${name.toUpperCase()}`);
  return parsed;
}

function ratio(value: unknown, name: string): number {
  const parsed = numberValue(value, name);
  if (parsed > 1) throw new Error(`INVALID_EXPLANATION_EVALUATION_${name.toUpperCase()}`);
  return parsed;
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`INVALID_EXPLANATION_EVALUATION_${name.toUpperCase()}`);
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, name: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`INVALID_EXPLANATION_EVALUATION_${name.toUpperCase()}`);
  return value as T;
}

function stringArray(value: unknown, name: string): string[] {
  return array(value, name).map((item) => text(item, name));
}

export function parseExplanationEvaluationPolicy(value: unknown): ExplanationEvaluationPolicy {
  const root = record(value, "policy");
  if (root.schemaVersion !== "1.0.0") throw new Error("UNSUPPORTED_EXPLANATION_EVALUATION_POLICY_SCHEMA");
  const target = record(root.target, "target");
  const minimums = record(root.minimums, "minimums");
  const thresholds = record(root.thresholds, "thresholds");
  return {
    schemaVersion: "1.0.0",
    policyId: text(root.policyId, "policy_id"),
    target: {
      promptBundleId: text(target.promptBundleId, "prompt_bundle_id"),
      promptBundleVersion: text(target.promptBundleVersion, "prompt_bundle_version"),
      provider: text(target.provider, "provider"),
      model: text(target.model, "model"),
    },
    minimums: {
      totalCases: integer(minimums.totalCases, "total_cases", 1),
      humanReviewedCases: integer(minimums.humanReviewedCases, "human_reviewed_cases", 1),
      minimumReviewers: integer(minimums.minimumReviewers, "minimum_reviewers", 1),
      aiGeneratedCases: integer(minimums.aiGeneratedCases, "ai_generated_cases"),
      likelyNonAiCases: integer(minimums.likelyNonAiCases, "likely_non_ai_cases"),
      inconclusiveCases: integer(minimums.inconclusiveCases, "inconclusive_cases"),
      fallbackControlCases: integer(minimums.fallbackControlCases, "fallback_control_cases"),
      promptInjectionCases: integer(minimums.promptInjectionCases, "prompt_injection_cases"),
      casesPerRequiredGroup: integer(minimums.casesPerRequiredGroup, "cases_per_required_group"),
    },
    thresholds: {
      requiredClaimSupportRateMin: ratio(thresholds.requiredClaimSupportRateMin, "required_claim_support_rate_min"),
      claimContradictionRateMax: ratio(thresholds.claimContradictionRateMax, "claim_contradiction_rate_max"),
      claimUnverifiableRateMax: ratio(thresholds.claimUnverifiableRateMax, "claim_unverifiable_rate_max"),
      unsupportedClaimRateMax: ratio(thresholds.unsupportedClaimRateMax, "unsupported_claim_rate_max"),
      verdictConsistencyMin: ratio(thresholds.verdictConsistencyMin, "verdict_consistency_min"),
      polarityConsistencyMin: ratio(thresholds.polarityConsistencyMin, "polarity_consistency_min"),
      fallbackAppropriatenessMin: ratio(thresholds.fallbackAppropriatenessMin, "fallback_appropriateness_min"),
      publishedExplanationAcceptanceMin: ratio(thresholds.publishedExplanationAcceptanceMin, "published_explanation_acceptance_min"),
      promptInjectionRobustnessMin: ratio(thresholds.promptInjectionRobustnessMin, "prompt_injection_robustness_min"),
      falseAcceptRateMax: ratio(thresholds.falseAcceptRateMax, "false_accept_rate_max"),
      falseFallbackRateMax: ratio(thresholds.falseFallbackRateMax, "false_fallback_rate_max"),
      exactCheckPassRateMin: ratio(thresholds.exactCheckPassRateMin, "exact_check_pass_rate_min"),
      failureRateMax: ratio(thresholds.failureRateMax, "failure_rate_max"),
      p95LatencyMsMax: numberValue(thresholds.p95LatencyMsMax, "p95_latency_ms_max", 1),
      averageSynthesisAttemptsMax: numberValue(thresholds.averageSynthesisAttemptsMax, "average_synthesis_attempts_max", 1),
    },
    requiredGroups: stringArray(root.requiredGroups, "required_groups"),
  };
}

export function parseExplanationEvaluationManifest(value: unknown): ExplanationEvaluationManifest {
  const root = record(value, "manifest");
  if (root.schemaVersion !== "1.0.0") throw new Error("UNSUPPORTED_EXPLANATION_EVALUATION_MANIFEST_SCHEMA");
  const seen = new Set<string>();
  const cases = array(root.cases, "cases").map((value): ExplanationEvaluationCasePlan => {
    const item = record(value, "case");
    const id = text(item.id, "case_id");
    if (seen.has(id)) throw new Error("DUPLICATE_EXPLANATION_EVALUATION_CASE");
    seen.add(id);
    const review = record(item.review, "review");
    const status = enumValue(review.status, new Set(["pending", "approved"] as const), "review_status");
    const requiredClaimIds = stringArray(item.requiredClaimIds, "required_claim_ids");
    if (new Set(requiredClaimIds).size !== requiredClaimIds.length) throw new Error("DUPLICATE_REQUIRED_CLAIM_ID");
    return {
      id,
      inputSnapshotSha256: item.inputSnapshotSha256 === null ? null : text(item.inputSnapshotSha256, "input_snapshot_sha256"),
      sourceReference: text(item.sourceReference, "source_reference"),
      expectedVerdict: enumValue(item.expectedVerdict, VERDICTS, "expected_verdict"),
      requiredClaimIds,
      groups: stringArray(item.groups, "groups"),
      promptInjection: booleanValue(item.promptInjection, "prompt_injection"),
      fallbackControl: booleanValue(item.fallbackControl, "fallback_control"),
      review: {
        status,
        reviewerIds: stringArray(review.reviewerIds, "reviewer_ids"),
        blindToCandidateOutput: booleanValue(review.blindToCandidateOutput, "blind_to_candidate_output"),
        adjudicated: booleanValue(review.adjudicated, "adjudicated"),
      },
    };
  });
  return { schemaVersion: "1.0.0", manifestId: text(root.manifestId, "manifest_id"), createdAt: text(root.createdAt, "created_at"), cases };
}

export function parseExplanationEvaluationRun(value: unknown): ExplanationEvaluationRun {
  const root = record(value, "run");
  if (root.schemaVersion !== "1.0.0") throw new Error("UNSUPPORTED_EXPLANATION_EVALUATION_RUN_SCHEMA");
  const bundle = record(root.promptBundle, "prompt_bundle");
  const model = record(root.model, "model");
  const promptHashes = Object.fromEntries(Object.entries(record(bundle.promptHashes, "prompt_hashes"))
    .map(([id, hash]) => [text(id, "prompt_hash_id"), text(hash, "prompt_hash")]));
  const seen = new Set<string>();
  const cases = array(root.cases, "run_cases").map((value): ExplanationEvaluationCaseResult => {
    const item = record(value, "run_case");
    const caseId = text(item.caseId, "case_id");
    if (seen.has(caseId)) throw new Error("DUPLICATE_EXPLANATION_EVALUATION_RUN_CASE");
    seen.add(caseId);
    const exactChecks = record(item.exactChecks, "exact_checks");
    const humanReview = record(item.humanReview, "human_review");
    const claimOutcomes = array(humanReview.claimOutcomes, "claim_outcomes").map((value) => {
      const claim = record(value, "claim_outcome");
      return { claimId: text(claim.claimId, "claim_id"), outcome: enumValue(claim.outcome, CLAIM_OUTCOMES, "claim_outcome") };
    });
    if (new Set(claimOutcomes.map((claim) => claim.claimId)).size !== claimOutcomes.length) throw new Error("DUPLICATE_HUMAN_CLAIM_OUTCOME");
    const polarityChecks = array(item.polarityChecks, "polarity_checks").map((value) => {
      const check = record(value, "polarity_check");
      return {
        variant: enumValue(check.variant, POLARITY_VARIANTS, "polarity_variant"),
        outcome: enumValue(check.outcome, CLAIM_OUTCOMES, "polarity_outcome"),
      };
    });
    if (new Set(polarityChecks.map((check) => check.variant)).size !== polarityChecks.length) throw new Error("DUPLICATE_POLARITY_VARIANT");
    const parsed: ExplanationEvaluationCaseResult = {
      caseId,
      status: enumValue(item.status, new Set(["completed", "failed"] as const), "case_status"),
      explanationSha256: item.explanationSha256 === null ? null : text(item.explanationSha256, "explanation_sha256"),
      outputType: enumValue(item.outputType, OUTPUT_TYPES, "output_type"),
      synthesisAttempts: integer(item.synthesisAttempts, "synthesis_attempts"),
      latencyMs: numberValue(item.latencyMs, "latency_ms"),
      validationStatus: enumValue(item.validationStatus, VALIDATION_STATUSES, "validation_status"),
      exactChecks: { passed: integer(exactChecks.passed, "exact_checks_passed"), total: integer(exactChecks.total, "exact_checks_total") },
      polarityChecks,
      humanReview: {
        reviewerIds: stringArray(humanReview.reviewerIds, "reviewer_ids"),
        blindToBundle: booleanValue(humanReview.blindToBundle, "blind_to_bundle"),
        adjudicated: booleanValue(humanReview.adjudicated, "adjudicated"),
        claimOutcomes,
        unsupportedClaimCount: integer(humanReview.unsupportedClaimCount, "unsupported_claim_count"),
        verdictConsistent: booleanValue(humanReview.verdictConsistent, "verdict_consistent"),
        candidateDraftAcceptable: booleanValue(humanReview.candidateDraftAcceptable, "candidate_draft_acceptable"),
        fallbackAppropriate: booleanValue(humanReview.fallbackAppropriate, "fallback_appropriate"),
        publishedExplanationAcceptable: booleanValue(humanReview.publishedExplanationAcceptable, "published_explanation_acceptable"),
        instructionFollowingViolation: booleanValue(humanReview.instructionFollowingViolation, "instruction_following_violation"),
      },
    };
    if (parsed.exactChecks.passed > parsed.exactChecks.total) throw new Error("INVALID_EXACT_CHECK_TOTAL");
    if (parsed.status === "completed" && (!parsed.explanationSha256 || !/^[a-f0-9]{64}$/i.test(parsed.explanationSha256))) {
      throw new Error("INVALID_EXPLANATION_SHA256");
    }
    return parsed;
  });
  return {
    schemaVersion: "1.0.0",
    runId: text(root.runId, "run_id"),
    createdAt: text(root.createdAt, "created_at"),
    promptBundle: { id: text(bundle.id, "prompt_bundle_id"), version: text(bundle.version, "prompt_bundle_version"), promptHashes },
    model: { provider: text(model.provider, "provider"), model: text(model.model, "model") },
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

function reviewed(plan: ExplanationEvaluationCasePlan, result: ExplanationEvaluationCaseResult, minimumReviewers: number): boolean {
  return plan.review.status === "approved"
    && plan.inputSnapshotSha256 !== null
    && /^[a-f0-9]{64}$/i.test(plan.inputSnapshotSha256)
    && plan.sourceReference.toLowerCase() !== "pending"
    && plan.review.reviewerIds.length >= minimumReviewers
    && new Set(plan.review.reviewerIds).size === plan.review.reviewerIds.length
    && plan.review.blindToCandidateOutput
    && plan.review.adjudicated
    && result.humanReview.reviewerIds.length >= minimumReviewers
    && new Set(result.humanReview.reviewerIds).size === result.humanReview.reviewerIds.length
    && result.humanReview.blindToBundle
    && result.humanReview.adjudicated;
}

export function calculateExplanationEvaluationMetrics(
  policy: ExplanationEvaluationPolicy,
  manifest: ExplanationEvaluationManifest,
  run: ExplanationEvaluationRun,
): ExplanationEvaluationMetrics {
  const plans = new Map(manifest.cases.map((item) => [item.id, item]));
  const results = new Map(run.cases.map((item) => [item.caseId, item]));
  let dataComplete = plans.size === results.size
    && [...plans.keys()].every((id) => results.has(id))
    && [...results.keys()].every((id) => plans.has(id));
  let humanReviewedCases = 0;
  let aiGeneratedCases = 0;
  let likelyNonAiCases = 0;
  let inconclusiveCases = 0;
  let fallbackControlCases = 0;
  let promptInjectionCases = 0;
  let supportedClaims = 0;
  let contradictedClaims = 0;
  let unverifiableClaims = 0;
  let unsupportedClaims = 0;
  let verdictConsistent = 0;
  let polaritySupported = 0;
  let polarityTotal = 0;
  let fallbackAppropriate = 0;
  let publicationAccepted = 0;
  let injectionSafe = 0;
  let falseAccepts = 0;
  let falseFallbacks = 0;
  let fallbacks = 0;
  let exactPassed = 0;
  let exactTotal = 0;
  let failures = 0;
  const latencies: number[] = [];
  const attempts: number[] = [];
  const groupCounts: Record<string, number> = {};

  for (const plan of manifest.cases) {
    const result = results.get(plan.id);
    if (!result) continue;
    const approved = reviewed(plan, result, policy.minimums.minimumReviewers);
    if (!approved) dataComplete = false;
    if (approved) {
      humanReviewedCases += 1;
      if (plan.expectedVerdict === "AI_GENERATED") aiGeneratedCases += 1;
      if (plan.expectedVerdict === "LIKELY_NON_AI") likelyNonAiCases += 1;
      if (plan.expectedVerdict === "INCONCLUSIVE") inconclusiveCases += 1;
      if (plan.fallbackControl) fallbackControlCases += 1;
      if (plan.promptInjection) promptInjectionCases += 1;
      for (const group of plan.groups) groupCounts[group] = (groupCounts[group] || 0) + 1;
    }
    if (result.status === "failed") failures += 1;
    else if (!result.explanationSha256) dataComplete = false;
    latencies.push(result.latencyMs);
    attempts.push(result.synthesisAttempts);
    const expectedClaims = new Set(plan.requiredClaimIds);
    const reviewedClaims = new Map(result.humanReview.claimOutcomes.map((item) => [item.claimId, item.outcome]));
    if (expectedClaims.size !== reviewedClaims.size || [...expectedClaims].some((id) => !reviewedClaims.has(id))) dataComplete = false;
    for (const claimId of expectedClaims) {
      const outcome = reviewedClaims.get(claimId);
      if (outcome === "supported") supportedClaims += 1;
      if (outcome === "contradicted") contradictedClaims += 1;
      if (outcome === "unverifiable") unverifiableClaims += 1;
    }
    unsupportedClaims += result.humanReview.unsupportedClaimCount;
    if (result.humanReview.verdictConsistent) verdictConsistent += 1;
    polaritySupported += result.polarityChecks.filter((item) => item.outcome === "supported").length;
    polarityTotal += result.polarityChecks.length;
    if (result.polarityChecks.length !== 4 || new Set(result.polarityChecks.map((item) => item.variant)).size !== 4) dataComplete = false;
    if (result.humanReview.fallbackAppropriate) fallbackAppropriate += 1;
    if (result.humanReview.publishedExplanationAcceptable) publicationAccepted += 1;
    if (plan.promptInjection && !result.humanReview.instructionFollowingViolation) injectionSafe += 1;
    if (result.outputType === "ai_synthesis" && !result.humanReview.candidateDraftAcceptable) falseAccepts += 1;
    if (result.outputType === "deterministic_fallback") {
      fallbacks += 1;
      if (result.humanReview.candidateDraftAcceptable) falseFallbacks += 1;
    }
    exactPassed += result.exactChecks.passed;
    exactTotal += result.exactChecks.total;
    if (result.exactChecks.total === 0) dataComplete = false;
  }
  const reviewedClaimTotal = supportedClaims + contradictedClaims + unverifiableClaims;
  return {
    totalCases: manifest.cases.length,
    humanReviewedCases,
    aiGeneratedCases,
    likelyNonAiCases,
    inconclusiveCases,
    fallbackControlCases,
    promptInjectionCases,
    requiredClaimSupportRate: divide(supportedClaims, reviewedClaimTotal),
    claimContradictionRate: divide(contradictedClaims, reviewedClaimTotal),
    claimUnverifiableRate: divide(unverifiableClaims, reviewedClaimTotal),
    unsupportedClaimRate: divide(unsupportedClaims, reviewedClaimTotal + unsupportedClaims),
    verdictConsistency: divide(verdictConsistent, run.cases.length),
    polarityConsistency: divide(polaritySupported, polarityTotal),
    fallbackAppropriateness: divide(fallbackAppropriate, run.cases.length),
    publishedExplanationAcceptance: divide(publicationAccepted, run.cases.length),
    promptInjectionRobustness: divide(injectionSafe, promptInjectionCases),
    falseAcceptRate: divide(falseAccepts, run.cases.length),
    falseFallbackRate: divide(falseFallbacks, run.cases.length),
    fallbackRate: divide(fallbacks, run.cases.length),
    exactCheckPassRate: divide(exactPassed, exactTotal),
    failureRate: divide(failures, run.cases.length),
    p95LatencyMs: percentile95(latencies),
    averageSynthesisAttempts: mean(attempts),
    groupCounts,
    dataComplete,
  };
}

function check(id: string, actual: string | number | boolean | null, operator: ExplanationPromotionCheck["operator"], threshold: string | number | boolean): ExplanationPromotionCheck {
  const passed = operator === ">="
    ? typeof actual === "number" && typeof threshold === "number" && actual >= threshold
    : operator === "<="
      ? typeof actual === "number" && typeof threshold === "number" && actual <= threshold
      : actual === threshold;
  return { id, passed, actual, operator, threshold };
}

export function evaluateExplanationPromotion(
  policy: ExplanationEvaluationPolicy,
  manifest: ExplanationEvaluationManifest,
  run: ExplanationEvaluationRun,
  generatedAt = new Date().toISOString(),
): ExplanationPromotionReport {
  const metrics = calculateExplanationEvaluationMetrics(policy, manifest, run);
  const expectedHashes = ACTIVE_EXPLANATION_PROMPT_BUNDLE.promptHashes;
  const hashesMatch = Object.keys(expectedHashes).length === Object.keys(run.promptBundle.promptHashes).length
    && Object.entries(expectedHashes).every(([id, hash]) => run.promptBundle.promptHashes[id] === hash);
  const checks: ExplanationPromotionCheck[] = [
    check("prompt_bundle_id", run.promptBundle.id, "==", policy.target.promptBundleId),
    check("prompt_bundle_version", run.promptBundle.version, "==", policy.target.promptBundleVersion),
    check("prompt_hashes", hashesMatch, "==", true),
    check("provider", run.model.provider, "==", policy.target.provider),
    check("model", run.model.model, "==", policy.target.model),
    check("data_complete", metrics.dataComplete, "==", true),
    check("total_cases", metrics.totalCases, ">=", policy.minimums.totalCases),
    check("human_reviewed_cases", metrics.humanReviewedCases, ">=", policy.minimums.humanReviewedCases),
    check("ai_generated_cases", metrics.aiGeneratedCases, ">=", policy.minimums.aiGeneratedCases),
    check("likely_non_ai_cases", metrics.likelyNonAiCases, ">=", policy.minimums.likelyNonAiCases),
    check("inconclusive_cases", metrics.inconclusiveCases, ">=", policy.minimums.inconclusiveCases),
    check("fallback_control_cases", metrics.fallbackControlCases, ">=", policy.minimums.fallbackControlCases),
    check("prompt_injection_cases", metrics.promptInjectionCases, ">=", policy.minimums.promptInjectionCases),
    ...policy.requiredGroups.map((group) => check(`group:${group}`, metrics.groupCounts[group] || 0, ">=", policy.minimums.casesPerRequiredGroup)),
    check("required_claim_support_rate", metrics.requiredClaimSupportRate, ">=", policy.thresholds.requiredClaimSupportRateMin),
    check("claim_contradiction_rate", metrics.claimContradictionRate, "<=", policy.thresholds.claimContradictionRateMax),
    check("claim_unverifiable_rate", metrics.claimUnverifiableRate, "<=", policy.thresholds.claimUnverifiableRateMax),
    check("unsupported_claim_rate", metrics.unsupportedClaimRate, "<=", policy.thresholds.unsupportedClaimRateMax),
    check("verdict_consistency", metrics.verdictConsistency, ">=", policy.thresholds.verdictConsistencyMin),
    check("polarity_consistency", metrics.polarityConsistency, ">=", policy.thresholds.polarityConsistencyMin),
    check("fallback_appropriateness", metrics.fallbackAppropriateness, ">=", policy.thresholds.fallbackAppropriatenessMin),
    check("published_explanation_acceptance", metrics.publishedExplanationAcceptance, ">=", policy.thresholds.publishedExplanationAcceptanceMin),
    check("prompt_injection_robustness", metrics.promptInjectionRobustness, ">=", policy.thresholds.promptInjectionRobustnessMin),
    check("false_accept_rate", metrics.falseAcceptRate, "<=", policy.thresholds.falseAcceptRateMax),
    check("false_fallback_rate", metrics.falseFallbackRate, "<=", policy.thresholds.falseFallbackRateMax),
    check("exact_check_pass_rate", metrics.exactCheckPassRate, ">=", policy.thresholds.exactCheckPassRateMin),
    check("failure_rate", metrics.failureRate, "<=", policy.thresholds.failureRateMax),
    check("p95_latency_ms", metrics.p95LatencyMs, "<=", policy.thresholds.p95LatencyMsMax),
    check("average_synthesis_attempts", metrics.averageSynthesisAttempts, "<=", policy.thresholds.averageSynthesisAttemptsMax),
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
