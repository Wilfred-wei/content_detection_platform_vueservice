import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { EvidenceRecord } from "./analysis-types.js";
import {
  evaluateProvenanceReleaseGate,
  loadProvenanceReleaseGateRegistry,
  validateProvenanceReleaseGateRegistry,
  type ProvenanceReleaseGateEvaluation,
  type ProvenanceReleaseGateRegistry,
} from "./provenance-release-gates.js";
import { isAllowlistedAdapterId } from "./watermark-adapter-ids.js";

export type ProvenanceFamily =
  | "authenticated_provenance"
  | "regulatory_metadata"
  | "open_watermark"
  | "research_watermark"
  | "research_toolkit"
  | "visible_mark"
  | "closed_vendor_verifier"
  | "commercial_vendor_api";

export type AccessClass =
  | "local_open_source"
  | "local_standard_parser"
  | "research_only"
  | "manual_public_verifier"
  | "manual_limited_verifier"
  | "authenticated_commercial_api"
  | "vendor_assisted";

export type RuntimeEligibility = "planned_local" | "evaluation_only" | "unavailable" | "disabled_policy";

export interface WatermarkDetectorProfile {
  id: string;
  settings: Record<string, string | number | boolean>;
}

export interface DetectorExecution {
  adapterId: string | null;
  protocolVersion: string;
  transport: "in_process" | "process" | "none";
  timeoutMs: number;
  artifacts: Array<{
    id: string;
    kind: "payload" | "model" | "dependency_lock" | "configuration";
    sha256: string | null;
  }>;
  profiles: WatermarkDetectorProfile[];
}

export interface ProductionEligibility {
  status: "approved" | "candidate" | "prohibited";
  reason: string;
}

export interface ProvenanceScheme {
  id: string;
  name: string;
  family: ProvenanceFamily;
  compatibility: string[];
  primarySources: string[];
  license: string;
  accessClass: AccessClass;
  requiredKeysOrModels: string[];
  supportedProducts: string[];
  runtimeEligibility: RuntimeEligibility;
  productionEligibility: ProductionEligibility;
  execution: DetectorExecution;
  calibration: { status: "required" | "approved" | "not_applicable"; artifact: string | null };
  sampleSource: string;
  owner: string;
  lastVerifiedAt: string;
  shortCircuit: {
    policy: "prohibited" | "candidate_after_gate" | "eligible";
    gateId?: string | null;
    reason: string;
  };
}

export interface ProvenanceRegistry {
  schemaVersion: string;
  registryVersion: string;
  researchedAt: string;
  policy: {
    commercialApisAllowed: boolean;
    manualVerifierResultsAreProductionEvidence: boolean;
    absenceIsNeutral: boolean;
    shortCircuitRequiresApprovedCalibration: boolean;
    commercialUseRequired: boolean;
  };
  schemes: ProvenanceScheme[];
}

const REGISTRY_PATH = fileURLToPath(new URL("../resources/provenance-schemes.v1.json", import.meta.url));

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`INVALID_PROVENANCE_REGISTRY:${field}`);
  }
}

