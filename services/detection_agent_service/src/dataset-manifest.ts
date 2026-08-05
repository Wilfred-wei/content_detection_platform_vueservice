import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { inspectImage } from "./image-inspection.js";

export type DatasetLabel = "real" | "ai_generated";
export type DatasetSplit = "calibration" | "evaluation" | "test";
export type DatasetRightsPolicy = "commercial_cleared" | "research_only";
export type DatasetGeneratorRole = "owned" | "held_out" | "unknown";

export interface DatasetSample {
  sampleId: string;
  relativePath: string;
  sha256: string;
  split: DatasetSplit;
  label: DatasetLabel;
  domain: string;
  generator: string | null;
  /** Explicit provenance role; unknown is safer than inferring ownership from a name. */
  generatorRole?: DatasetGeneratorRole;
  sourceId: string;
  rights: { license: string; commercialUseAllowed: boolean; provenance: string };
  transformation?: string;
}

export interface DatasetManifest {
  schemaVersion: "ai-image-dataset-manifest.v1";
  manifestId: string;
  revision: string;
  createdAt: string;
  rightsPolicy: DatasetRightsPolicy;
  samples: DatasetSample[];
}

export interface DatasetSourceRecord {
  path: string;
  sampleId?: string;
  split: DatasetSplit;
  label: DatasetLabel;
  domain: string;
  generator?: string | null;
  generatorRole?: DatasetGeneratorRole;
  sourceId: string;
  rights: { license: string; commercialUseAllowed: boolean; provenance: string };
  transformation?: string;
}

export interface DatasetResolutionSummary {
  samplesWithDimensions: number;
  samplesWithoutDimensions: number;
  width: { min: number | null; max: number | null; mean: number | null; p50: number | null; p95: number | null };
  height: { min: number | null; max: number | null; mean: number | null; p50: number | null; p95: number | null };
  orientation: { landscape: number; portrait: number; square: number };
  aspectRatioBuckets: Record<"lt_0_75" | "0_75_to_1" | "1_to_4_3" | "4_3_to_16_9" | "16_9_to_2" | "gte_2", number>;
  commonSizes: Array<{ width: number; height: number; count: number }>;
}

export interface DatasetAssetVerificationSummary {
  verifiedAssets: number;
  resolution: DatasetResolutionSummary;
  byLabel: Record<DatasetLabel, DatasetResolutionSummary>;
}

export interface DatasetManifestBuildHeader {
  manifestId: string;
  revision: string;
  createdAt: string;
  rightsPolicy?: DatasetRightsPolicy;
}

export interface TransformationRecipe {
  id: string;
  operation: "resize" | "recompress" | "crop" | "screenshot" | "blur" | "color_edit" | "overlay";
  parameters: Record<string, number | string | boolean>;
}

function text(value: unknown, field: string, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`INVALID_DATASET_MANIFEST:${field}`);
  return value.trim();
}

function digest(value: unknown, field: string): string {
  const normalized = text(value, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`INVALID_DATASET_MANIFEST:${field}`);
  return normalized;
}

function generatorRole(value: unknown, field: string): DatasetGeneratorRole | undefined {
  if (value === undefined || value === null) return undefined;
  if (value !== "owned" && value !== "held_out" && value !== "unknown") throw new Error(`INVALID_DATASET_MANIFEST:${field}`);
  return value;
}

