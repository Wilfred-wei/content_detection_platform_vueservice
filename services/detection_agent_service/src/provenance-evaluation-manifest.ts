import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProvenanceRegistry } from "./provenance-registry.js";
import { loadProvenanceReleaseGateRegistry } from "./provenance-release-gates.js";

export type ProvenanceEvaluationCaseType =
  | "watermark_positive"
  | "authenticated_metadata"
  | "unsigned_metadata"
  | "c2pa_trusted"
  | "c2pa_untrusted"
  | "unmarked_control";

export type EvaluationMaterialization = "bundled_file" | "provisioned_file" | "deterministic_recipe";

export interface ProvenanceEvaluationRecipe {
  recipeId: string;
  implementationPath: string;
  implementationSha256: string;
  parameters: Record<string, string | number | boolean>;
  parametersSha256: string;
}

export interface ProvenanceEvaluationCase {
  id: string;
  caseType: ProvenanceEvaluationCaseType;
  targetSchemeIds: string[];
  asset: {
    materialization: EvaluationMaterialization;
    relativePath: string | null;
    sha256: string;
    sizeBytes: number;
    mimeType: "image/jpeg" | "image/png";
    recipe: ProvenanceEvaluationRecipe | null;
  };
  expected: {
    profileId: string;
    configurationId: string;
    outcome: string;
    evidenceAuthority: "strong" | "supporting" | "neutral";
    testOnlyTrustOrAuthentication: boolean;
  };
  provenance: {
    sourceKind: "official_fixture" | "owned_generated" | "deterministic_recipe";
    sourceUrl: string;
    sourceRevision: string;
    parentAssetSha256: string | null;
  };
  rights: {
    owner: string;
    license: string;
    commercialEvaluationAllowed: true;
    redistributable: boolean;
    evidenceUrl: string;
  };
  notes: string;
}

export interface ProvenanceEvaluationManifest {
  schemaVersion: "provenance-evaluation-manifest.v1";
  manifestVersion: string;
  createdAt: string;
  provenanceRegistryVersion: string;
  releaseGateRegistryVersion: string;
  purpose: "evaluation_only";
  releaseGateEligible: false;
  policy: {
    productionEvidenceEligible: false;
    shortCircuitEligible: false;
    userUploadDerivedAssetsAllowed: false;
    minimumUnmarkedControlsForRelease: number;
  };
  cases: ProvenanceEvaluationCase[];
}

export interface ProvenanceEvaluationManifestSummary {
  schemaVersion: "provenance-evaluation-manifest-summary.v1";
  manifestVersion: string;
  manifestSha256: string;
  cases: number;
  caseTypes: Record<ProvenanceEvaluationCaseType, number>;
  targetSchemes: Record<string, number>;
  materializations: Record<EvaluationMaterialization, number>;
  releaseGateEligible: false;
  releaseGateGap: string;
}

const SERVICE_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const MANIFEST_PATH = resolve(SERVICE_ROOT, "resources/provenance-evaluation-manifest.v1.json");
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CASE_TYPES: readonly ProvenanceEvaluationCaseType[] = [
  "watermark_positive",
  "authenticated_metadata",
  "unsigned_metadata",
  "c2pa_trusted",
  "c2pa_untrusted",
  "unmarked_control",
];
const MATERIALIZATIONS: readonly EvaluationMaterialization[] = [
  "bundled_file",
  "provisioned_file",
  "deterministic_recipe",
];

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${field}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${field}:fields`);
  }
}

function text(value: unknown, field: string, maximum = 500): string {
  if (typeof value !== "string") throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f]/.test(normalized)) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${field}`);
  }
  return normalized;
}

function sha256(value: unknown, field: string): string {
  const normalized = text(value, field, 64).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${field}`);
  return normalized;
}

function httpsUrl(value: unknown, field: string): string {
  const normalized = text(value, field, 1_000);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${field}`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${field}`);
  }
  return parsed.toString();
}

function safeRelativePath(value: unknown, field: string): string {
  const normalized = text(value, field, 300).replaceAll("\\", "/");
  const target = resolve(SERVICE_ROOT, normalized);
  const inside = target === SERVICE_ROOT || target.startsWith(`${SERVICE_ROOT}${sep}`);
  if (isAbsolute(normalized) || !inside || relative(SERVICE_ROOT, target).startsWith("..")) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${field}:path`);
  }
  return normalized;
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