export function validateProvenanceRegistry(
  value: unknown,
  releaseGates: ProvenanceReleaseGateRegistry = loadProvenanceReleaseGateRegistry(),
): asserts value is ProvenanceRegistry {
  validateProvenanceReleaseGateRegistry(releaseGates);
  if (!value || typeof value !== "object") throw new Error("INVALID_PROVENANCE_REGISTRY:root");
  const registry = value as Partial<ProvenanceRegistry>;
  if (!registry.schemaVersion || !registry.registryVersion || !registry.researchedAt || !registry.policy || !Array.isArray(registry.schemes)) {
    throw new Error("INVALID_PROVENANCE_REGISTRY:header");
  }
  if (registry.policy.commercialUseRequired !== true) {
    throw new Error("INVALID_PROVENANCE_REGISTRY:commercialUsePolicy");
  }
  if (releaseGates.provenanceRegistryVersion !== registry.registryVersion) {
    throw new Error("INVALID_PROVENANCE_REGISTRY:releaseGateRegistryVersion");
  }

  const ids = new Set<string>();
  for (const scheme of registry.schemes) {
    if (!scheme.id || ids.has(scheme.id)) throw new Error(`INVALID_PROVENANCE_REGISTRY:duplicate:${scheme.id}`);
    ids.add(scheme.id);
    assertStringArray(scheme.compatibility, `${scheme.id}:compatibility`);
    assertStringArray(scheme.primarySources, `${scheme.id}:primarySources`);
    assertStringArray(scheme.requiredKeysOrModels, `${scheme.id}:requiredKeysOrModels`);
    assertStringArray(scheme.supportedProducts, `${scheme.id}:supportedProducts`);
    if (scheme.primarySources.some((source) => !source.startsWith("https://"))) {
      throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:primarySourceProtocol`);
    }
    if (!scheme.license || !scheme.sampleSource || !scheme.owner || !/^\d{4}-\d{2}-\d{2}$/.test(scheme.lastVerifiedAt)) {
      throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:governance`);
    }
    if (!scheme.productionEligibility?.reason || !["approved", "candidate", "prohibited"].includes(scheme.productionEligibility.status)) {
      throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:productionEligibility`);
    }
    if (
      !scheme.execution
      || !["in_process", "process", "none"].includes(scheme.execution.transport)
      || !scheme.execution.protocolVersion
      || !Number.isInteger(scheme.execution.timeoutMs)
      || scheme.execution.timeoutMs < 1
      || !Array.isArray(scheme.execution.artifacts)
      || !Array.isArray(scheme.execution.profiles)
    ) {
      throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:execution`);
    }
    if (scheme.execution.adapterId !== null && (!scheme.execution.adapterId.trim() || !isAllowlistedAdapterId(scheme.execution.adapterId))) {
      throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:unknownAdapter`);
    }
    if ((scheme.execution.transport === "none") !== (scheme.execution.adapterId === null)) {
      throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:adapterTransport`);
    }
    if (scheme.productionEligibility.status === "approved") {
      if (!scheme.execution.adapterId) {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:unknownAdapter`);
      }
      if (scheme.execution.artifacts.some((artifact) => artifact.sha256 === null || !/^[a-f0-9]{64}$/.test(artifact.sha256))) {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:artifactDigest`);
      }
    }
    const artifactIds = new Set<string>();
    for (const artifact of scheme.execution.artifacts) {
      if (!artifact.id || artifactIds.has(artifact.id)) {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:artifact`);
      }
      artifactIds.add(artifact.id);
    }
    const profileIds = new Set<string>();
    for (const profile of scheme.execution.profiles) {
      if (
        !profile.id
        || profileIds.has(profile.id)
        || !profile.settings
        || typeof profile.settings !== "object"
        || Array.isArray(profile.settings)
        || Object.values(profile.settings).some((setting) => !["string", "number", "boolean"].includes(typeof setting))
      ) {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:profile`);
      }
      profileIds.add(profile.id);
    }
    if (["candidate_after_gate", "eligible"].includes(scheme.shortCircuit.policy)) {
      if (!scheme.shortCircuit.gateId?.trim()) {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:releaseGateMissing`);
      }
      const gate = releaseGates.gates.find((candidate) => candidate.id === scheme.shortCircuit.gateId);
      if (!gate || gate.schemeId !== scheme.id) {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:releaseGateMismatch`);
      }
    }
    if (scheme.shortCircuit.policy === "eligible") {
      if (scheme.calibration.status !== "approved") {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:uncalibratedShortCircuit`);
      }
      if (
        scheme.runtimeEligibility !== "planned_local"
        || scheme.productionEligibility.status !== "approved"
        || !scheme.execution.adapterId
      ) {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:ineligibleShortCircuitRuntime`);
      }
      const evaluation = evaluateProvenanceReleaseGate(scheme, registry.registryVersion, releaseGates);
      if (!evaluation.passed) {
        throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:shortCircuitReleaseGate:${evaluation.reasons.join(",")}`);
      }
    }
    if (["manual_public_verifier", "manual_limited_verifier", "vendor_assisted"].includes(scheme.accessClass)
      && scheme.runtimeEligibility !== "unavailable") {
      throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:closedVerifierRuntime`);
    }
    if (scheme.accessClass === "authenticated_commercial_api" && !["disabled_policy", "unavailable"].includes(scheme.runtimeEligibility)) {
      throw new Error(`INVALID_PROVENANCE_REGISTRY:${scheme.id}:commercialRuntime`);
    }
  }
}

