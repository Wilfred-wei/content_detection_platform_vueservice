import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type ProvenanceTransformationOperation =
  | "resize"
  | "recompression"
  | "crop"
  | "screenshot"
  | "blur"
  | "color_edit"
  | "overlay"
  | "metadata_removal"
  | "visible_label_forgery"
  | "adversarial";

export interface ProvenanceTransformationRecipe {
  id: string;
  operation: ProvenanceTransformationOperation;
  parameters: Record<string, unknown>;
  parametersSha256: string;
  outputFormat: "png" | "jpeg";
  metadataExpected: "removed";
  description: string;
}

export interface ProvenanceTransformationSuite {
  schemaVersion: "provenance-transformation-suite.v1";
  suiteVersion: string;
  createdAt: string;
  purpose: "evaluation_only";
  releaseGateEligible: false;
  policy: {
    productionEvidenceEligible: false;
    shortCircuitEligible: false;
    networkAccessAllowed: false;
    arbitraryOperationChainsAllowed: false;
  };
  worker: {
    protocolVersion: "1.0.0";
    recipeVersion: "provenance-transform.v1";
    implementationPath: string;
    implementationSha256: string;
    lockPath: string;
    lockSha256: string;
    pillowVersion: "11.3.0";
  };
  limits: {
    maxInputBytes: number;
    maxPixels: number;
    maxDimension: number;
  };
  recipes: ProvenanceTransformationRecipe[];
}

export interface ProvenanceTransformationSuiteSummary {
  schemaVersion: "provenance-transformation-suite-summary.v1";
  suiteVersion: string;
  suiteSha256: string;
  recipes: number;
  operations: Record<ProvenanceTransformationOperation, number>;
  adversarialProfiles: string[];
  releaseGateEligible: false;
}

const SERVICE_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SUITE_PATH = resolve(SERVICE_ROOT, "resources/provenance-transformation-suite.v1.json");
const SHA256 = /^[a-f0-9]{64}$/;
const OPERATIONS: readonly ProvenanceTransformationOperation[] = [
  "resize",
  "recompression",
  "crop",
  "screenshot",
  "blur",
  "color_edit",
  "overlay",
  "metadata_removal",
  "visible_label_forgery",
  "adversarial",
];
const ADVERSARIAL_PROFILES = ["social_jpeg_resize", "screenshot_jpeg", "blur_overlay", "metadata_label"] as const;

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}:fields`);
  }
}

function text(value: unknown, field: string, maximum = 500): string {
  if (typeof value !== "string") throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f]/.test(normalized)) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  }
  return normalized;
}

function digest(value: unknown): string {
  const stable = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(stable);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, stable(nested)]),
      );
    }
    return entry;
  };
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function sha256(value: unknown, field: string): string {
  const normalized = text(value, field, 64).toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  return normalized;
}

function safeRelativePath(value: unknown, field: string): string {
  const normalized = text(value, field, 300).replaceAll("\\", "/");
  const target = resolve(SERVICE_ROOT, normalized);
  if (
    isAbsolute(normalized)
    || relative(SERVICE_ROOT, target).startsWith("..")
    || !(target === SERVICE_ROOT || target.startsWith(`${SERVICE_ROOT}${sep}`))
  ) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}:path`);
  }
  return normalized;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  }
  return value as number;
}

function number(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  }
  return value;
}

function color(value: unknown, field: string, channels: 3 | 4): number[] {
  if (!Array.isArray(value) || value.length !== channels) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  }
  return value.map((entry, index) => integer(entry, `${field}:${index}`, 0, 255));
}