export function provenanceEvaluationDigest(value: unknown): string {
  const input = typeof value === "string" ? value : JSON.stringify(stableValue(value));
  return createHash("sha256").update(input).digest("hex");
}

function parseRecipe(value: unknown, caseId: string): ProvenanceEvaluationRecipe {
  const recipe = object(value, `${caseId}:asset:recipe`);
  exactKeys(
    recipe,
    ["recipeId", "implementationPath", "implementationSha256", "parameters", "parametersSha256"],
    `${caseId}:asset:recipe`,
  );
  const parameters = object(recipe.parameters, `${caseId}:asset:recipe:parameters`);
  if (
    Object.keys(parameters).length === 0
    || Object.values(parameters).some((entry) => !["string", "number", "boolean"].includes(typeof entry))
  ) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${caseId}:asset:recipe:parameters`);
  }
  const parametersSha256 = sha256(recipe.parametersSha256, `${caseId}:asset:recipe:parametersSha256`);
  if (parametersSha256 !== provenanceEvaluationDigest(parameters)) {
    throw new Error(`PROVENANCE_EVALUATION_RECIPE_PARAMETERS_MISMATCH:${caseId}`);
  }
  return {
    recipeId: text(recipe.recipeId, `${caseId}:asset:recipe:recipeId`, 160),
    implementationPath: safeRelativePath(recipe.implementationPath, `${caseId}:asset:recipe:implementationPath`),
    implementationSha256: sha256(recipe.implementationSha256, `${caseId}:asset:recipe:implementationSha256`),
    parameters: parameters as Record<string, string | number | boolean>,
    parametersSha256,
  };
}

function parseCase(value: unknown, registeredSchemes: Set<string>): ProvenanceEvaluationCase {
  const item = object(value, "case");
  exactKeys(item, ["id", "caseType", "targetSchemeIds", "asset", "expected", "provenance", "rights", "notes"], "case");
  const id = text(item.id, "case:id", 160);
  if (!CASE_TYPES.includes(item.caseType as ProvenanceEvaluationCaseType)) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:caseType`);
  }
  if (
    !Array.isArray(item.targetSchemeIds)
    || item.targetSchemeIds.length === 0
    || item.targetSchemeIds.some((scheme) => typeof scheme !== "string" || !registeredSchemes.has(scheme))
    || new Set(item.targetSchemeIds).size !== item.targetSchemeIds.length
  ) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:targetSchemeIds`);
  }

  const asset = object(item.asset, `${id}:asset`);
  exactKeys(asset, ["materialization", "relativePath", "sha256", "sizeBytes", "mimeType", "recipe"], `${id}:asset`);
  if (!MATERIALIZATIONS.includes(asset.materialization as EvaluationMaterialization)) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:asset:materialization`);
  }
  if (!Number.isInteger(asset.sizeBytes) || (asset.sizeBytes as number) < 1) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:asset:sizeBytes`);
  }
  if (!(["image/jpeg", "image/png"] as const).includes(asset.mimeType as "image/jpeg" | "image/png")) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:asset:mimeType`);
  }
  const materialization = asset.materialization as EvaluationMaterialization;
  const recipe = materialization === "deterministic_recipe" ? parseRecipe(asset.recipe, id) : null;
  const relativePath = materialization === "deterministic_recipe"
    ? null
    : safeRelativePath(asset.relativePath, `${id}:asset:relativePath`);
  if (
    (materialization === "deterministic_recipe" && asset.relativePath !== null)
    || (materialization !== "deterministic_recipe" && asset.recipe !== null)
  ) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:asset:materializationFields`);
  }

  const expected = object(item.expected, `${id}:expected`);
  exactKeys(
    expected,
    ["profileId", "configurationId", "outcome", "evidenceAuthority", "testOnlyTrustOrAuthentication"],
    `${id}:expected`,
  );
  if (!(expected.evidenceAuthority === "strong" || expected.evidenceAuthority === "supporting" || expected.evidenceAuthority === "neutral")) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:expected:evidenceAuthority`);
  }
  if (typeof expected.testOnlyTrustOrAuthentication !== "boolean") {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:expected:testOnlyTrustOrAuthentication`);
  }

  const provenance = object(item.provenance, `${id}:provenance`);
  exactKeys(provenance, ["sourceKind", "sourceUrl", "sourceRevision", "parentAssetSha256"], `${id}:provenance`);
  if (!(["official_fixture", "owned_generated", "deterministic_recipe"] as const).includes(
    provenance.sourceKind as "official_fixture" | "owned_generated" | "deterministic_recipe",
  )) {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:provenance:sourceKind`);
  }

  const rights = object(item.rights, `${id}:rights`);
  exactKeys(
    rights,
    ["owner", "license", "commercialEvaluationAllowed", "redistributable", "evidenceUrl"],
    `${id}:rights`,
  );
  if (rights.commercialEvaluationAllowed !== true || typeof rights.redistributable !== "boolean") {
    throw new Error(`INVALID_PROVENANCE_EVALUATION_MANIFEST:${id}:rights`);
  }

  return {
    id,
    caseType: item.caseType as ProvenanceEvaluationCaseType,
    targetSchemeIds: item.targetSchemeIds as string[],
    asset: {
      materialization,
      relativePath,
      sha256: sha256(asset.sha256, `${id}:asset:sha256`),
      sizeBytes: asset.sizeBytes as number,
      mimeType: asset.mimeType as "image/jpeg" | "image/png",
      recipe,
    },
    expected: {
      profileId: text(expected.profileId, `${id}:expected:profileId`, 160),
      configurationId: text(expected.configurationId, `${id}:expected:configurationId`, 160),
      outcome: text(expected.outcome, `${id}:expected:outcome`, 100),
      evidenceAuthority: expected.evidenceAuthority as "strong" | "supporting" | "neutral",
      testOnlyTrustOrAuthentication: expected.testOnlyTrustOrAuthentication,
    },
    provenance: {
      sourceKind: provenance.sourceKind as "official_fixture" | "owned_generated" | "deterministic_recipe",
      sourceUrl: httpsUrl(provenance.sourceUrl, `${id}:provenance:sourceUrl`),
      sourceRevision: text(provenance.sourceRevision, `${id}:provenance:sourceRevision`, 200),
      parentAssetSha256: provenance.parentAssetSha256 === null
        ? null
        : sha256(provenance.parentAssetSha256, `${id}:provenance:parentAssetSha256`),
    },
    rights: {
      owner: text(rights.owner, `${id}:rights:owner`, 200),
      license: text(rights.license, `${id}:rights:license`, 300),
      commercialEvaluationAllowed: true,
      redistributable: rights.redistributable,
      evidenceUrl: httpsUrl(rights.evidenceUrl, `${id}:rights:evidenceUrl`),
    },
    notes: text(item.notes, `${id}:notes`, 1_000),
  };
}

