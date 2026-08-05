import type { Verdict } from "./analysis-types.js";
import type { AiAuthenticityAssessmentRecord } from "./ai-authenticity-assessment.js";

export type AutomatedMultimodalSourceClass = "real" | "generated" | "difficult_control";
export type AutomatedMultimodalTransformation = "original" | "resize" | "jpeg_recompression" | "crop" | "screenshot" | "blur" | "color_edit" | "overlay";

export interface AutomatedMultimodalCase {
  schemaVersion: "automated-multimodal-case.v1";
  caseId: string;
  assetSha256: string;
  sourceClass: AutomatedMultimodalSourceClass;
  sourceReference: string;
  rights: { commercialEvaluationAllowed: true; redistributable: boolean };
  expectedVerdict: Verdict;
  baseAssetId: string;
  transformation: AutomatedMultimodalTransformation;
  promptInjection: boolean;
}

export interface AutomatedMultimodalObservation {
  caseId: string;
  assessment: AiAuthenticityAssessmentRecord | null;
  latencyMs: number;
  unsupportedClaimCount: number;
}

export interface AutomatedMultimodalEvaluationPolicy {
  minimumCases: number;
  minimumCasesPerSourceClass: number;
  requiredTransformations: AutomatedMultimodalTransformation[];
  minimumCasesPerTransformation: number;
  minimumPromptInjectionCases: number;
  threeWayAccuracyMin: number;
  realFalsePositiveRateMax: number;
  generatedFalseNegativeRateMax: number;
  abstentionRateMax: number;
  calibrationMeanConfidenceMin: number;
  transformationStabilityMin: number;
  criticCoverageMin: number;
  unsupportedClaimRateMax: number;
  promptInjectionRobustnessMin: number;
  p95LatencyMsMax: number;
  failureRateMax: number;
}

export interface AutomatedMultimodalEvaluationReport {
  schemaVersion: "automated-multimodal-evaluation.v1";
  evaluatorVersion: "automated-multimodal-evaluator.v1";
  cases: number;
  completedCases: number;
  sourceCounts: Record<AutomatedMultimodalSourceClass, number>;
  transformationCounts: Record<AutomatedMultimodalTransformation, number>;
  threeWayAccuracy: number | null;
  realFalsePositiveRate: number | null;
  generatedFalseNegativeRate: number | null;
  abstentionRate: number | null;
  calibration: { meanConfidence: number | null; meanCorrectConfidence: number | null; overconfidenceRate: number | null };
  transformationStability: number | null;
  criticBehavior: { coverage: number | null; challengeRate: number | null; unsupportedReasonSuppressionRate: number | null };
  unsupportedClaimRate: number | null;
  promptInjectionRobustness: number | null;
  p95LatencyMs: number | null;
  failureRate: number | null;
  dataComplete: boolean;
  publicationPassed: boolean;
  checks: Array<{ id: string; passed: boolean; actual: number | boolean | null; threshold: number | boolean }>;
  failures: string[];
}

const SHA256 = /^[a-f0-9]{64}$/i;
const SOURCE_CLASSES = new Set<AutomatedMultimodalSourceClass>(["real", "generated", "difficult_control"]);
const VERDICTS = new Set<Verdict>(["AI_GENERATED", "LIKELY_NON_AI", "INCONCLUSIVE"]);
const TRANSFORMATIONS = new Set<AutomatedMultimodalTransformation>(["original", "resize", "jpeg_recompression", "crop", "screenshot", "blur", "color_edit", "overlay"]);

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`INVALID_AUTOMATED_MULTIMODAL:${field}`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum = 400): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`INVALID_AUTOMATED_MULTIMODAL:${field}`);
  return value.trim();
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`INVALID_AUTOMATED_MULTIMODAL:${field}:fields`);
}

function probability(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`INVALID_AUTOMATED_MULTIMODAL:${field}`);
  }
  return value;
}

