import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import type { EvidenceRecord, MediaAsset } from "./analysis-types.js";
import { inspectImage } from "./image-inspection.js";
import type {
  ProvenanceEvaluationOutcome,
  ProvenanceEvaluationPartition,
  ProvenanceEvaluationLabel,
  ProvenanceSchemeObservation,
  ProvenanceTransformationCategory,
} from "./provenance-scheme-evaluation.js";
import { getProvenanceScheme } from "./provenance-registry.js";
import type { WatermarkInspector } from "./watermark-adapters.js";

export interface ProvenanceObservationCase {
  schemaVersion: "provenance-observation-case.v1";
  evaluationRunId: string;
  recordId: string;
  sampleId: string;
  assetPath: string;
  assetSha256: string;
  datasetManifestSha256: string;
  transformationSuiteSha256: string;
  schemeId: string;
  profileId: string;
  configurationId: string;
  partition: ProvenanceEvaluationPartition;
  label: ProvenanceEvaluationLabel;
  transformationId: string;
  transformationCategory: ProvenanceTransformationCategory;
  viewPolicyId: string;
}

export interface ProvenanceObservationRunOptions {
  absolutePath: string;
  inspector: WatermarkInspector;
  generatedAt?: string;
}

const HEX256 = /^[a-f0-9]{64}$/;
const PARTITIONS = new Set<ProvenanceEvaluationPartition>(["calibration", "evaluation"]);
const LABELS = new Set<ProvenanceEvaluationLabel>(["marked_positive", "unmarked_control"]);
const TRANSFORMATIONS = new Set<ProvenanceTransformationCategory>([
  "original", "resize", "recompression", "crop", "screenshot", "blur", "color_edit", "overlay",
  "metadata_removal", "forged_label", "forged_metadata", "adversarial",
]);
function text(value: unknown, field: string, maximum = 300): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`INVALID_PROVENANCE_OBSERVATION_CASE:${field}`);
  }
  return value.trim();
}

function digest(value: unknown, field: string): string {
  const normalized = text(value, field, 64).toLowerCase();
  if (!HEX256.test(normalized)) throw new Error(`INVALID_PROVENANCE_OBSERVATION_CASE:${field}`);
  return normalized;
}

export function parseProvenanceObservationCase(value: unknown): ProvenanceObservationCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_PROVENANCE_OBSERVATION_CASE:root");
  }
  const raw = value as Record<string, unknown>;
  const expected = [
    "schemaVersion", "evaluationRunId", "recordId", "sampleId", "assetPath", "assetSha256",
    "datasetManifestSha256", "transformationSuiteSha256", "schemeId", "profileId", "configurationId",
    "partition", "label", "transformationId", "transformationCategory", "viewPolicyId",
  ].sort();
  const actual = Object.keys(raw).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error("INVALID_PROVENANCE_OBSERVATION_CASE:fields");
  }
  const partition = raw.partition;
  const label = raw.label;
  const transformationCategory = raw.transformationCategory;
  if (!PARTITIONS.has(partition as ProvenanceEvaluationPartition)) throw new Error("INVALID_PROVENANCE_OBSERVATION_CASE:partition");
  if (!LABELS.has(label as ProvenanceEvaluationLabel)) throw new Error("INVALID_PROVENANCE_OBSERVATION_CASE:label");
  if (!TRANSFORMATIONS.has(transformationCategory as ProvenanceTransformationCategory)) {
    throw new Error("INVALID_PROVENANCE_OBSERVATION_CASE:transformationCategory");
  }
  const schemeId = text(raw.schemeId, "schemeId", 160);
  const scheme = getProvenanceScheme(schemeId);
  if (!scheme) throw new Error("INVALID_PROVENANCE_OBSERVATION_CASE:schemeId");
  const profileId = text(raw.profileId, "profileId", 160);
  const profileMatches = scheme.execution.profiles.length === 0
    ? profileId === "scheme-default"
    : scheme.execution.profiles.some((profile) => profile.id === profileId);
  if (!profileMatches) {
    throw new Error("INVALID_PROVENANCE_OBSERVATION_CASE:profileId");
  }
  const assetPath = text(raw.assetPath, "assetPath", 1_000).replaceAll("\\", "/");
  if (assetPath.startsWith("/") || assetPath.split("/").includes("..")) {
    throw new Error("INVALID_PROVENANCE_OBSERVATION_CASE:assetPath");
  }
  return {
    schemaVersion: "provenance-observation-case.v1",
    evaluationRunId: text(raw.evaluationRunId, "evaluationRunId", 160),
    recordId: text(raw.recordId, "recordId", 200),
    sampleId: text(raw.sampleId, "sampleId", 200),
    assetPath,
    assetSha256: digest(raw.assetSha256, "assetSha256"),
    datasetManifestSha256: digest(raw.datasetManifestSha256, "datasetManifestSha256"),
    transformationSuiteSha256: digest(raw.transformationSuiteSha256, "transformationSuiteSha256"),
    schemeId,
    profileId,
    configurationId: text(raw.configurationId, "configurationId", 160),
    partition: partition as ProvenanceEvaluationPartition,
    label: label as ProvenanceEvaluationLabel,
    transformationId: text(raw.transformationId, "transformationId", 160),
    transformationCategory: transformationCategory as ProvenanceTransformationCategory,
    viewPolicyId: text(raw.viewPolicyId, "viewPolicyId", 160),
  };
}