export function parseProvenanceEvaluationManifest(value: unknown): ProvenanceEvaluationManifest {
  const root = object(value, "root");
  exactKeys(
    root,
    [
      "schemaVersion",
      "manifestVersion",
      "createdAt",
      "provenanceRegistryVersion",
      "releaseGateRegistryVersion",
      "purpose",
      "releaseGateEligible",
      "policy",
      "cases",
    ],
    "root",
  );
  if (
    root.schemaVersion !== "provenance-evaluation-manifest.v1"
    || root.purpose !== "evaluation_only"
    || root.releaseGateEligible !== false
  ) {
    throw new Error("PROVENANCE_EVALUATION_AUTHORITY_ESCALATION");
  }
  const registry = loadProvenanceRegistry();
  const releaseGates = loadProvenanceReleaseGateRegistry();
  if (root.provenanceRegistryVersion !== registry.registryVersion) {
    throw new Error("PROVENANCE_EVALUATION_REGISTRY_VERSION_MISMATCH");
  }
  if (root.releaseGateRegistryVersion !== releaseGates.gateRegistryVersion) {
    throw new Error("PROVENANCE_EVALUATION_RELEASE_GATE_VERSION_MISMATCH");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(root.createdAt))) {
    throw new Error("INVALID_PROVENANCE_EVALUATION_MANIFEST:createdAt");
  }
  const policy = object(root.policy, "policy");
  exactKeys(
    policy,
    ["productionEvidenceEligible", "shortCircuitEligible", "userUploadDerivedAssetsAllowed", "minimumUnmarkedControlsForRelease"],
    "policy",
  );
  if (
    policy.productionEvidenceEligible !== false
    || policy.shortCircuitEligible !== false
    || policy.userUploadDerivedAssetsAllowed !== false
    || !Number.isInteger(policy.minimumUnmarkedControlsForRelease)
    || (policy.minimumUnmarkedControlsForRelease as number) < 10_000
  ) {
    throw new Error("PROVENANCE_EVALUATION_AUTHORITY_ESCALATION");
  }
  if (!Array.isArray(root.cases) || root.cases.length === 0) {
    throw new Error("INVALID_PROVENANCE_EVALUATION_MANIFEST:cases");
  }
  const registeredSchemes = new Set(registry.schemes.map((scheme) => scheme.id));
  const cases = root.cases.map((item) => parseCase(item, registeredSchemes));
  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error("DUPLICATE_PROVENANCE_EVALUATION_CASE");
  }
  const coveredTypes = new Set(cases.map((item) => item.caseType));
  for (const required of CASE_TYPES) {
    if (!coveredTypes.has(required)) throw new Error(`PROVENANCE_EVALUATION_COVERAGE_MISSING:${required}`);
  }
  return {
    schemaVersion: "provenance-evaluation-manifest.v1",
    manifestVersion: text(root.manifestVersion, "manifestVersion", 100),
    createdAt: root.createdAt as string,
    provenanceRegistryVersion: registry.registryVersion,
    releaseGateRegistryVersion: releaseGates.gateRegistryVersion,
    purpose: "evaluation_only",
    releaseGateEligible: false,
    policy: {
      productionEvidenceEligible: false,
      shortCircuitEligible: false,
      userUploadDerivedAssetsAllowed: false,
      minimumUnmarkedControlsForRelease: policy.minimumUnmarkedControlsForRelease as number,
    },
    cases,
  };
}

