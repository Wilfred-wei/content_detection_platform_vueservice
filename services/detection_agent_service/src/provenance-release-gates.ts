import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ProvenanceScheme } from "./provenance-registry.js";

export type ReleaseGateCriterionStatus = "not_evaluated" | "passed" | "failed";
export type ReleaseGateDecision = "incomplete" | "approved" | "rejected";

interface ReleaseGateCriterion {
  status: ReleaseGateCriterionStatus;
  artifactSha256: string | null;
}

export interface ProvenanceReleaseGate {
  id: string;
  schemeId: string;
  decision: ReleaseGateDecision;
  registryVersion: string;
  schemeIdentitySha256: string | null;
  evaluatedAt: string | null;
  datasetManifestSha256: string | null;
  evaluatorSha256: string | null;
  falsePositive: ReleaseGateCriterion & {
    unmarkedControls: number;
    falsePositives: number;
  };
  calibration: ReleaseGateCriterion & {
    profileIds: string[];
    completeMultiViewProcedure: boolean;
  };
  compatibility: ReleaseGateCriterion & {
    declaredScopeSha256: string | null;
  };
  robustness: ReleaseGateCriterion & {
    coveredTransformations: string[];
    correctCases: number;
    totalCases: number;
  };
}

export interface ProvenanceReleaseGateRegistry {
  schemaVersion: "provenance-release-gates.v1";
  gateRegistryVersion: string;
  provenanceRegistryVersion: string;
  policy: {
    minimumUnmarkedControls: number;
    maximumFalsePositiveRate: number;
    maximumWilsonUpperBound95: number;
    minimumRobustnessCorrectness: number;
    requiredTransformations: string[];
  };
  gates: ProvenanceReleaseGate[];
}

export interface ProvenanceReleaseGateEvaluation {
  gateId: string | null;
  gateRegistryVersion: string;
  passed: boolean;
  reasons: string[];
}