export function parseDatasetManifest(value: unknown): DatasetManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_DATASET_MANIFEST:root");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== "ai-image-dataset-manifest.v1" || !Array.isArray(raw.samples) || raw.samples.length === 0) throw new Error("INVALID_DATASET_MANIFEST:header");
  const rightsPolicy = raw.rightsPolicy === undefined ? "commercial_cleared" : raw.rightsPolicy;
  if (rightsPolicy !== "commercial_cleared" && rightsPolicy !== "research_only") throw new Error("INVALID_DATASET_MANIFEST:rightsPolicy");
  const ids = new Set<string>();
  const sourcePartitions = new Map<string, DatasetSplit>();
  const samples = raw.samples.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`INVALID_DATASET_MANIFEST:sample:${index}`);
    const sample = item as Record<string, unknown>;
    const sampleId = text(sample.sampleId, `sampleId:${index}`);
    if (ids.has(sampleId)) throw new Error(`INVALID_DATASET_MANIFEST:duplicate:${sampleId}`);
    ids.add(sampleId);
    const relativePath = text(sample.relativePath, `relativePath:${index}`, 500).replace(/\\/g, "/");
    if (isAbsolute(relativePath) || relativePath.split("/").includes("..")) throw new Error(`INVALID_DATASET_MANIFEST:path:${index}`);
    const split = sample.split;
    if (split !== "calibration" && split !== "evaluation" && split !== "test") throw new Error(`INVALID_DATASET_MANIFEST:split:${index}`);
    const label = sample.label;
    if (label !== "real" && label !== "ai_generated") throw new Error(`INVALID_DATASET_MANIFEST:label:${index}`);
    const generator = sample.generator === null || sample.generator === undefined ? null : text(sample.generator, `generator:${index}`);
    const role = generatorRole(sample.generatorRole, `generatorRole:${index}`);
    if (label === "ai_generated" && !generator) throw new Error(`INVALID_DATASET_MANIFEST:generator:${index}`);
    const sourceId = text(sample.sourceId, `sourceId:${index}`);
    const priorPartition = sourcePartitions.get(sourceId);
    if (priorPartition && priorPartition !== split) throw new Error(`INVALID_DATASET_MANIFEST:source_split_leak:${sourceId}`);
    sourcePartitions.set(sourceId, split);
    const rights = sample.rights;
    if (!rights || typeof rights !== "object" || Array.isArray(rights)) throw new Error(`INVALID_DATASET_MANIFEST:rights:${index}`);
    const rightsRecord = rights as Record<string, unknown>;
    if (typeof rightsRecord.commercialUseAllowed !== "boolean") throw new Error(`INVALID_DATASET_MANIFEST:commercial_rights:${index}`);
    return {
      sampleId,
      relativePath,
      sha256: digest(sample.sha256, `sha256:${index}`),
      split,
      label,
      domain: text(sample.domain, `domain:${index}`),
      generator,
      ...(label === "ai_generated" ? { generatorRole: role || "unknown" } : (role === undefined ? {} : { generatorRole: role })),
      sourceId,
      rights: { license: text(rightsRecord.license, `license:${index}`), commercialUseAllowed: rightsRecord.commercialUseAllowed as boolean, provenance: text(rightsRecord.provenance, `provenance:${index}`, 500) },
      ...(sample.transformation === undefined ? {} : { transformation: text(sample.transformation, `transformation:${index}`) }),
    } as DatasetSample;
  });
  if (rightsPolicy === "commercial_cleared" && samples.some((sample) => !sample.rights.commercialUseAllowed)) {
    throw new Error("INVALID_DATASET_MANIFEST:commercial_rights");
  }
  return {
    schemaVersion: "ai-image-dataset-manifest.v1",
    manifestId: text(raw.manifestId, "manifestId"),
    revision: text(raw.revision, "revision"),
    createdAt: text(raw.createdAt, "createdAt"),
    rightsPolicy,
    samples,
  };
}

/**
 * Build a manifest from an explicit rights-reviewed source list. This helper
 * never infers licenses or labels from directory names; callers must provide
 * both and the resulting manifest is re-parsed through the strict validator.
 */