export function loadProvenanceEvaluationManifest(): ProvenanceEvaluationManifest {
  return parseProvenanceEvaluationManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as unknown);
}

function digestFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function verifyProvenanceEvaluationAssets(
  manifest: ProvenanceEvaluationManifest = loadProvenanceEvaluationManifest(),
): void {
  const normalized = parseProvenanceEvaluationManifest(manifest);
  for (const item of normalized.cases) {
    if (item.asset.relativePath) {
      const path = resolve(SERVICE_ROOT, item.asset.relativePath);
      let size: number;
      try {
        size = statSync(path).size;
      } catch {
        throw new Error(`PROVENANCE_EVALUATION_ASSET_MISSING:${item.id}`);
      }
      if (size !== item.asset.sizeBytes || digestFile(path) !== item.asset.sha256) {
        throw new Error(`PROVENANCE_EVALUATION_ASSET_DIGEST_MISMATCH:${item.id}`);
      }
    } else if (item.asset.recipe) {
      const implementationPath = resolve(SERVICE_ROOT, item.asset.recipe.implementationPath);
      try {
        if (digestFile(implementationPath) !== item.asset.recipe.implementationSha256) {
          throw new Error(`PROVENANCE_EVALUATION_RECIPE_DIGEST_MISMATCH:${item.id}`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("PROVENANCE_EVALUATION_")) throw error;
        throw new Error(`PROVENANCE_EVALUATION_RECIPE_MISSING:${item.id}`);
      }
    }
  }
}

export function summarizeProvenanceEvaluationManifest(
  manifest: ProvenanceEvaluationManifest = loadProvenanceEvaluationManifest(),
): ProvenanceEvaluationManifestSummary {
  const normalized = parseProvenanceEvaluationManifest(manifest);
  const caseTypes = Object.fromEntries(CASE_TYPES.map((type) => [type, 0])) as Record<ProvenanceEvaluationCaseType, number>;
  const materializations = Object.fromEntries(MATERIALIZATIONS.map((type) => [type, 0])) as Record<EvaluationMaterialization, number>;
  const targetSchemes: Record<string, number> = {};
  for (const item of normalized.cases) {
    caseTypes[item.caseType] += 1;
    materializations[item.asset.materialization] += 1;
    for (const schemeId of item.targetSchemeIds) targetSchemes[schemeId] = (targetSchemes[schemeId] || 0) + 1;
  }
  return {
    schemaVersion: "provenance-evaluation-manifest-summary.v1",
    manifestVersion: normalized.manifestVersion,
    manifestSha256: provenanceEvaluationDigest(normalized),
    cases: normalized.cases.length,
    caseTypes,
    targetSchemes,
    materializations,
    releaseGateEligible: false,
    releaseGateGap: `Compatibility fixtures are not the ${normalized.policy.minimumUnmarkedControlsForRelease} unmarked controls and transformed cases required by the release gate.`,
  };
}
