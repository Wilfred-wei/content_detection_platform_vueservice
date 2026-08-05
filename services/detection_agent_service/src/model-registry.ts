import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type ModelReleaseStatus = "inference_released" | "paper_only";
export type ModelRuntimeEligibility = "provisional_supporting" | "experimental_supporting" | "evaluation_only" | "unavailable";
export type ArtifactAvailability = "available_local" | "available_remote" | "operator_supplied" | "not_released";
export type LicenseStatus = "verified" | "custom_terms" | "unverified" | "not_released";

export interface ModelArtifactRegistration {
  id: string;
  kind: "checkpoint" | "memory_bank" | "backbone" | "source" | "dependency_lock";
  availability: ArtifactAvailability;
  source: string;
  sha256: string | null;
  licenseStatus: LicenseStatus;
}

export interface ModelCandidateRegistration {
  id: string;
  name: string;
  modelVersion: string;
  paper: { title: string; url: string; submittedAt: string };
  sourceRepository: string;
  sourceRevision: string;
  releaseStatus: ModelReleaseStatus;
  trainingDomains: string[];
  signalFamily: string;
  preprocessing: { id: string; steps: string[] };
  runtime: {
    costClass: "high" | "very_high";
    deviceClass: string;
    admission: "single_slot_bounded_queue" | "bounded_microbatch_queue" | "not_configured" | "unknown";
    adapterId: string | null;
    protocolVersion: string;
    transport: "process" | "none";
  };
  outputSchema: {
    scoreSemantics: string;
    thresholdSemantics: string;
    localization: "none" | "not_released";
  };
  artifacts: ModelArtifactRegistration[];
  license: {
    code: string;
    codeStatus: LicenseStatus;
    weights: string;
    weightsStatus: LicenseStatus;
    backbone: string;
    backboneStatus: LicenseStatus;
    commercialUse: "candidate_with_review" | "blocked";
  };
  calibration: {
    status: "deployment_calibrated" | "official_threshold_unverified_for_deployment" | "experimental_threshold_unverified_for_deployment" | "unavailable";
    artifact: string | null;
  };
  runtimeEligibility: ModelRuntimeEligibility;
  productionEligibility: { status: "candidate" | "blocked"; reason: string };
  lastVerifiedAt: string;
  notes: string[];
}

export interface ModelCandidateRegistry {
  schemaVersion: string;
  registryVersion: string;
  researchedAt: string;
  policy: {
    commercialUseRequired: boolean;
    unlicensedArtifactsRunnable: boolean;
    unlicensedExperimentalArtifactsRunnable: boolean;
    unreleasedArtifactsRunnable: boolean;
    uncalibratedModelsAuthoritative: boolean;
  };
  candidates: ModelCandidateRegistration[];
}

const REGISTRY_PATH = fileURLToPath(new URL("../resources/model-candidates.v1.json", import.meta.url));
const ALLOWLISTED_ADAPTER_IDS = new Set([
  "dda-dinov2-lora-v1",
  "mirror-dinov3-hplus-v1",
  "safe-wavelet-resnet-v1",
]);

function assertStrings(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`INVALID_MODEL_REGISTRY:${field}`);
  }
}

