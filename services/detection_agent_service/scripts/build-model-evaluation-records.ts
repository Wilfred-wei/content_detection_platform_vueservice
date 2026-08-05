import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseDatasetManifest, type DatasetManifest } from "../src/dataset-manifest.js";
import type { ModelEvaluationRecord } from "../src/model-evaluation.js";

const MAX_INPUT_BYTES = 512 * 1024 * 1024;
const MAX_LINE_BYTES = 256 * 1024;
const DEFAULT_CALIBRATION_PERCENT = 25;

interface RawPrediction {
  record_id?: unknown;
  sample_id?: unknown;
  label?: unknown;
  score?: unknown;
  benchmark?: unknown;
  domain?: unknown;
  generator?: unknown;
  group_id?: unknown;
  source_path?: unknown;
  sample_path?: unknown;
  split?: unknown;
  pair_type?: unknown;
  transformation?: unknown;
  latency_ms?: unknown;
  latencyMs?: unknown;
}

interface BuildOptions {
  inputs: string[];
  output: string;
  detectorId: string;
  datasetId: string;
  calibrationPercent: number;
  salt: string;
  deduplicateSharedAssets: boolean;
  datasetManifest?: string;
}

function usage(): never {
  throw new Error("Usage: npm run build:model-records -- --input <prediction.jsonl> [--input <prediction.jsonl>] --output <records.json> [--detector-id id] [--dataset-id id] [--dataset-manifest manifest.json] [--calibration-percent 25] [--salt v1] [--deduplicate-shared-assets]");
}

function boundedText(value: unknown, field: string, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`INVALID_MODEL_PREDICTION:${field}`);
  }
  return value.trim();
}

function parseNumber(value: unknown, field: string, maximum = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`INVALID_MODEL_PREDICTION:${field}`);
  }
  return value;
}

function parseOptions(argv: readonly string[]): BuildOptions {
  const inputs: string[] = [];
  let output: string | undefined;
  let detectorId = "dda-dinov2-lora";
  let datasetId = "local-evaluation";
  let calibrationPercent = DEFAULT_CALIBRATION_PERCENT;
  let salt = "model-evaluation-records.v1";
  let deduplicateSharedAssets = false;
  let datasetManifest: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--input" && next) {
      inputs.push(resolve(next));
      index += 1;
    } else if (argument === "--output" && next) {
      output = resolve(next);
      index += 1;
    } else if (argument === "--detector-id" && next) {
      detectorId = boundedText(next, "detector_id", 120);
      index += 1;
    } else if (argument === "--dataset-id" && next) {
      datasetId = boundedText(next, "dataset_id", 160);
      index += 1;
    } else if (argument === "--calibration-percent" && next) {
      calibrationPercent = Number.parseInt(next, 10);
      index += 1;
    } else if (argument === "--salt" && next) {
      salt = boundedText(next, "salt", 160);
      index += 1;
    } else if (argument === "--dataset-manifest" && next) {
      datasetManifest = resolve(next);
      index += 1;
    } else if (argument === "--deduplicate-shared-assets") {
      deduplicateSharedAssets = true;
    } else {
      usage();
    }
  }
  if (!inputs.length || !output || !Number.isInteger(calibrationPercent) || calibrationPercent < 1 || calibrationPercent > 49) usage();
  return { inputs, output, detectorId, datasetId, calibrationPercent, salt, deduplicateSharedAssets, datasetManifest };
}

function hashByte(value: string): number {
  return createHash("sha256").update(value).digest()[0];
}

function inputDigest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseLine(line: string, path: string, lineNumber: number): RawPrediction {
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) throw new Error(`INVALID_MODEL_PREDICTION:${path}:${lineNumber}:line_too_large`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`INVALID_MODEL_PREDICTION:${path}:${lineNumber}:json`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`INVALID_MODEL_PREDICTION:${path}:${lineNumber}:object`);
  return parsed as RawPrediction;
}

function datasetManifestMetadata(path: string | undefined): Record<string, unknown> | null {
  if (!path) return null;
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error(`INVALID_DATASET_MANIFEST_INPUT:${path}`);
  const bytes = readFileSync(path);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`INVALID_DATASET_MANIFEST_INPUT:${path}:json`); }
  const manifest: DatasetManifest = parseDatasetManifest(parsed);
  const generatorRoles = Object.fromEntries([...new Set(manifest.samples.map((sample) => sample.generatorRole || "none"))].map((role) => [role, manifest.samples.filter((sample) => (sample.generatorRole || "none") === role).length]));
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    manifestId: manifest.manifestId,
    revision: manifest.revision,
    rightsPolicy: manifest.rightsPolicy,
    samples: manifest.samples.length,
    generatorRoles,
    sampleIdentityBinding: "declared_manifest_only",
  };
}

function partitionFor(group: string, options: BuildOptions): "calibration" | "evaluation" {
  return hashByte(`${options.salt}:${group}`) % 100 < options.calibrationPercent ? "calibration" : "evaluation";
}

function normalizedTransformation(raw: RawPrediction): string {
  if (typeof raw.transformation === "string" && raw.transformation.trim()) return boundedText(raw.transformation, "transformation", 120);
  const split = typeof raw.split === "string" ? raw.split.trim() : "";
  if (split === "real_control" || split === "t2i_fake") return "t2i_original";
  return "original";
}