let cachedRegistry: ProvenanceRegistry | undefined;

export function loadProvenanceRegistry(): ProvenanceRegistry {
  if (cachedRegistry) return cachedRegistry;
  const parsed: unknown = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  validateProvenanceRegistry(parsed);
  cachedRegistry = parsed;
  return cachedRegistry;
}

export function getProvenanceScheme(id: string): ProvenanceScheme | undefined {
  return loadProvenanceRegistry().schemes.find((scheme) => scheme.id === id);
}

export function getProductionRunnableSchemes(): ProvenanceScheme[] {
  return loadProvenanceRegistry().schemes.filter((scheme) =>
    scheme.runtimeEligibility === "planned_local"
    && scheme.productionEligibility.status === "approved"
    && ["local_open_source", "local_standard_parser"].includes(scheme.accessClass),
  );
}

export interface ProvenanceShortCircuitDecision extends ProvenanceReleaseGateEvaluation {
  schemeId: string;
  eligible: boolean;
}

export type ProvenanceShortCircuitResolver = (schemeId: string) => ProvenanceShortCircuitDecision;

export function resolveProvenanceShortCircuit(
  schemeId: string,
  registry: ProvenanceRegistry = loadProvenanceRegistry(),
  releaseGates: ProvenanceReleaseGateRegistry = loadProvenanceReleaseGateRegistry(),
): ProvenanceShortCircuitDecision {
  const scheme = registry.schemes.find((candidate) => candidate.id === schemeId);
  if (!scheme) {
    return {
      schemeId,
      gateId: null,
      gateRegistryVersion: releaseGates.gateRegistryVersion,
      passed: false,
      eligible: false,
      reasons: ["scheme_not_registered"],
    };
  }
  const evaluation = evaluateProvenanceReleaseGate(scheme, registry.registryVersion, releaseGates);
  const reasons = [...evaluation.reasons];
  if (scheme.shortCircuit.policy !== "eligible") reasons.push(`short_circuit_policy_${scheme.shortCircuit.policy}`);
  if (scheme.runtimeEligibility !== "planned_local") reasons.push("runtime_not_production_local");
  if (scheme.productionEligibility.status !== "approved") reasons.push("production_eligibility_not_approved");
  if (!scheme.execution.adapterId) reasons.push("adapter_not_registered");
  return {
    ...evaluation,
    schemeId,
    eligible: evaluation.passed && reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}

export function applyProvenanceShortCircuitGate(
  record: EvidenceRecord,
  resolver: ProvenanceShortCircuitResolver = resolveProvenanceShortCircuit,
): EvidenceRecord {
  if (!["provenance", "watermark"].includes(record.category)) return record;
  const schemeId = typeof record.facts.schemeId === "string" ? record.facts.schemeId : record.source;
  const decision = resolver(schemeId);
  const wouldBeStrongVerified = record.status === "verified_present"
    && record.strength === "strong"
    && record.facts.provenanceVerified === true;
  return {
    ...record,
    strength: wouldBeStrongVerified && !decision.eligible ? "supporting" : record.strength,
    summary: wouldBeStrongVerified && !decision.eligible
      ? `${record.summary} 当前逐方案生产准入门槛未通过，不能触发来源短路。`
      : record.summary,
    facts: {
      ...record.facts,
      shortCircuitSchemeEligible: decision.eligible,
      shortCircuitAuthorized: wouldBeStrongVerified && decision.eligible,
      releaseGateId: decision.gateId,
      releaseGateRegistryVersion: decision.gateRegistryVersion,
      releaseGateReasons: JSON.stringify(decision.reasons),
    },
  };
}
