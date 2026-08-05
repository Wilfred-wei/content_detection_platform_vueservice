import { loadProvenanceRegistry } from "./provenance-registry.js";
import type {
  ProvenanceEvaluationLabel,
  ProvenanceSchemeObservation,
  ProvenanceTransformationCategory,
} from "./provenance-scheme-evaluation.js";

export const PROVENANCE_ACCEPTANCE_SCENARIOS = [
  "unmarked_control",
  "forged_label",
  "forged_metadata",
  "invalid_signature",
  "unknown_key",
  "transformation_robustness",
  "false_positive",
  "completion_order",
  "early_exit",
] as const;

export type ProvenanceAcceptanceScenario = typeof PROVENANCE_ACCEPTANCE_SCENARIOS[number];

export interface ProvenanceAcceptanceCase {
  schemaVersion: "provenance-acceptance-case.v1";
  caseId: string;
  schemeId: string;
  profileId: string;
  scenario: ProvenanceAcceptanceScenario;
  observationRecordId: string | null;
  traceId: string | null;
  expectedLabel: ProvenanceEvaluationLabel | null;
  expectedTransformationCategory: ProvenanceTransformationCategory | null;
}

export interface ProvenanceAcceptanceTrace {
  schemaVersion: "provenance-acceptance-trace.v1";
  traceId: string;
  caseId: string;
  schemeId: string;
  directEvidenceCompleteBeforeModel: boolean;
  collectorCompletionOrder: string[];
  directEvidenceBarrierOrder: number;
  modelInvocationOrder: number | null;
  shortCircuitAuthorized: boolean;
  modelInvoked: boolean;
  lateAuthoritativeWritesRejected: boolean;
}

export interface ProvenanceAcceptanceFailure {
  caseId: string;
  schemeId: string;
  scenario: ProvenanceAcceptanceScenario;
  reason: string;
}

export interface ProvenanceAcceptanceReport {
  schemaVersion: "provenance-acceptance-report.v1";
  evaluatorVersion: "provenance-acceptance-evaluator.v1";
  requiredSchemes: string[];
  requiredScenarios: ProvenanceAcceptanceScenario[];
  cases: number;
  traces: number;
  passedCases: number;
  failedCases: number;
  coverageComplete: boolean;
  acceptancePassed: boolean;
  productionEvidenceEligible: false;
  shortCircuitEligible: false;
  failures: ProvenanceAcceptanceFailure[];
}

const LABELS = new Set<ProvenanceEvaluationLabel>(["marked_positive", "unmarked_control"]);
const TRANSFORMATIONS = new Set<ProvenanceTransformationCategory>([
  "original", "resize", "recompression", "crop", "screenshot", "blur", "color_edit", "overlay",
  "metadata_removal", "forged_label", "forged_metadata", "adversarial",
]);
const SCENARIOS = new Set<string>(PROVENANCE_ACCEPTANCE_SCENARIOS);

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`INVALID_PROVENANCE_ACCEPTANCE:${field}`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`INVALID_PROVENANCE_ACCEPTANCE:${field}:fields`);
  }
}

function text(value: unknown, field: string, maximum = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`INVALID_PROVENANCE_ACCEPTANCE:${field}`);
  }
  return value.trim();
}

function nullableText(value: unknown, field: string, maximum = 240): string | null {
  return value === null ? null : text(value, field, maximum);
}

function profileRegistered(schemeId: string, profileId: string): boolean {
  const scheme = loadProvenanceRegistry().schemes.find((candidate) => candidate.id === schemeId);
  if (!scheme) return false;
  return scheme.execution.profiles.length === 0
    ? profileId === "scheme-default"
    : scheme.execution.profiles.some((profile) => profile.id === profileId);
}