const RELEASE_GATE_PATH = fileURLToPath(new URL("../resources/provenance-release-gates.v1.json", import.meta.url));
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const POLICY_FLOORS = Object.freeze({
  minimumUnmarkedControls: 10_000,
  maximumFalsePositiveRate: 0.001,
  maximumWilsonUpperBound95: 0.001,
  minimumRobustnessCorrectness: 0.9,
  requiredTransformations: Object.freeze([
    "original",
    "resize",
    "recompression",
    "crop",
    "screenshot",
    "blur",
    "color_edit",
    "overlay",
    "metadata_removal",
    "forged_label",
    "forged_metadata",
    "adversarial",
  ]),
});

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isRatio(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function assertUniqueStrings(value: unknown, field: string, allowEmpty = false): asserts value is string[] {
  if (
    !Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.some((item) => typeof item !== "string" || !item.trim())
    || new Set(value).size !== value.length
  ) {
    throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${field}`);
  }
}

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

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export function provenanceSchemeIdentitySha256(scheme: ProvenanceScheme): string {
  const { shortCircuit: _shortCircuit, ...identity } = scheme;
  return digest(identity);
}

export function provenanceCompatibilityScopeSha256(scheme: ProvenanceScheme): string {
  return digest({
    compatibility: scheme.compatibility,
    supportedProducts: scheme.supportedProducts,
    profileIds: scheme.execution.profiles.map((profile) => profile.id),
  });
}

export function wilsonUpperBound95(positiveCount: number, sampleCount: number): number {
  if (!Number.isInteger(positiveCount) || !Number.isInteger(sampleCount) || positiveCount < 0 || sampleCount < 1 || positiveCount > sampleCount) {
    return Number.NaN;
  }
  const z = 1.959963984540054;
  const proportion = positiveCount / sampleCount;
  const denominator = 1 + (z * z) / sampleCount;
  const center = proportion + (z * z) / (2 * sampleCount);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * sampleCount)) / sampleCount);
  return (center + margin) / denominator;
}

export function validateProvenanceReleaseGateRegistry(value: unknown): asserts value is ProvenanceReleaseGateRegistry {
  if (!value || typeof value !== "object") throw new Error("INVALID_PROVENANCE_RELEASE_GATES:root");
  const registry = value as Partial<ProvenanceReleaseGateRegistry>;
  if (
    registry.schemaVersion !== "provenance-release-gates.v1"
    || !registry.gateRegistryVersion
    || !registry.provenanceRegistryVersion
    || !registry.policy
    || !Array.isArray(registry.gates)
  ) {
    throw new Error("INVALID_PROVENANCE_RELEASE_GATES:header");
  }
  const policy = registry.policy;
  if (
    !Number.isInteger(policy.minimumUnmarkedControls)
    || policy.minimumUnmarkedControls < POLICY_FLOORS.minimumUnmarkedControls
    || !isRatio(policy.maximumFalsePositiveRate)
    || policy.maximumFalsePositiveRate > POLICY_FLOORS.maximumFalsePositiveRate
    || !isRatio(policy.maximumWilsonUpperBound95)
    || policy.maximumWilsonUpperBound95 < policy.maximumFalsePositiveRate
    || policy.maximumWilsonUpperBound95 > POLICY_FLOORS.maximumWilsonUpperBound95
    || !isRatio(policy.minimumRobustnessCorrectness)
    || policy.minimumRobustnessCorrectness < POLICY_FLOORS.minimumRobustnessCorrectness
  ) {
    throw new Error("INVALID_PROVENANCE_RELEASE_GATES:policy");
  }
  assertUniqueStrings(policy.requiredTransformations, "policy:requiredTransformations");
  if (!POLICY_FLOORS.requiredTransformations.every((item) => policy.requiredTransformations.includes(item))) {
    throw new Error("INVALID_PROVENANCE_RELEASE_GATES:policy:requiredTransformations");
  }

  const ids = new Set<string>();
  const schemeIds = new Set<string>();
  for (const gate of registry.gates) {
    if (!gate.id || ids.has(gate.id) || !gate.schemeId || schemeIds.has(gate.schemeId)) {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:duplicate:${gate.id || gate.schemeId}`);
    }
    ids.add(gate.id);
    schemeIds.add(gate.schemeId);
    if (!(["incomplete", "approved", "rejected"] as const).includes(gate.decision)) {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:decision`);
    }
    if (!gate.registryVersion || (gate.evaluatedAt !== null && !/^\d{4}-\d{2}-\d{2}T/.test(gate.evaluatedAt))) {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:identity`);
    }
    if (gate.registryVersion !== registry.provenanceRegistryVersion) {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:registryVersion`);
    }
    for (const [field, value] of [
      ["schemeIdentitySha256", gate.schemeIdentitySha256],
      ["datasetManifestSha256", gate.datasetManifestSha256],
      ["evaluatorSha256", gate.evaluatorSha256],
    ] as const) {
      if (value !== null && !isSha256(value)) throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:${field}`);
    }
    const criteria: Array<[string, ReleaseGateCriterion]> = [
      ["falsePositive", gate.falsePositive],
      ["calibration", gate.calibration],
      ["compatibility", gate.compatibility],
      ["robustness", gate.robustness],
    ];
    for (const [field, criterion] of criteria) {
      if (!criterion || !(["not_evaluated", "passed", "failed"] as const).includes(criterion.status)) {
        throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:${field}:status`);
      }
      if (criterion.artifactSha256 !== null && !isSha256(criterion.artifactSha256)) {
        throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:${field}:artifactSha256`);
      }
    }
    if (
      !isNonNegativeInteger(gate.falsePositive.unmarkedControls)
      || !isNonNegativeInteger(gate.falsePositive.falsePositives)
      || gate.falsePositive.falsePositives > gate.falsePositive.unmarkedControls
    ) {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:falsePositive:counts`);
    }
    assertUniqueStrings(gate.calibration.profileIds, `${gate.id}:calibration:profileIds`, true);
    if (typeof gate.calibration.completeMultiViewProcedure !== "boolean") {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:calibration:multiView`);
    }
    if (gate.compatibility.declaredScopeSha256 !== null && !isSha256(gate.compatibility.declaredScopeSha256)) {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:compatibility:declaredScopeSha256`);
    }
    assertUniqueStrings(gate.robustness.coveredTransformations, `${gate.id}:robustness:coveredTransformations`, true);
    if (
      !isNonNegativeInteger(gate.robustness.correctCases)
      || !isNonNegativeInteger(gate.robustness.totalCases)
      || gate.robustness.correctCases > gate.robustness.totalCases
    ) {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:robustness:counts`);
    }
    if (
      gate.decision === "approved"
      && (
        !gate.evaluatedAt
        || !isSha256(gate.schemeIdentitySha256)
        || !isSha256(gate.datasetManifestSha256)
        || !isSha256(gate.evaluatorSha256)
        || criteria.some(([, criterion]) => criterion.status !== "passed" || !isSha256(criterion.artifactSha256))
      )
    ) {
      throw new Error(`INVALID_PROVENANCE_RELEASE_GATES:${gate.id}:approvedEvidence`);
    }
  }
}

