import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildDatasetManifest, type DatasetManifestBuildHeader, type DatasetSourceRecord } from "../src/dataset-manifest.js";

interface Args {
  root: string;
  input: string;
  output: string;
  manifestId: string;
  revision: string;
  createdAt: string;
  rightsPolicy: "commercial_cleared" | "research_only";
}

function usage(): never {
  throw new Error("USAGE: npm run build:dataset-manifest -- --root ROOT --input records.jsonl --output manifest.json [--manifest-id ID] [--revision REVISION] [--created-at ISO] [--rights-policy commercial_cleared|research_only]");
}

function args(argv: string[]): Args {
  const values: Partial<Args> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--root", "--input", "--output", "--manifest-id", "--revision", "--created-at", "--rights-policy"].includes(flag)) usage();
    values[flag.slice(2) as keyof Args] = value;
  }
  if (!values.root || !values.input || !values.output) usage();
  if (values.rightsPolicy && values.rightsPolicy !== "commercial_cleared" && values.rightsPolicy !== "research_only") usage();
  return {
    root: values.root,
    input: values.input,
    output: values.output,
    manifestId: values.manifestId || "dataset-manifest-v1",
    revision: values.revision || new Date().toISOString().slice(0, 10),
    createdAt: values.createdAt || new Date().toISOString(),
    rightsPolicy: values.rightsPolicy || "commercial_cleared",
  };
}

function loadRecords(path: string): DatasetSourceRecord[] {
  const raw = readFileSync(resolve(path), "utf8").trim();
  if (!raw) throw new Error("INVALID_DATASET_MANIFEST:empty_input");
  const parsed: unknown = raw.startsWith("[")
    ? JSON.parse(raw)
    : raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line) as unknown; } catch { throw new Error(`INVALID_DATASET_MANIFEST:input_json:${index + 1}`); }
    });
  if (!Array.isArray(parsed)) throw new Error("INVALID_DATASET_MANIFEST:input_root");
  return parsed as DatasetSourceRecord[];
}

try {
  const options = args(process.argv.slice(2));
  const manifest = buildDatasetManifest(options.root, loadRecords(options.input), options satisfies DatasetManifestBuildHeader);
  writeFileSync(resolve(options.output), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ manifestId: manifest.manifestId, revision: manifest.revision, samples: manifest.samples.length, output: resolve(options.output) }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "INVALID_DATASET_MANIFEST"}\n`);
  process.exitCode = 1;
}