export function validateModelCandidateRegistry(value: unknown): asserts value is ModelCandidateRegistry {
  if (!value || typeof value !== "object") throw new Error("INVALID_MODEL_REGISTRY:root");
  const registry = value as Partial<ModelCandidateRegistry>;
  if (!registry.schemaVersion || !registry.registryVersion || !/^\d{4}-\d{2}-\d{2}$/.test(registry.researchedAt || "")
    || !registry.policy || !Array.isArray(registry.candidates)) {
    throw new Error("INVALID_MODEL_REGISTRY:header");
  }
  if (registry.policy.commercialUseRequired !== true
    || registry.policy.unlicensedArtifactsRunnable !== false
    || registry.policy.unlicensedExperimentalArtifactsRunnable !== true
    || registry.policy.unreleasedArtifactsRunnable !== false
    || registry.policy.uncalibratedModelsAuthoritative !== false) {
    throw new Error("INVALID_MODEL_REGISTRY:policy");
  }

  const ids = new Set<string>();
  for (const candidate of registry.candidates) {
    if (!candidate.id || ids.has(candidate.id)) throw new Error(`INVALID_MODEL_REGISTRY:duplicate:${candidate.id}`);
    ids.add(candidate.id);
    if (!candidate.name || !candidate.modelVersion || !candidate.paper?.title
      || !candidate.paper.url.startsWith("https://") || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.paper.submittedAt)
      || !candidate.sourceRepository.startsWith("https://") || !/^[a-f0-9]{40}$/.test(candidate.sourceRevision)
      || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.lastVerifiedAt)) {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:identity`);
    }
    assertStrings(candidate.trainingDomains, `${candidate.id}:trainingDomains`);
    assertStrings(candidate.preprocessing?.steps, `${candidate.id}:preprocessing`);
    assertStrings(candidate.notes, `${candidate.id}:notes`);
    if (!candidate.preprocessing.id || !candidate.signalFamily || !candidate.runtime?.protocolVersion
      || !candidate.outputSchema?.scoreSemantics || !candidate.outputSchema.thresholdSemantics
      || !candidate.productionEligibility?.reason || !Array.isArray(candidate.artifacts) || candidate.artifacts.length === 0) {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:contract`);
    }
    if ((candidate.runtime.transport === "none") !== (candidate.runtime.adapterId === null)) {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:adapterTransport`);
    }
    if (candidate.runtime.adapterId !== null && !ALLOWLISTED_ADAPTER_IDS.has(candidate.runtime.adapterId)) {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:unknownAdapter`);
    }

    const artifactIds = new Set<string>();
    for (const artifact of candidate.artifacts) {
      if (!artifact.id || artifactIds.has(artifact.id) || !artifact.source
        || (artifact.sha256 !== null && !/^[a-f0-9]{64}$/.test(artifact.sha256))) {
        throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:artifact`);
      }
      artifactIds.add(artifact.id);
    }

    const runnable = candidate.runtimeEligibility === "provisional_supporting";
    const experimental = candidate.runtimeEligibility === "experimental_supporting";
    if (runnable && (!candidate.runtime.adapterId || candidate.releaseStatus !== "inference_released")) {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:unreleasedRuntime`);
    }
    if (runnable && candidate.license.commercialUse === "blocked") {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:licenseBlockedRuntime`);
    }
    if (runnable && candidate.artifacts.some((artifact) => artifact.availability === "not_released"
      || artifact.licenseStatus === "unverified" || artifact.licenseStatus === "not_released")) {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:artifactBlockedRuntime`);
    }
    if (experimental && (!candidate.runtime.adapterId || candidate.releaseStatus !== "inference_released"
      || candidate.productionEligibility.status !== "blocked" || candidate.license.commercialUse !== "blocked"
      || candidate.calibration.status !== "experimental_threshold_unverified_for_deployment")) {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:invalidExperimentalRuntime`);
    }
    if (experimental && candidate.artifacts.some((artifact) => artifact.availability === "not_released"
      || artifact.licenseStatus === "not_released" || artifact.sha256 === null)) {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:experimentalArtifactIdentity`);
    }
    if (candidate.productionEligibility.status === "candidate"
      && candidate.calibration.status !== "official_threshold_unverified_for_deployment") {
      throw new Error(`INVALID_MODEL_REGISTRY:${candidate.id}:candidateCalibration`);
    }
  }
}

let cachedRegistry: ModelCandidateRegistry | undefined;

export function loadModelCandidateRegistry(): ModelCandidateRegistry {
  if (cachedRegistry) return cachedRegistry;
  const parsed: unknown = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  validateModelCandidateRegistry(parsed);
  cachedRegistry = parsed;
  return cachedRegistry;
}

export function getRuntimeEligibleModelCandidates(): ModelCandidateRegistration[] {
  return loadModelCandidateRegistry().candidates.filter((candidate) =>
    ["provisional_supporting", "experimental_supporting"].includes(candidate.runtimeEligibility));
}