let cachedReleaseGates: ProvenanceReleaseGateRegistry | undefined;

export function loadProvenanceReleaseGateRegistry(): ProvenanceReleaseGateRegistry {
  if (cachedReleaseGates) return cachedReleaseGates;
  const parsed: unknown = JSON.parse(readFileSync(RELEASE_GATE_PATH, "utf8"));
  validateProvenanceReleaseGateRegistry(parsed);
  cachedReleaseGates = parsed;
  return cachedReleaseGates;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.length === rightSorted.length && leftSorted.every((value, index) => value === rightSorted[index]);
}

export function evaluateProvenanceReleaseGate(
  scheme: ProvenanceScheme,
  provenanceRegistryVersion: string,
  gateRegistry: ProvenanceReleaseGateRegistry = loadProvenanceReleaseGateRegistry(),
): ProvenanceReleaseGateEvaluation {
  const gateId = scheme.shortCircuit.gateId || null;
  const reasons: string[] = [];
  const gate = gateId ? gateRegistry.gates.find((candidate) => candidate.id === gateId) : undefined;
  if (!gate) {
    reasons.push("release_gate_missing");
    return { gateId, gateRegistryVersion: gateRegistry.gateRegistryVersion, passed: false, reasons };
  }
  if (gate.schemeId !== scheme.id) reasons.push("release_gate_scheme_mismatch");
  if (gate.registryVersion !== provenanceRegistryVersion || gateRegistry.provenanceRegistryVersion !== provenanceRegistryVersion) {
    reasons.push("release_gate_registry_version_mismatch");
  }
  if (gate.decision !== "approved") reasons.push(`release_gate_${gate.decision}`);
  if (gate.schemeIdentitySha256 !== provenanceSchemeIdentitySha256(scheme)) reasons.push("release_gate_scheme_identity_mismatch");
  if (!gate.evaluatedAt || !isSha256(gate.datasetManifestSha256) || !isSha256(gate.evaluatorSha256)) {
    reasons.push("release_gate_audit_identity_missing");
  }

  const policy = gateRegistry.policy;
  const falsePositiveRate = gate.falsePositive.unmarkedControls > 0
    ? gate.falsePositive.falsePositives / gate.falsePositive.unmarkedControls
    : Number.POSITIVE_INFINITY;
  const falsePositiveUpper = wilsonUpperBound95(gate.falsePositive.falsePositives, gate.falsePositive.unmarkedControls);
  if (
    gate.falsePositive.status !== "passed"
    || !isSha256(gate.falsePositive.artifactSha256)
    || gate.falsePositive.unmarkedControls < policy.minimumUnmarkedControls
    || falsePositiveRate > policy.maximumFalsePositiveRate
    || !Number.isFinite(falsePositiveUpper)
    || falsePositiveUpper > policy.maximumWilsonUpperBound95
  ) {
    reasons.push("false_positive_gate_failed");
  }

  const profileIds = scheme.execution.profiles.map((profile) => profile.id);
  if (
    gate.calibration.status !== "passed"
    || !isSha256(gate.calibration.artifactSha256)
    || scheme.calibration.status !== "approved"
    || scheme.calibration.artifact !== gate.calibration.artifactSha256
    || !sameStrings(gate.calibration.profileIds, profileIds)
    || gate.calibration.completeMultiViewProcedure !== true
  ) {
    reasons.push("calibration_gate_failed");
  }

  if (
    gate.compatibility.status !== "passed"
    || !isSha256(gate.compatibility.artifactSha256)
    || gate.compatibility.declaredScopeSha256 !== provenanceCompatibilityScopeSha256(scheme)
  ) {
    reasons.push("compatibility_gate_failed");
  }

  const robustnessCorrectness = gate.robustness.totalCases > 0
    ? gate.robustness.correctCases / gate.robustness.totalCases
    : 0;
  if (
    gate.robustness.status !== "passed"
    || !isSha256(gate.robustness.artifactSha256)
    || !policy.requiredTransformations.every((transformation) => gate.robustness.coveredTransformations.includes(transformation))
    || robustnessCorrectness < policy.minimumRobustnessCorrectness
  ) {
    reasons.push("robustness_gate_failed");
  }

  return {
    gateId,
    gateRegistryVersion: gateRegistry.gateRegistryVersion,
    passed: reasons.length === 0,
    reasons,
  };
}