function recordFrom(raw: RawPrediction, index: number, options: BuildOptions): ModelEvaluationRecord {
  if (raw.label !== 0 && raw.label !== 1) throw new Error(`INVALID_MODEL_PREDICTION:label:${index}`);
  const score = parseNumber(raw.score, `score:${index}`);
  const benchmark = boundedText(raw.benchmark ?? "unknown", `benchmark:${index}`, 120);
  const domain = boundedText(raw.domain ?? raw.generator ?? "unknown", `domain:${index}`, 160);
  const stableSource = raw.record_id ?? raw.sample_id ?? raw.source_path ?? raw.sample_path;
  const stableSample = raw.sample_id ?? raw.record_id ?? raw.source_path ?? raw.sample_path;
  const sourceRecordId = boundedText(stableSource ?? `${benchmark}:${domain}:${index}`, `record_id:${index}`, 320);
  const sample = boundedText(stableSample ?? `${benchmark}:${domain}:${index}`, `sample_id:${index}`, 320);
  const group = boundedText(raw.group_id ?? `${benchmark}:${domain}:${sample}`, `group_id:${index}`, 400);
  const latencyRaw = raw.latency_ms ?? raw.latencyMs;
  const latencyMs = latencyRaw === undefined || latencyRaw === null ? null : parseNumber(latencyRaw, `latency_ms:${index}`, Number.MAX_SAFE_INTEGER);
  const sourceSampleId = `${options.datasetId}:${sourceRecordId}`;
  return {
    recordId: sourceSampleId,
    sampleId: `${options.datasetId}:${sample}`,
    detectorId: options.detectorId,
    partition: partitionFor(group, options),
    label: raw.label === 1 ? "ai_generated" : "real",
    score,
    subgroup: `${benchmark}/${domain}`,
    generator: typeof raw.generator === "string" && raw.generator.trim() ? boundedText(raw.generator, `generator:${index}`, 160) : domain,
    transformation: normalizedTransformation(raw),
    latencyMs,
  };
}

function build(options: BuildOptions): { records: ModelEvaluationRecord[]; metadata: Record<string, unknown> } {
  const seen = new Map<string, ModelEvaluationRecord>();
  const records: ModelEvaluationRecord[] = [];
  const sharedAssetDuplicates: string[] = [];
  const sourceDigests: Array<{ path: string; sha256: string; bytes: number }> = [];
  for (const input of options.inputs) {
    const stat = statSync(input);
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error(`INVALID_MODEL_PREDICTION_INPUT:${input}`);
    sourceDigests.push({ path: input, sha256: inputDigest(input), bytes: stat.size });
    const lines = readFileSync(input, "utf8").split("\n");
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
      const line = lines[lineNumber].trim();
      if (!line) continue;
      const record = recordFrom(parseLine(line, input, lineNumber + 1), records.length, options);
      const existing = seen.get(record.recordId);
      if (existing) {
        if (existing.label !== record.label) throw new Error(`INVALID_MODEL_PREDICTION:conflicting_duplicate:${record.recordId}`);
        if (!options.deduplicateSharedAssets) throw new Error(`INVALID_MODEL_PREDICTION:duplicate:${record.recordId}`);
        sharedAssetDuplicates.push(record.recordId);
        continue;
      }
      seen.set(record.recordId, record);
      records.push(record);
    }
  }
  if (!records.length) throw new Error("INVALID_MODEL_PREDICTION:empty");
  const calibration = records.filter((record) => record.partition === "calibration").length;
  const evaluation = records.length - calibration;
  const manifest = datasetManifestMetadata(options.datasetManifest);
  const eligibilityReasons = [
    "Records are an imported evaluation replay; untouched holdout, deployment calibration, and model approval remain external gates.",
    ...(manifest ? [`dataset_manifest:${manifest.rightsPolicy === "commercial_cleared" ? "rights_policy_declared" : "rights_policy_not_commercial_cleared"}`] : ["dataset_manifest_not_attached"]),
  ];
  return {
    records,
    metadata: {
      schemaVersion: "model-evaluation-records-build.v1",
      generatedAt: new Date().toISOString(),
      datasetId: options.datasetId,
      detectorId: options.detectorId,
      datasetManifest: manifest,
      inputs: sourceDigests,
      records: records.length,
      calibration,
      evaluation,
      calibrationPercent: options.calibrationPercent,
      splitUnit: "content_group_hash",
      splitSalt: options.salt,
      deduplicatedSharedAssets: options.deduplicateSharedAssets,
      sharedAssetDuplicateCount: sharedAssetDuplicates.length,
      sharedAssetDuplicateIds: sharedAssetDuplicates.slice(0, 200),
      productionGateEligible: false,
      productionGateReason: eligibilityReasons.join(" "),
    },
  };
}

const options = parseOptions(process.argv.slice(2));
try {
  const result = build(options);
  writeFileSync(options.output, `${JSON.stringify(result.records, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(`${options.output}.meta.json`, `${JSON.stringify(result.metadata, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(result.metadata, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