function stringFact(evidence: EvidenceRecord, field: string): string | undefined {
  const value = evidence.facts[field];
  return typeof value === "string" ? value : undefined;
}

function numberFact(evidence: EvidenceRecord, field: string): number | null {
  const value = evidence.facts[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function outcomeFromEvidence(evidence: EvidenceRecord): ProvenanceEvaluationOutcome {
  const value = stringFact(evidence, "outcome");
  if (value === "verified_present" || value === "possibly_present") return "positive";
  if (value === "not_detected") return "negative";
  if (value === "detector_unavailable") return "unavailable";
  if (value === "unsupported_format") return "unsupported";
  if (value === "timeout") return "timeout";
  if (value === "error") return "error";
  throw new Error("INVALID_PROVENANCE_OBSERVATION_RESULT:outcome");
}

function failedObservation(
  input: ProvenanceObservationCase,
  generatedAt: string,
  outcome: ProvenanceEvaluationOutcome,
  latencyMs: number,
  cpuTimeMs = latencyMs,
): ProvenanceSchemeObservation {
  return {
    schemaVersion: "provenance-scheme-observation.v1",
    evaluationRunId: input.evaluationRunId,
    recordId: input.recordId,
    sampleId: input.sampleId,
    assetSha256: input.assetSha256,
    datasetManifestSha256: input.datasetManifestSha256,
    transformationSuiteSha256: input.transformationSuiteSha256,
    schemeId: input.schemeId,
    profileId: input.profileId,
    configurationId: input.configurationId,
    partition: input.partition,
    label: input.label,
    transformationId: input.transformationId,
    transformationCategory: input.transformationCategory,
    viewPolicyId: input.viewPolicyId,
    attemptedViews: 0,
    detection: { outcome, positive: null, score: null, threshold: null },
    performance: { latencyMs, cpuTimeMs, peakRssBytes: process.memoryUsage().rss, gpuTimeMs: null, peakGpuMemoryBytes: null },
  };
}

export async function collectProvenanceObservation(
  input: ProvenanceObservationCase,
  options: ProvenanceObservationRunOptions,
): Promise<ProvenanceSchemeObservation> {
  const startedAt = process.hrtime.bigint();
  const cpuStarted = process.resourceUsage();
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const bytes = readFileSync(options.absolutePath);
  if (createHash("sha256").update(bytes).digest("hex") !== input.assetSha256) {
    throw new Error(`PROVENANCE_OBSERVATION_ASSET_DIGEST_MISMATCH:${input.recordId}`);
  }
  let facts;
  try {
    facts = inspectImage(bytes);
  } catch {
    return failedObservation(input, generatedAt, "unsupported", elapsedMs(startedAt), cpuElapsedMs(cpuStarted));
  }
  const asset: MediaAsset = {
    schemaVersion: "1.17.0",
    id: input.sampleId,
    filename: basename(options.absolutePath),
    mimeType: facts.mimeType,
    sizeBytes: bytes.length,
    sha256: input.assetSha256,
    width: facts.width,
    height: facts.height,
    storedPath: options.absolutePath,
    createdAt: generatedAt,
  };
  try {
    const evidence = (await options.inspector.inspect(input.evaluationRunId, asset, generatedAt))
      .find((record) => record.source === input.schemeId);
    if (!evidence) return failedObservation(input, generatedAt, "unavailable", elapsedMs(startedAt));
    const outcome = outcomeFromEvidence(evidence);
    const attemptedViews = numberFact(evidence, "attemptedViews") ?? 0;
    const latencyMs = numberFact(evidence, "latencyMs") ?? elapsedMs(startedAt);
    const score = numberFact(evidence, "score");
    const threshold = numberFact(evidence, "threshold");
    return {
      schemaVersion: "provenance-scheme-observation.v1",
      evaluationRunId: input.evaluationRunId,
      recordId: input.recordId,
      sampleId: input.sampleId,
      assetSha256: input.assetSha256,
      datasetManifestSha256: input.datasetManifestSha256,
      transformationSuiteSha256: input.transformationSuiteSha256,
      schemeId: input.schemeId,
      profileId: input.profileId,
      configurationId: input.configurationId,
      partition: input.partition,
      label: input.label,
      transformationId: input.transformationId,
      transformationCategory: input.transformationCategory,
      viewPolicyId: input.viewPolicyId,
      attemptedViews,
      detection: {
        outcome,
        positive: outcome === "positive" ? true : outcome === "negative" ? false : null,
        score,
        threshold,
      },
      performance: {
        latencyMs,
        cpuTimeMs: cpuElapsedMs(cpuStarted),
        peakRssBytes: process.memoryUsage().rss,
        gpuTimeMs: null,
        peakGpuMemoryBytes: null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const outcome: ProvenanceEvaluationOutcome = message === "WORKER_TIMEOUT"
      ? "timeout"
      : message.startsWith("WORKER_UNAVAILABLE") || message.startsWith("WORKER_EXIT")
        ? "unavailable"
        : "error";
    return failedObservation(input, generatedAt, outcome, elapsedMs(startedAt), cpuElapsedMs(cpuStarted));
  }
}

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function cpuElapsedMs(started: NodeJS.ResourceUsage): number {
  const current = process.resourceUsage();
  return (current.userCPUTime - started.userCPUTime + current.systemCPUTime - started.systemCPUTime) / 1_000;
}