export function buildDatasetManifest(
  rootDir: string,
  records: readonly DatasetSourceRecord[],
  header: DatasetManifestBuildHeader,
): DatasetManifest {
  if (records.length === 0) throw new Error("INVALID_DATASET_MANIFEST:empty_source_records");
  const root = resolve(rootDir);
  const samples = records.map((record, index) => {
    if (!record || typeof record.path !== "string" || !record.path.trim()) throw new Error(`INVALID_DATASET_MANIFEST:source_path:${index}`);
    const absolute = resolve(root, record.path);
    if (!absolute.startsWith(`${root}${sep}`)) throw new Error(`INVALID_DATASET_MANIFEST:path_escape:${index}`);
    const stat = statSync(absolute);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 100 * 1024 * 1024) throw new Error(`INVALID_DATASET_MANIFEST:asset:${index}`);
    const relativePath = relative(root, absolute).replace(/\\/g, "/");
    if (isAbsolute(relativePath) || relativePath.split("/").includes("..")) throw new Error(`INVALID_DATASET_MANIFEST:path:${index}`);
    const role = generatorRole(record.generatorRole, `generatorRole:${index}`);
    if (record.label === "ai_generated" && !(record.generator || "").trim()) throw new Error(`INVALID_DATASET_MANIFEST:generator:${index}`);
    return {
      sampleId: record.sampleId || `${record.sourceId}-${index.toString().padStart(6, "0")}`,
      relativePath,
      sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
      split: record.split,
      label: record.label,
      domain: record.domain,
      generator: record.generator ?? null,
      ...(record.label === "ai_generated" ? { generatorRole: role || "unknown" } : (role === undefined ? {} : { generatorRole: role })),
      sourceId: record.sourceId,
      rights: record.rights,
      ...(record.transformation === undefined ? {} : { transformation: record.transformation }),
    } satisfies DatasetSample;
  });
  const rightsPolicy = header.rightsPolicy || "commercial_cleared";
  if (rightsPolicy === "commercial_cleared" && samples.some((sample) => !sample.rights.commercialUseAllowed)) {
    throw new Error("INVALID_DATASET_MANIFEST:commercial_rights");
  }
  return parseDatasetManifest({
    schemaVersion: "ai-image-dataset-manifest.v1",
    manifestId: header.manifestId,
    revision: header.revision,
    createdAt: header.createdAt,
    rightsPolicy,
    samples,
  });
}

interface ResolutionAccumulator {
  widths: number[];
  heights: number[];
  orientation: DatasetResolutionSummary["orientation"];
  aspectRatioBuckets: DatasetResolutionSummary["aspectRatioBuckets"];
  sizes: Map<string, { width: number; height: number; count: number }>;
  samplesWithoutDimensions: number;
}

const ASPECT_RATIO_BUCKETS = ["lt_0_75", "0_75_to_1", "1_to_4_3", "4_3_to_16_9", "16_9_to_2", "gte_2"] as const;

function createResolutionAccumulator(): ResolutionAccumulator {
  return {
    widths: [],
    heights: [],
    orientation: { landscape: 0, portrait: 0, square: 0 },
    aspectRatioBuckets: Object.fromEntries(ASPECT_RATIO_BUCKETS.map((bucket) => [bucket, 0])) as ResolutionAccumulator["aspectRatioBuckets"],
    sizes: new Map(),
    samplesWithoutDimensions: 0,
  };
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null;
}

function numericSummary(values: readonly number[]): DatasetResolutionSummary["width"] {
  if (!values.length) return { min: null, max: null, mean: null, p50: null, p95: null };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function addDimensions(accumulator: ResolutionAccumulator, width: number | undefined, height: number | undefined): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 1 || (height as number) < 1) {
    accumulator.samplesWithoutDimensions += 1;
    return;
  }
  const safeWidth = width as number;
  const safeHeight = height as number;
  accumulator.widths.push(safeWidth);
  accumulator.heights.push(safeHeight);
  if (safeWidth === safeHeight) accumulator.orientation.square += 1;
  else if (safeWidth > safeHeight) accumulator.orientation.landscape += 1;
  else accumulator.orientation.portrait += 1;
  const ratio = safeWidth / safeHeight;
  const bucket = ratio < 0.75 ? "lt_0_75"
    : ratio < 1 ? "0_75_to_1"
      : ratio < 4 / 3 ? "1_to_4_3"
        : ratio < 16 / 9 ? "4_3_to_16_9"
          : ratio < 2 ? "16_9_to_2" : "gte_2";
  accumulator.aspectRatioBuckets[bucket] += 1;
  const key = `${safeWidth}x${safeHeight}`;
  const size = accumulator.sizes.get(key);
  if (size) size.count += 1;
  else accumulator.sizes.set(key, { width: safeWidth, height: safeHeight, count: 1 });
}

