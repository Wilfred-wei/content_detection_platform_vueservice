import type { ModelRuntimeInfo } from "./model-detector.js";
import type { ModelCandidateRegistry } from "./model-registry.js";
import type { PolicyBundle } from "./policy-bundle.js";
import type { ProvenanceRegistry } from "./provenance-registry.js";

export type ReleaseCheckStatus = "passed" | "blocked" | "not_applicable";

export interface ReleaseReadinessCheck {
  id: string;
  status: ReleaseCheckStatus;
  reasons: string[];
}

export interface ReleaseReadinessInput {
  policyBundle: PolicyBundle;
  policyBundleVerified: boolean;
  requireAuth: boolean;
  storageEncryptionConfigured: boolean;
  productionLabelingAuthorized: boolean;
  modelRegistry: ModelCandidateRegistry;
  provenanceRegistry: ProvenanceRegistry;
  modelRuntime: readonly ModelRuntimeInfo[];
  modelDeviceCapacityCount: number;
  explanationEvaluationStatus: string;
  forensicEvaluationStatus: string;
}

export interface ReleaseReadinessReport {
  schemaVersion: "release-readiness.v1";
  generatedAt: string;
  status: "ready" | "blocked";
  productionSwapAuthorized: false;
  automaticPolicyMutation: false;
  checks: ReleaseReadinessCheck[];
}

function check(id: string, status: ReleaseCheckStatus, ...reasons: string[]): ReleaseReadinessCheck {
  return { id, status, reasons };
}

export function assessReleaseReadiness(input: ReleaseReadinessInput, generatedAt = new Date().toISOString()): ReleaseReadinessReport {
  const checks: ReleaseReadinessCheck[] = [];
  checks.push(input.policyBundleVerified && input.policyBundle.productionSwapAuthorized === false && input.policyBundle.automaticPolicyMutation === false
    ? check("policy_bundle_integrity", "passed")
    : check("policy_bundle_integrity", "blocked", "policy_bundle_not_verified_or_authority_changed"));
  checks.push(input.requireAuth && input.storageEncryptionConfigured
    ? check("public_security_configuration", "passed")
    : check("public_security_configuration", "blocked", ...[
      ...(!input.requireAuth ? ["authentication_required"] : []),
      ...(!input.storageEncryptionConfigured ? ["storage_encryption_required"] : []),
    ]));
  checks.push(input.productionLabelingAuthorized
    ? check("production_labeling_authority", "passed")
    : check("production_labeling_authority", "blocked", "operator_promotion_required_after_release_evidence"));

  const primary = input.modelRegistry.candidates.find((candidate) => candidate.id === "dda-dinov2-lora");
  const enabledModels = input.modelRuntime.filter((model) => model.enabled);
  const modelReasons: string[] = [];
  if (!primary) modelReasons.push("primary_candidate_missing");
  else if ((primary.calibration.status as string) !== "deployment_calibrated") modelReasons.push("primary_deployment_calibration_missing");
  if (enabledModels.length === 0) modelReasons.push("no_enabled_model_route");
  if (enabledModels.some((model) => model.resourceClass === "gpu" && model.device !== "unknown" && input.modelDeviceCapacityCount === 0)) {
    modelReasons.push("gpu_capacity_not_declared");
  }
  checks.push(modelReasons.length ? check("model_quality_and_capacity", "blocked", ...modelReasons) : check("model_quality_and_capacity", "passed"));

  const provenanceReasons = input.provenanceRegistry.schemes
    .filter((scheme) => scheme.shortCircuit.policy === "candidate_after_gate")
    .map((scheme) => `${scheme.id}:short_circuit_gate_pending`);
  checks.push(provenanceReasons.length ? check("provenance_short_circuit", "blocked", ...provenanceReasons) : check("provenance_short_circuit", "passed"));

  checks.push(input.explanationEvaluationStatus === "approved"
    ? check("explanation_evaluation", "passed")
    : check("explanation_evaluation", "blocked", "explanation_prompt_or_human_gate_pending"));
  checks.push(input.forensicEvaluationStatus === "approved"
    ? check("forensic_evaluation", "passed")
    : check("forensic_evaluation", "blocked", "forensic_prompt_or_human_gate_pending"));

  const status = checks.every((item) => item.status !== "blocked") ? "ready" : "blocked";
  return {
    schemaVersion: "release-readiness.v1",
    generatedAt,
    status,
    productionSwapAuthorized: false,
    automaticPolicyMutation: false,
    checks,
  };
}