function parseAssessment(value: unknown): AiAuthenticityAssessmentRecord {
  const root = object(value, "assessment");
  if (root.schemaVersion !== "2.0.0") throw new Error("INVALID_AUTOMATED_MULTIMODAL:assessmentSchemaVersion");
  if (!["completed", "unavailable", "failed"].includes(String(root.status))) {
    throw new Error("INVALID_AUTOMATED_MULTIMODAL:assessmentStatus");
  }
  for (const field of ["reason", "provider", "model", "authority"] as const) text(root[field], `assessment.${field}`);
  if (root.authority !== "probabilistic_ai_opinion") throw new Error("INVALID_AUTOMATED_MULTIMODAL:assessmentAuthority");
  if (!["completed", "failed", "skipped"].includes(String(root.criticStatus))) {
    throw new Error("INVALID_AUTOMATED_MULTIMODAL:criticStatus");
  }
  object(root.promptBundle, "assessment.promptBundle");
  const reconciled = object(root.reconciled, "assessment.reconciled");
  if (reconciled.authority !== "probabilistic_ai_opinion" || reconciled.authenticatedProvenance !== false) {
    throw new Error("INVALID_AUTOMATED_MULTIMODAL:reconciledAuthority");
  }
  const final = root.final === undefined ? null : object(root.final, "assessment.final");
  if (root.status === "completed" && !final) throw new Error("INVALID_AUTOMATED_MULTIMODAL:completedWithoutFinal");
  if (final) {
    if (!VERDICTS.has(final.verdict as Verdict)) throw new Error("INVALID_AUTOMATED_MULTIMODAL:finalVerdict");
    probability(final.confidence, "assessment.finalConfidence");
    if (typeof final.imageInstructionDetected !== "boolean") throw new Error("INVALID_AUTOMATED_MULTIMODAL:finalInjectionFlag");
  }
  return value as AiAuthenticityAssessmentRecord;
}

export function parseAutomatedMultimodalCase(value: unknown): AutomatedMultimodalCase {
  const root = object(value, "case");
  exactKeys(root, ["schemaVersion", "caseId", "assetSha256", "sourceClass", "sourceReference", "rights", "expectedVerdict", "baseAssetId", "transformation", "promptInjection"], "case");
  if (root.schemaVersion !== "automated-multimodal-case.v1") throw new Error("INVALID_AUTOMATED_MULTIMODAL:schemaVersion");
  const sourceClass = root.sourceClass;
  const expectedVerdict = root.expectedVerdict;
  const transformation = root.transformation;
  if (!SOURCE_CLASSES.has(sourceClass as AutomatedMultimodalSourceClass)) throw new Error("INVALID_AUTOMATED_MULTIMODAL:sourceClass");
  if (!VERDICTS.has(expectedVerdict as Verdict)) throw new Error("INVALID_AUTOMATED_MULTIMODAL:expectedVerdict");
  if (!TRANSFORMATIONS.has(transformation as AutomatedMultimodalTransformation)) throw new Error("INVALID_AUTOMATED_MULTIMODAL:transformation");
  const assetSha256 = text(root.assetSha256, "assetSha256", 64).toLowerCase();
  if (!SHA256.test(assetSha256)) throw new Error("INVALID_AUTOMATED_MULTIMODAL:assetSha256");
  const rights = object(root.rights, "rights");
  exactKeys(rights, ["commercialEvaluationAllowed", "redistributable"], "rights");
  if (rights.commercialEvaluationAllowed !== true || typeof rights.redistributable !== "boolean") throw new Error("INVALID_AUTOMATED_MULTIMODAL:rights");
  if (rights.redistributable !== true) throw new Error("INVALID_AUTOMATED_MULTIMODAL:nonRedistributable");
  if (typeof root.promptInjection !== "boolean") throw new Error("INVALID_AUTOMATED_MULTIMODAL:promptInjection");
  const sourceReference = text(root.sourceReference, "sourceReference");
  if (sourceReference.toLowerCase() === "pending") throw new Error("INVALID_AUTOMATED_MULTIMODAL:pendingSourceReference");
  return {
    schemaVersion: "automated-multimodal-case.v1",
    caseId: text(root.caseId, "caseId"),
    assetSha256,
    sourceClass: sourceClass as AutomatedMultimodalSourceClass,
    sourceReference,
    rights: { commercialEvaluationAllowed: true, redistributable: true },
    expectedVerdict: expectedVerdict as Verdict,
    baseAssetId: text(root.baseAssetId, "baseAssetId"),
    transformation: transformation as AutomatedMultimodalTransformation,
    promptInjection: root.promptInjection as boolean,
  };
}

export function parseAutomatedMultimodalObservation(value: unknown): AutomatedMultimodalObservation {
  const root = object(value, "observation");
  exactKeys(root, ["caseId", "assessment", "latencyMs", "unsupportedClaimCount"], "observation");
  const caseId = text(root.caseId, "observation.caseId");
  if (typeof root.latencyMs !== "number" || !Number.isFinite(root.latencyMs) || root.latencyMs < 0) {
    throw new Error("INVALID_AUTOMATED_MULTIMODAL:latencyMs");
  }
  if (!Number.isSafeInteger(root.unsupportedClaimCount) || Number(root.unsupportedClaimCount) < 0) {
    throw new Error("INVALID_AUTOMATED_MULTIMODAL:unsupportedClaimCount");
  }
  return {
    caseId,
    assessment: root.assessment === null ? null : parseAssessment(root.assessment),
    latencyMs: root.latencyMs,
    unsupportedClaimCount: Number(root.unsupportedClaimCount),
  };
}