function summarizeResolution(accumulator: ResolutionAccumulator): DatasetResolutionSummary {
  return {
    samplesWithDimensions: accumulator.widths.length,
    samplesWithoutDimensions: accumulator.samplesWithoutDimensions,
    width: numericSummary(accumulator.widths),
    height: numericSummary(accumulator.heights),
    orientation: { ...accumulator.orientation },
    aspectRatioBuckets: { ...accumulator.aspectRatioBuckets },
    commonSizes: [...accumulator.sizes.values()]
      .sort((left, right) => right.count - left.count || left.width - right.width || left.height - right.height)
      .slice(0, 20),
  };
}

export function verifyDatasetAssets(manifest: DatasetManifest, rootDir: string): DatasetAssetVerificationSummary {
  const root = resolve(rootDir);
  const overall = createResolutionAccumulator();
  const byLabel: Record<DatasetLabel, ResolutionAccumulator> = {
    real: createResolutionAccumulator(),
    ai_generated: createResolutionAccumulator(),
  };
  for (const sample of manifest.samples) {
    const path = resolve(root, sample.relativePath);
    if (!path.startsWith(`${root}${sep}`)) throw new Error(`INVALID_DATASET_MANIFEST:path_escape:${sample.sampleId}`);
    const stat = statSync(path);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 100 * 1024 * 1024) throw new Error(`INVALID_DATASET_MANIFEST:asset:${sample.sampleId}`);
    const bytes = readFileSync(path);
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== sample.sha256) throw new Error(`INVALID_DATASET_MANIFEST:digest:${sample.sampleId}`);
    let dimensions: { width?: number; height?: number } = {};
    try { dimensions = inspectImage(bytes); } catch { /* Non-image fixtures remain digest-verifiable with unknown dimensions. */ }
    addDimensions(overall, dimensions.width, dimensions.height);
    addDimensions(byLabel[sample.label], dimensions.width, dimensions.height);
  }
  return {
    verifiedAssets: manifest.samples.length,
    resolution: summarizeResolution(overall),
    byLabel: {
      real: summarizeResolution(byLabel.real),
      ai_generated: summarizeResolution(byLabel.ai_generated),
    },
  };
}

const TRANSFORMATIONS = new Set<TransformationRecipe["operation"]>(["resize", "recompress", "crop", "screenshot", "blur", "color_edit", "overlay"]);

export function parseTransformationRecipes(value: unknown): TransformationRecipe[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("INVALID_TRANSFORMATION_RECIPES:root");
  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`INVALID_TRANSFORMATION_RECIPES:recipe:${index}`);
    const raw = item as Record<string, unknown>;
    const id = text(raw.id, `id:${index}`);
    const operation = raw.operation;
    if (ids.has(id) || typeof operation !== "string" || !TRANSFORMATIONS.has(operation as TransformationRecipe["operation"])) throw new Error(`INVALID_TRANSFORMATION_RECIPES:operation:${index}`);
    ids.add(id);
    if (!raw.parameters || typeof raw.parameters !== "object" || Array.isArray(raw.parameters)
      || Object.values(raw.parameters as Record<string, unknown>).some((value) => !["string", "number", "boolean"].includes(typeof value))) throw new Error(`INVALID_TRANSFORMATION_RECIPES:parameters:${index}`);
    return { id, operation: operation as TransformationRecipe["operation"], parameters: raw.parameters as TransformationRecipe["parameters"] };
  });
}
