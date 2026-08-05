import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { loadConfig } from "../src/config.js";
import { DdaModelDetector, DdaShadowModelDetector } from "../src/dda-model-detector.js";
import { evaluateDdaShadow, parseDdaShadowAuditJsonl, type DdaShadowTruthRecord } from "../src/dda-shadow-evaluation.js";
import { imageMimeType, parseDdaReplaySourceManifest, selectBalancedDdaReplay } from "../src/dda-shadow-replay.js";
import type { MediaAsset } from "../src/analysis-types.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`MISSING_OPTION_VALUE:${name}`);
  return value;
}

function integerOption(name: string, fallback: number): number {
  const raw = option(name);
  const value = raw === undefined ? fallback : Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`INVALID_OPTION:${name}`);
  return value;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function digest(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

const sourceManifestPath = option("--manifest");
const outputDirectoryOption = option("--output-dir");
if (!sourceManifestPath || !outputDirectoryOption) {
  throw new Error("USAGE: replay-dda-shadow --manifest <source.jsonl> --output-dir <new-dir> [--domains N] [--per-class N] [--seed N] [--baseline-device cuda:N] [--candidate-device cuda:N]");
}
const outputDirectory = resolve(outputDirectoryOption);
if (await exists(outputDirectory)) throw new Error(`DDA_REPLAY_OUTPUT_EXISTS:${outputDirectory}`);
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

const seed = integerOption("--seed", 3521);
const maxDomains = integerOption("--domains", 16);
const perClass = integerOption("--per-class", 1);
const sourceRaw = await readFile(sourceManifestPath, "utf8");
const sourceRecords = parseDdaReplaySourceManifest(sourceRaw);
const selection = selectBalancedDdaReplay(sourceRecords, { seed, maxDomains, perClass });
const config = loadConfig();
if (!config.dda.enabled || !config.ddaShadow.enabled) throw new Error("DDA_REPLAY_REQUIRES_ENABLED_BASELINE_AND_SHADOW");

const baselineConfig = { ...config.dda, device: option("--baseline-device") || config.dda.device };
const candidateConfig = { ...config.ddaShadow.candidate, device: option("--candidate-device") || config.ddaShadow.candidate.device };
const auditPath = join(outputDirectory, "audit.jsonl");
const shadowConfig = { ...config.ddaShadow, candidate: candidateConfig, auditLogPath: auditPath };
const detector = new DdaShadowModelDetector(
  new DdaModelDetector(baselineConfig),
  new DdaModelDetector(candidateConfig),
  shadowConfig,
);

const truthBySha = new Map<string, DdaShadowTruthRecord>();
const selectedArtifacts: Array<Record<string, unknown>> = [];
try {
  for (const [index, selected] of selection.entries()) {
    const bytes = await readFile(selected.samplePath);
    const assetSha256 = digest(bytes);
    const truth: DdaShadowTruthRecord = {
      assetSha256,
      label: selected.label === 1 ? "ai_generated" : "non_ai",
      subgroup: selected.subgroup,
    };
    const prior = truthBySha.get(assetSha256);
    if (prior && (prior.label !== truth.label || prior.subgroup !== truth.subgroup)) {
      throw new Error(`DDA_REPLAY_SOURCE_LABEL_CONFLICT:${assetSha256}`);
    }
    truthBySha.set(assetSha256, truth);
    const asset: MediaAsset = {
      schemaVersion: "1.16.0",
      id: randomUUID(),
      filename: basename(selected.samplePath),
      mimeType: imageMimeType(selected.samplePath),
      sizeBytes: bytes.length,
      sha256: assetSha256,
      storedPath: selected.samplePath,
      createdAt: new Date().toISOString(),
    };
    const baseline = await detector.detect(asset);
    await detector.drainAudit();
    selectedArtifacts.push({
      index,
      samplePath: selected.samplePath,
      assetSha256,
      label: truth.label,
      subgroup: selected.subgroup,
      baselineScore: baseline.score,
      baselineDirection: baseline.predictedClass,
    });
    process.stderr.write(`[dda-shadow-replay] ${index + 1}/${selection.length} ${selected.subgroup} ${truth.label} c0=${baseline.score?.toFixed(4) ?? "unavailable"}\n`);
  }
} finally {
  detector.close();
}

const truths = [...truthBySha.values()];
const truthJsonl = `${truths.map((record) => JSON.stringify(record)).join("\n")}\n`;
const selectionJsonl = `${selectedArtifacts.map((record) => JSON.stringify(record)).join("\n")}\n`;
await writeFile(join(outputDirectory, "truth.jsonl"), truthJsonl, { encoding: "utf8", mode: 0o600 });
await writeFile(join(outputDirectory, "selection.jsonl"), selectionJsonl, { encoding: "utf8", mode: 0o600 });
const auditRaw = await readFile(auditPath, "utf8");
const report = evaluateDdaShadow(parseDdaShadowAuditJsonl(auditRaw), truths);
const reportRaw = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(join(outputDirectory, "report.json"), reportRaw, { encoding: "utf8", mode: 0o600 });

const replayManifest = {
  schemaVersion: "dda-shadow-replay.v1",
  createdAt: new Date().toISOString(),
  sourceManifest: { path: resolve(sourceManifestPath), sha256: digest(sourceRaw) },
  selection: { seed, maxDomains, perClass, records: selection.length },
  baseline: {
    detectorVersion: baselineConfig.detectorVersion,
    checkpointSha256: baselineConfig.checkpointSha256,
    device: baselineConfig.device,
  },
  candidate: {
    candidateId: shadowConfig.candidateId,
    candidateStatus: shadowConfig.candidateStatus,
    detectorVersion: candidateConfig.detectorVersion,
    checkpointSha256: candidateConfig.checkpointSha256,
    manifestSha256: shadowConfig.candidateManifestSha256,
    device: candidateConfig.device,
  },
  artifacts: {
    audit: { path: "audit.jsonl", sha256: digest(auditRaw) },
    truth: { path: "truth.jsonl", sha256: digest(truthJsonl) },
    selection: { path: "selection.jsonl", sha256: digest(selectionJsonl) },
    report: { path: "report.json", sha256: digest(reportRaw) },
  },
  promotionAuthorized: false,
  activePolicyMutated: false,
};
await writeFile(join(outputDirectory, "manifest.json"), `${JSON.stringify(replayManifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outputDirectory, report, replayManifest }, null, 2)}\n`);