export function parseProvenanceAcceptanceCase(value: unknown): ProvenanceAcceptanceCase {
  const root = object(value, "case");
  exactKeys(root, [
    "schemaVersion", "caseId", "schemeId", "profileId", "scenario", "observationRecordId", "traceId",
    "expectedLabel", "expectedTransformationCategory",
  ], "case");
  if (root.schemaVersion !== "provenance-acceptance-case.v1") throw new Error("INVALID_PROVENANCE_ACCEPTANCE:schemaVersion");
  const schemeId = text(root.schemeId, "schemeId", 160);
  const profileId = text(root.profileId, "profileId", 160);
  if (!profileRegistered(schemeId, profileId)) throw new Error("INVALID_PROVENANCE_ACCEPTANCE:schemeProfile");
  if (typeof root.scenario !== "string" || !SCENARIOS.has(root.scenario)) throw new Error("INVALID_PROVENANCE_ACCEPTANCE:scenario");
  const scenario = root.scenario as ProvenanceAcceptanceScenario;
  const expectedLabel = root.expectedLabel === null ? null : root.expectedLabel;
  if (expectedLabel !== null && !LABELS.has(expectedLabel as ProvenanceEvaluationLabel)) throw new Error("INVALID_PROVENANCE_ACCEPTANCE:expectedLabel");
  const expectedTransformationCategory = root.expectedTransformationCategory === null ? null : root.expectedTransformationCategory;
  if (expectedTransformationCategory !== null && !TRANSFORMATIONS.has(expectedTransformationCategory as ProvenanceTransformationCategory)) {
    throw new Error("INVALID_PROVENANCE_ACCEPTANCE:expectedTransformationCategory");
  }
  const observationRecordId = nullableText(root.observationRecordId, "observationRecordId", 240);
  const traceId = nullableText(root.traceId, "traceId", 240);
  const needsObservation = !["completion_order", "early_exit"].includes(scenario);
  const needsTrace = ["completion_order", "early_exit"].includes(scenario);
  if (needsObservation !== (observationRecordId !== null)) throw new Error("INVALID_PROVENANCE_ACCEPTANCE:observationBinding");
  if (needsTrace !== (traceId !== null)) throw new Error("INVALID_PROVENANCE_ACCEPTANCE:traceBinding");
  if (scenario === "transformation_robustness" && expectedLabel !== "marked_positive") {
    throw new Error("INVALID_PROVENANCE_ACCEPTANCE:transformationLabel");
  }
  if (["unmarked_control", "false_positive", "forged_label", "forged_metadata", "invalid_signature", "unknown_key"].includes(scenario)
    && expectedLabel !== "unmarked_control") {
    throw new Error("INVALID_PROVENANCE_ACCEPTANCE:negativeLabel");
  }
  return {
    schemaVersion: "provenance-acceptance-case.v1",
    caseId: text(root.caseId, "caseId", 240),
    schemeId,
    profileId,
    scenario,
    observationRecordId,
    traceId,
    expectedLabel: expectedLabel as ProvenanceEvaluationLabel | null,
    expectedTransformationCategory: expectedTransformationCategory as ProvenanceTransformationCategory | null,
  };
}

export function parseProvenanceAcceptanceTrace(value: unknown): ProvenanceAcceptanceTrace {
  const root = object(value, "trace");
  exactKeys(root, [
    "schemaVersion", "traceId", "caseId", "schemeId", "directEvidenceCompleteBeforeModel", "collectorCompletionOrder",
    "directEvidenceBarrierOrder", "modelInvocationOrder", "shortCircuitAuthorized", "modelInvoked", "lateAuthoritativeWritesRejected",
  ], "trace");
  if (root.schemaVersion !== "provenance-acceptance-trace.v1") throw new Error("INVALID_PROVENANCE_ACCEPTANCE_TRACE:schemaVersion");
  const collectorCompletionOrder = root.collectorCompletionOrder;
  if (!Array.isArray(collectorCompletionOrder) || collectorCompletionOrder.length === 0 || collectorCompletionOrder.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("INVALID_PROVENANCE_ACCEPTANCE_TRACE:collectorCompletionOrder");
  }
  const directEvidenceBarrierOrder = root.directEvidenceBarrierOrder;
  if (!Number.isInteger(directEvidenceBarrierOrder) || (directEvidenceBarrierOrder as number) < 0) throw new Error("INVALID_PROVENANCE_ACCEPTANCE_TRACE:barrierOrder");
  const modelInvocationOrder = root.modelInvocationOrder;
  if (modelInvocationOrder !== null && (!Number.isInteger(modelInvocationOrder) || (modelInvocationOrder as number) < 0)) {
    throw new Error("INVALID_PROVENANCE_ACCEPTANCE_TRACE:modelOrder");
  }
  for (const field of ["directEvidenceCompleteBeforeModel", "shortCircuitAuthorized", "modelInvoked", "lateAuthoritativeWritesRejected"] as const) {
    if (typeof root[field] !== "boolean") throw new Error(`INVALID_PROVENANCE_ACCEPTANCE_TRACE:${field}`);
  }
  return {
    schemaVersion: "provenance-acceptance-trace.v1",
    traceId: text(root.traceId, "traceId"),
    caseId: text(root.caseId, "caseId"),
    schemeId: text(root.schemeId, "schemeId", 160),
    directEvidenceCompleteBeforeModel: root.directEvidenceCompleteBeforeModel as boolean,
    collectorCompletionOrder: (collectorCompletionOrder as string[]).map((item) => item.trim()),
    directEvidenceBarrierOrder: directEvidenceBarrierOrder as number,
    modelInvocationOrder: modelInvocationOrder as number | null,
    shortCircuitAuthorized: root.shortCircuitAuthorized as boolean,
    modelInvoked: root.modelInvoked as boolean,
    lateAuthoritativeWritesRejected: root.lateAuthoritativeWritesRejected as boolean,
  };
}

function requiredSchemes(): string[] {
  return loadProvenanceRegistry().schemes
    .filter((scheme) => ["candidate_after_gate", "eligible"].includes(scheme.shortCircuit.policy))
    .map((scheme) => scheme.id)
    .sort();
}