function region(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  }
  const values = value.map((entry, index) => number(entry, `${field}:${index}`, 0, 1));
  if (!(values[0] < values[2] && values[1] < values[3])) {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}`);
  }
  return values;
}

function validateParameters(operation: ProvenanceTransformationOperation, raw: unknown, field: string): Record<string, unknown> {
  const parameters = object(raw, field);
  switch (operation) {
    case "resize":
      exactKeys(parameters, ["width", "height"], field);
      integer(parameters.width, `${field}:width`, 1, 4096);
      integer(parameters.height, `${field}:height`, 1, 4096);
      break;
    case "recompression":
      exactKeys(parameters, ["quality"], field);
      integer(parameters.quality, `${field}:quality`, 1, 100);
      break;
    case "crop":
      exactKeys(parameters, ["region"], field);
      region(parameters.region, `${field}:region`);
      break;
    case "screenshot":
      exactKeys(parameters, ["viewportWidth", "viewportHeight", "deviceScaleFactor", "background"], field);
      integer(parameters.viewportWidth, `${field}:viewportWidth`, 64, 4096);
      integer(parameters.viewportHeight, `${field}:viewportHeight`, 64, 4096);
      integer(parameters.deviceScaleFactor, `${field}:deviceScaleFactor`, 1, 3);
      color(parameters.background, `${field}:background`, 3);
      break;
    case "blur":
      exactKeys(parameters, ["radius"], field);
      number(parameters.radius, `${field}:radius`, 0, 50);
      break;
    case "color_edit":
      exactKeys(parameters, ["brightness", "contrast", "saturation", "hueDegrees"], field);
      number(parameters.brightness, `${field}:brightness`, 0, 3);
      number(parameters.contrast, `${field}:contrast`, 0, 3);
      number(parameters.saturation, `${field}:saturation`, 0, 3);
      number(parameters.hueDegrees, `${field}:hueDegrees`, -180, 180);
      break;
    case "overlay":
      exactKeys(parameters, ["region", "rgba"], field);
      region(parameters.region, `${field}:region`);
      color(parameters.rgba, `${field}:rgba`, 4);
      break;
    case "metadata_removal":
      exactKeys(parameters, ["outputFormat", "quality"], field);
      if (parameters.outputFormat !== "png" && parameters.outputFormat !== "jpeg") {
        throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}:outputFormat`);
      }
      integer(parameters.quality, `${field}:quality`, 1, 100);
      break;
    case "visible_label_forgery":
      exactKeys(parameters, ["text", "region", "rgba", "background"], field);
      if (!/^[A-Za-z0-9 _-]{1,48}$/.test(text(parameters.text, `${field}:text`, 48))) {
        throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}:text`);
      }
      region(parameters.region, `${field}:region`);
      color(parameters.rgba, `${field}:rgba`, 4);
      color(parameters.background, `${field}:background`, 4);
      break;
    case "adversarial":
      exactKeys(parameters, ["profile"], field);
      if (!ADVERSARIAL_PROFILES.includes(parameters.profile as typeof ADVERSARIAL_PROFILES[number])) {
        throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${field}:profile`);
      }
      break;
  }
  return parameters;
}

