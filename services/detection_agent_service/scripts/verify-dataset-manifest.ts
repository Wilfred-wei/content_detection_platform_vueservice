import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { parseDatasetManifest, verifyDatasetAssets, type DatasetManifest } from "../src/dataset-manifest.js";

interface Options {
  root: string;
  manifest: string;
  expectedRightsPolicy?: DatasetManifest["rightsPolicy"];
}

function usage(): never {
  throw new Error("Usage: npm run verify:dataset-manifest -- --root DATASET_ROOT --manifest manifest.json [--expected-rights-policy commercial_cleared|research_only]");
}

function parseArgs(argv: readonly string[]): Options {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--root", "--manifest", "--expected-rights-policy"].includes(flag)) usage();
    values[flag.slice(2)] = value;
  }
  if (!values.root || !values.manifest) usage();
  if (values["expected-rights-policy"] && !["commercial_cleared", "research_only"].includes(values["expected-rights-policy"])) usage();
  return {
    root: resolve(values.root),
    manifest: resolve(values.manifest),
    expectedRightsPolicy: values["expected-rights-policy"] as Options["expectedRightsPolicy"],
  };
}

function main(options: Options): void {
  const stat = statSync(options.manifest);
  if (!stat.isFile() || stat.size > 512 * 1024 * 1024) throw new Error("INVALID_DATASET_MANIFEST_INPUT:manifest");
  const bytes = readFileSync(options.manifest);
  const manifest = parseDatasetManifest(JSON.parse(bytes.toString("utf8")));
  if (options.expectedRightsPolicy && manifest.rightsPolicy !== options.expectedRightsPolicy) {
    throw new Error(`DATASET_RIGHTS_POLICY_MISMATCH:${manifest.rightsPolicy}:${options.expectedRightsPolicy}`);
  }
  const assetVerification = verifyDatasetAssets(manifest, options.root);
  const splitCounts: Record<string, number> = {};
  const labelCounts: Record<string, number> = {};
  const generatorRoles: Record<string, number> = {};
  const sourceIds = new Set<string>();
  for (const sample of manifest.samples) {
    splitCounts[sample.split] = (splitCounts[sample.split] || 0) + 1;
    labelCounts[sample.label] = (labelCounts[sample.label] || 0) + 1;
    const role = sample.generatorRole || "none";
    generatorRoles[role] = (generatorRoles[role] || 0) + 1;
    sourceIds.add(sample.sourceId);
  }
  process.stdout.write(`${JSON.stringify({
    manifestId: manifest.manifestId,
    revision: manifest.revision,
    rightsPolicy: manifest.rightsPolicy,
    manifestSha256: createHash("sha256").update(bytes).digest("hex"),
    samples: manifest.samples.length,
    sourceIds: sourceIds.size,
    splitCounts,
    labelCounts,
    generatorRoles,
    verifiedAssetDigests: true,
    resolution: assetVerification.resolution,
    resolutionByLabel: assetVerification.byLabel,
  }, null, 2)}\n`);
}

try {
  main(parseArgs(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