function failure(item: ProvenanceAcceptanceCase, reason: string): ProvenanceAcceptanceFailure {
  return { caseId: item.caseId, schemeId: item.schemeId, scenario: item.scenario, reason };
}

export function evaluateProvenanceAcceptance(
  rawCases: readonly ProvenanceAcceptanceCase[],
  rawObservations: readonly ProvenanceSchemeObservation[] = [],
  rawTraces: readonly ProvenanceAcceptanceTrace[] = [],
): ProvenanceAcceptanceReport {
  const cases = rawCases.map(parseProvenanceAcceptanceCase);
  const observations = rawObservations.map((item) => item);
  const traces = rawTraces.map(parseProvenanceAcceptanceTrace);
  const failures: ProvenanceAcceptanceFailure[] = [];
  const required = requiredSchemes();
  const seenCaseIds = new Set<string>();
  for (const item of cases) {
    if (seenCaseIds.has(item.caseId)) {
      failures.push(failure(item, "duplicate_case_id"));
      continue;
    }
    seenCaseIds.add(item.caseId);
    if (!required.includes(item.schemeId)) failures.push(failure(item, "scheme_not_short_circuit_candidate"));
    if (item.observationRecordId) {
      const observation = observations.find((candidate) => candidate.recordId === item.observationRecordId);
      if (!observation) failures.push(failure(item, "observation_missing"));
      else {
        if (observation.schemeId !== item.schemeId || observation.profileId !== item.profileId) failures.push(failure(item, "observation_scheme_profile_mismatch"));
        if (item.expectedLabel !== null && observation.label !== item.expectedLabel) failures.push(failure(item, "observation_label_mismatch"));
        if (item.expectedTransformationCategory !== null && observation.transformationCategory !== item.expectedTransformationCategory) failures.push(failure(item, "observation_transformation_mismatch"));
        if (item.scenario === "transformation_robustness") {
          if (observation.detection.outcome !== "positive" || observation.detection.positive !== true) failures.push(failure(item, "marked_transformation_not_detected"));
        } else if (observation.detection.outcome !== "negative" || observation.detection.positive !== false) {
          failures.push(failure(item, "negative_control_not_explicitly_negative"));
        }
      }
    }
    if (item.traceId) {
      const trace = traces.find((candidate) => candidate.traceId === item.traceId);
      if (!trace) failures.push(failure(item, "trace_missing"));
      else {
        if (trace.caseId !== item.caseId || trace.schemeId !== item.schemeId) failures.push(failure(item, "trace_binding_mismatch"));
        if (item.scenario === "completion_order") {
          if (!trace.directEvidenceCompleteBeforeModel) failures.push(failure(item, "model_started_before_direct_evidence_barrier"));
          if (trace.modelInvocationOrder !== null && trace.modelInvocationOrder < trace.directEvidenceBarrierOrder) failures.push(failure(item, "model_order_before_barrier"));
          if (trace.collectorCompletionOrder.length === 0) failures.push(failure(item, "completion_order_missing"));
        } else if (item.scenario === "early_exit") {
          if (!trace.shortCircuitAuthorized) failures.push(failure(item, "early_exit_without_authorization"));
          if (trace.modelInvoked) failures.push(failure(item, "model_invoked_after_early_exit"));
          if (!trace.lateAuthoritativeWritesRejected) failures.push(failure(item, "late_authoritative_write_not_rejected"));
        }
      }
    }
  }
  const coverage = new Set(cases.map((item) => `${item.schemeId}\u0000${item.scenario}`));
  for (const schemeId of required) {
    for (const scenario of PROVENANCE_ACCEPTANCE_SCENARIOS) {
      if (!coverage.has(`${schemeId}\u0000${scenario}`)) {
        failures.push({ caseId: `coverage:${schemeId}:${scenario}`, schemeId, scenario, reason: "scenario_missing" });
      }
    }
  }
  const caseFailureIds = new Set(failures.map((item) => item.caseId));
  return {
    schemaVersion: "provenance-acceptance-report.v1",
    evaluatorVersion: "provenance-acceptance-evaluator.v1",
    requiredSchemes: required,
    requiredScenarios: [...PROVENANCE_ACCEPTANCE_SCENARIOS],
    cases: cases.length,
    traces: traces.length,
    passedCases: cases.filter((item) => !caseFailureIds.has(item.caseId)).length,
    failedCases: cases.filter((item) => caseFailureIds.has(item.caseId)).length,
    coverageComplete: required.every((schemeId) => PROVENANCE_ACCEPTANCE_SCENARIOS.every((scenario) => coverage.has(`${schemeId}\u0000${scenario}`))),
    acceptancePassed: failures.length === 0,
    productionEvidenceEligible: false,
    shortCircuitEligible: false,
    failures,
  };
}