function ratio(numerator: number, denominator: number): number | null { return denominator > 0 ? numerator / denominator : null; }
function percentile95(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}
function check(id: string, actual: number | boolean | null, threshold: number | boolean, comparator: "min" | "max" | "equal" = "min") {
  const passed = comparator === "equal"
    ? actual === threshold
    : typeof actual === "number" && typeof threshold === "number" && (comparator === "min" ? actual >= threshold : actual <= threshold);
  return { id, passed, actual, threshold };
}

export function evaluateAutomatedMultimodalCases(
  rawCases: readonly AutomatedMultimodalCase[],
  observations: readonly AutomatedMultimodalObservation[],
  policy: AutomatedMultimodalEvaluationPolicy,
): AutomatedMultimodalEvaluationReport {
  const cases = rawCases.map(parseAutomatedMultimodalCase);
  const byCase = new Map<string, AutomatedMultimodalObservation>();
  const failures: string[] = [];
  for (const observation of observations) {
    if (byCase.has(observation.caseId)) failures.push(`duplicate_observation:${observation.caseId}`);
    if (!Number.isFinite(observation.latencyMs) || observation.latencyMs < 0) failures.push(`invalid_latency:${observation.caseId}`);
    if (!Number.isInteger(observation.unsupportedClaimCount) || observation.unsupportedClaimCount < 0) failures.push(`invalid_unsupported_claim_count:${observation.caseId}`);
    byCase.set(observation.caseId, observation);
  }
  if (new Set(cases.map((item) => item.caseId)).size !== cases.length) failures.push("duplicate_case_id");
  const sourceCounts = { real: 0, generated: 0, difficult_control: 0 } as Record<AutomatedMultimodalSourceClass, number>;
  const transformationCounts = Object.fromEntries([...TRANSFORMATIONS].map((item) => [item, 0])) as Record<AutomatedMultimodalTransformation, number>;
  for (const item of cases) {
    sourceCounts[item.sourceClass] += 1;
    transformationCounts[item.transformation] += 1;
    if (!byCase.has(item.caseId)) failures.push(`observation_missing:${item.caseId}`);
  }
  for (const observation of observations) if (!cases.some((item) => item.caseId === observation.caseId)) failures.push(`observation_unknown:${observation.caseId}`);
  const completed = cases.map((item) => ({ item, observation: byCase.get(item.caseId) })).filter((entry): entry is { item: AutomatedMultimodalCase; observation: AutomatedMultimodalObservation & { assessment: AiAuthenticityAssessmentRecord } } => Boolean(entry.observation?.assessment?.final));
  const predictions = completed.map(({ item, observation }) => ({ item, observation, assessment: observation.assessment, verdict: observation.assessment.final!.verdict, confidence: observation.assessment.final!.confidence }));
  const correct = predictions.filter(({ item, verdict }) => item.expectedVerdict === verdict).length;
  const real = predictions.filter(({ item }) => item.sourceClass === "real");
  const generated = predictions.filter(({ item }) => item.sourceClass === "generated");
  const abstained = predictions.filter(({ verdict }) => verdict === "INCONCLUSIVE").length;
  const meanConfidence = ratio(predictions.reduce((sum, item) => sum + item.confidence, 0), predictions.length);
  const correctConfidence = ratio(predictions.filter(({ item, verdict }) => item.expectedVerdict === verdict).reduce((sum, item) => sum + item.confidence, 0), correct);
  const overconfident = predictions.filter(({ item, verdict, confidence }) => item.expectedVerdict !== verdict && confidence >= 0.8).length;
  const originalByBase = new Map(predictions.filter(({ item }) => item.transformation === "original").map((entry) => [entry.item.baseAssetId, entry.verdict]));
  const transformed = predictions.filter(({ item }) => item.transformation !== "original" && originalByBase.has(item.baseAssetId));
  const stable = transformed.filter(({ item, verdict }) => originalByBase.get(item.baseAssetId) === verdict).length;
  const criticObserved = predictions.filter(({ assessment }) => assessment.criticStatus === "completed");
  const criticChallenged = criticObserved.filter(({ assessment }) => assessment.critic?.disposition === "CHALLENGE").length;
  const criticSuppressed = criticObserved.filter(({ assessment }) => {
    const unsupported = new Set(assessment.critic?.unsupportedReasonIds || []);
    return [...unsupported].every((id) => !(assessment.final?.retainedReasonIds || []).includes(id));
  }).length;
  const injectionCases = predictions.filter(({ item }) => item.promptInjection);
  const injectionSafe = injectionCases.filter(({ assessment }) => Boolean(assessment.direct?.imageInstructionDetected || assessment.critic?.imageInstructionDetected || assessment.final?.imageInstructionDetected)).length;
  const latencies = observations.map((item) => item.latencyMs).filter((item) => Number.isFinite(item) && item >= 0);
  const sourceComplete = Object.values(sourceCounts).every((count) => count >= policy.minimumCasesPerSourceClass);
  const transformationComplete = policy.requiredTransformations.every((transformation) => transformationCounts[transformation] >= policy.minimumCasesPerTransformation);
  const dataComplete = cases.length >= policy.minimumCases
    && sourceComplete
    && transformationComplete
    && injectionCases.length >= policy.minimumPromptInjectionCases
    && completed.length === cases.length
    && failures.length === 0;
  const checks = [
    check("data_complete", dataComplete, true, "equal"),
    check("three_way_accuracy", ratio(correct, predictions.length), policy.threeWayAccuracyMin),
    check("real_false_positive_rate", ratio(real.filter(({ verdict }) => verdict === "AI_GENERATED").length, real.length), policy.realFalsePositiveRateMax, "max"),
    check("generated_false_negative_rate", ratio(generated.filter(({ verdict }) => verdict === "LIKELY_NON_AI").length, generated.length), policy.generatedFalseNegativeRateMax, "max"),
    check("abstention_rate", ratio(abstained, predictions.length), policy.abstentionRateMax, "max"),
    check("mean_confidence", meanConfidence, policy.calibrationMeanConfidenceMin),
    check("transformation_stability", ratio(stable, transformed.length), policy.transformationStabilityMin),
    check("critic_coverage", ratio(criticObserved.length, predictions.length), policy.criticCoverageMin),
    check("unsupported_claim_rate", ratio(observations.reduce((sum, item) => sum + item.unsupportedClaimCount, 0), observations.length), policy.unsupportedClaimRateMax, "max"),
    check("prompt_injection_robustness", ratio(injectionSafe, injectionCases.length), policy.promptInjectionRobustnessMin),
    check("p95_latency_ms", percentile95(latencies), policy.p95LatencyMsMax, "max"),
    check("failure_rate", ratio(cases.length - completed.length, cases.length), policy.failureRateMax, "max"),
  ];
  if (!sourceComplete) failures.push("source_class_coverage_insufficient");
  if (!transformationComplete) failures.push("transformation_coverage_insufficient");
  if (injectionCases.length < policy.minimumPromptInjectionCases) failures.push("prompt_injection_coverage_insufficient");
  const publicationPassed = checks.every((item) => item.passed) && failures.length === 0;
  return {
    schemaVersion: "automated-multimodal-evaluation.v1",
    evaluatorVersion: "automated-multimodal-evaluator.v1",
    cases: cases.length,
    completedCases: completed.length,
    sourceCounts,
    transformationCounts,
    threeWayAccuracy: ratio(correct, predictions.length),
    realFalsePositiveRate: ratio(real.filter(({ verdict }) => verdict === "AI_GENERATED").length, real.length),
    generatedFalseNegativeRate: ratio(generated.filter(({ verdict }) => verdict === "LIKELY_NON_AI").length, generated.length),
    abstentionRate: ratio(abstained, predictions.length),
    calibration: { meanConfidence, meanCorrectConfidence: correctConfidence, overconfidenceRate: ratio(overconfident, predictions.length) },
    transformationStability: ratio(stable, transformed.length),
    criticBehavior: { coverage: ratio(criticObserved.length, predictions.length), challengeRate: ratio(criticChallenged, criticObserved.length), unsupportedReasonSuppressionRate: ratio(criticSuppressed, criticObserved.length) },
    unsupportedClaimRate: ratio(observations.reduce((sum, item) => sum + item.unsupportedClaimCount, 0), observations.length),
    promptInjectionRobustness: ratio(injectionSafe, injectionCases.length),
    p95LatencyMs: percentile95(latencies),
    failureRate: ratio(cases.length - completed.length, cases.length),
    dataComplete,
    publicationPassed,
    checks,
    failures,
  };
}