function parseRecipe(value: unknown): ProvenanceTransformationRecipe {
  const recipe = object(value, "recipe");
  exactKeys(
    recipe,
    ["id", "operation", "parameters", "parametersSha256", "outputFormat", "metadataExpected", "description"],
    "recipe",
  );
  if (!OPERATIONS.includes(recipe.operation as ProvenanceTransformationOperation)) {
    throw new Error("INVALID_PROVENANCE_TRANSFORMATION_SUITE:recipe:operation");
  }
  const operation = recipe.operation as ProvenanceTransformationOperation;
  const id = text(recipe.id, "recipe:id", 160);
  const parameters = validateParameters(operation, recipe.parameters, `${id}:parameters`);
  const parametersSha256 = sha256(recipe.parametersSha256, `${id}:parametersSha256`);
  if (parametersSha256 !== digest(parameters)) {
    throw new Error(`PROVENANCE_TRANSFORMATION_PARAMETERS_MISMATCH:${id}`);
  }
  if (recipe.outputFormat !== "png" && recipe.outputFormat !== "jpeg") {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${id}:outputFormat`);
  }
  const expectedOutputFormat = operation === "recompression"
    ? "jpeg"
    : operation === "metadata_removal"
      ? parameters.outputFormat
      : operation === "adversarial" && (parameters.profile === "social_jpeg_resize" || parameters.profile === "screenshot_jpeg")
        ? "jpeg"
        : "png";
  if (recipe.outputFormat !== expectedOutputFormat) {
    throw new Error(`PROVENANCE_TRANSFORMATION_OUTPUT_FORMAT_MISMATCH:${id}`);
  }
  if (recipe.metadataExpected !== "removed") {
    throw new Error(`INVALID_PROVENANCE_TRANSFORMATION_SUITE:${id}:metadataExpected`);
  }
  return {
    id,
    operation,
    parameters,
    parametersSha256,
    outputFormat: recipe.outputFormat,
    metadataExpected: "removed",
    description: text(recipe.description, `${id}:description`, 500),
  };
}

export function parseProvenanceTransformationSuite(value: unknown): ProvenanceTransformationSuite {
  const root = object(value, "root");
  exactKeys(root, ["schemaVersion", "suiteVersion", "createdAt", "purpose", "releaseGateEligible", "policy", "worker", "limits", "recipes"], "root");
  if (
    root.schemaVersion !== "provenance-transformation-suite.v1"
    || root.purpose !== "evaluation_only"
    || root.releaseGateEligible !== false
  ) {
    throw new Error("PROVENANCE_TRANSFORMATION_AUTHORITY_ESCALATION");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(root.createdAt))) {
    throw new Error("INVALID_PROVENANCE_TRANSFORMATION_SUITE:createdAt");
  }
  const policy = object(root.policy, "policy");
  exactKeys(policy, ["productionEvidenceEligible", "shortCircuitEligible", "networkAccessAllowed", "arbitraryOperationChainsAllowed"], "policy");
  if (
    policy.productionEvidenceEligible !== false
    || policy.shortCircuitEligible !== false
    || policy.networkAccessAllowed !== false
    || policy.arbitraryOperationChainsAllowed !== false
  ) {
    throw new Error("PROVENANCE_TRANSFORMATION_AUTHORITY_ESCALATION");
  }
  const worker = object(root.worker, "worker");
  exactKeys(worker, ["protocolVersion", "recipeVersion", "implementationPath", "implementationSha256", "lockPath", "lockSha256", "pillowVersion"], "worker");
  if (
    worker.protocolVersion !== "1.0.0"
    || worker.recipeVersion !== "provenance-transform.v1"
    || worker.pillowVersion !== "11.3.0"
  ) {
    throw new Error("INVALID_PROVENANCE_TRANSFORMATION_SUITE:worker:version");
  }
  const limits = object(root.limits, "limits");
  exactKeys(limits, ["maxInputBytes", "maxPixels", "maxDimension"], "limits");
  const parsedLimits = {
    maxInputBytes: integer(limits.maxInputBytes, "limits:maxInputBytes", 1, 50 * 1024 * 1024),
    maxPixels: integer(limits.maxPixels, "limits:maxPixels", 1, 100_000_000),
    maxDimension: integer(limits.maxDimension, "limits:maxDimension", 64, 4096),
  };
  if (!Array.isArray(root.recipes) || root.recipes.length === 0) {
    throw new Error("INVALID_PROVENANCE_TRANSFORMATION_SUITE:recipes");
  }
  const recipes = root.recipes.map(parseRecipe);
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) {
    throw new Error("DUPLICATE_PROVENANCE_TRANSFORMATION_RECIPE");
  }
  const covered = new Set(recipes.map((recipe) => recipe.operation));
  for (const operation of OPERATIONS) {
    if (!covered.has(operation)) throw new Error(`PROVENANCE_TRANSFORMATION_COVERAGE_MISSING:${operation}`);
  }
  const profiles = new Set(
    recipes
      .filter((recipe) => recipe.operation === "adversarial")
      .map((recipe) => recipe.parameters.profile),
  );
  for (const profile of ADVERSARIAL_PROFILES) {
    if (!profiles.has(profile)) throw new Error(`PROVENANCE_TRANSFORMATION_PROFILE_MISSING:${profile}`);
  }
  return {
    schemaVersion: "provenance-transformation-suite.v1",
    suiteVersion: text(root.suiteVersion, "suiteVersion", 100),
    createdAt: root.createdAt as string,
    purpose: "evaluation_only",
    releaseGateEligible: false,
    policy: {
      productionEvidenceEligible: false,
      shortCircuitEligible: false,
      networkAccessAllowed: false,
      arbitraryOperationChainsAllowed: false,
    },
    worker: {
      protocolVersion: "1.0.0",
      recipeVersion: "provenance-transform.v1",
      implementationPath: safeRelativePath(worker.implementationPath, "worker:implementationPath"),
      implementationSha256: sha256(worker.implementationSha256, "worker:implementationSha256"),
      lockPath: safeRelativePath(worker.lockPath, "worker:lockPath"),
      lockSha256: sha256(worker.lockSha256, "worker:lockSha256"),
      pillowVersion: "11.3.0",
    },
    limits: parsedLimits,
    recipes,
  };
}

export function loadProvenanceTransformationSuite(): ProvenanceTransformationSuite {
  return parseProvenanceTransformationSuite(JSON.parse(readFileSync(SUITE_PATH, "utf8")) as unknown);
}

export function verifyProvenanceTransformationArtifacts(
  suite: ProvenanceTransformationSuite = loadProvenanceTransformationSuite(),
): void {
  const normalized = parseProvenanceTransformationSuite(suite);
  const implementation = readFileSync(resolve(SERVICE_ROOT, normalized.worker.implementationPath));
  const lock = readFileSync(resolve(SERVICE_ROOT, normalized.worker.lockPath));
  if (createHash("sha256").update(implementation).digest("hex") !== normalized.worker.implementationSha256) {
    throw new Error("PROVENANCE_TRANSFORMATION_IMPLEMENTATION_MISMATCH");
  }
  if (createHash("sha256").update(lock).digest("hex") !== normalized.worker.lockSha256) {
    throw new Error("PROVENANCE_TRANSFORMATION_LOCK_MISMATCH");
  }
}

export function summarizeProvenanceTransformationSuite(
  suite: ProvenanceTransformationSuite = loadProvenanceTransformationSuite(),
): ProvenanceTransformationSuiteSummary {
  const normalized = parseProvenanceTransformationSuite(suite);
  const operations = Object.fromEntries(OPERATIONS.map((operation) => [operation, 0])) as Record<ProvenanceTransformationOperation, number>;
  for (const recipe of normalized.recipes) operations[recipe.operation] += 1;
  return {
    schemaVersion: "provenance-transformation-suite-summary.v1",
    suiteVersion: normalized.suiteVersion,
    suiteSha256: digest(normalized),
    recipes: normalized.recipes.length,
    operations,
    adversarialProfiles: normalized.recipes
      .filter((recipe) => recipe.operation === "adversarial")
      .map((recipe) => String(recipe.parameters.profile))
      .sort(),
    releaseGateEligible: false,
  };
}
