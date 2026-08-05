import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { buildDatasetManifest, type DatasetManifestBuildHeader, type DatasetSourceRecord } from "../src/dataset-manifest.js";

interface Args extends DatasetManifestBuildHeader {
  root: string;
  input: string;
  output: string;
  ownedGenerators: Set<string>;
  heldOutGenerators: Set<string>;
}

interface SampledRecord {
  benchmark: string;
  coverage?: string;
  domain: string;
  label: number;
  sample_path: string;
  split: string;
  suite?: string;
}

const RIGHTS: Record<string, { license: string; provenance: string }> = {
  AIGCDetectionBenchmark: {
    license: "Apache-2.0-dataset-card;underlying-source-terms-unverified",
    provenance: "AIGCDetectionBenchmark README license field; source image terms require separate review",
  },
  "DDA-COCO": {
    license: "Apache-2.0-dataset-card;MS-COCO-source-terms-unverified",
    provenance: "DDA-COCO README license field; MS-COCO source terms require separate review",
  },
  "DRCT-2M": {
    license: "Apache-2.0-dataset-card;MS-COCO-source-terms-unverified",
    provenance: "DRCT-2M README license field; source image and generated-image terms require separate review",
  },
  EvalGEN: {
    license: "Apache-2.0-dataset-card;generator-output-terms-unverified",
    provenance: "EvalGEN README license field; generator output terms require separate review",
  },
};

function usage(): never {
  throw new Error("USAGE: npm run build:sampled-dataset-manifest -- --root DATASET_ROOT --input manifest.jsonl --output manifest.json [--manifest-id ID] [--revision REVISION] [--owned-generators A,B] [--held-out-generators C,D]");
}

function generatorSet(value: string | undefined): Set<string> {
  return new Set((value || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function parseArgs(argv: string[]): Args {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--root", "--input", "--output", "--manifest-id", "--revision", "--created-at", "--owned-generators", "--held-out-generators"].includes(flag)) usage();
    values[flag.slice(2)] = value;
  }
  if (!values.root || !values.input || !values.output) usage();
  return {
    root: values.root,
    input: values.input,
    output: values.output,
    manifestId: values["manifest-id"] || "aigi-eval-sampled-seed3521-n64",
    revision: values.revision || "seed3521-n64-2026-08-04",
    createdAt: values["created-at"] || new Date().toISOString(),
    rightsPolicy: "research_only",
    ownedGenerators: generatorSet(values["owned-generators"]),
    heldOutGenerators: generatorSet(values["held-out-generators"]),
  };
}

function loadRecords(path: string): SampledRecord[] {
  const lines = readFileSync(resolve(path), "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("INVALID_DATASET_MANIFEST:empty_input");
  return lines.map((line, index) => {
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error(`INVALID_DATASET_MANIFEST:input_json:${index + 1}`); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`INVALID_DATASET_MANIFEST:input_record:${index + 1}`);
    const record = value as Record<string, unknown>;
    if (typeof record.benchmark !== "string" || typeof record.domain !== "string"
      || typeof record.sample_path !== "string" || ![0, 1].includes(record.label as number)) {
      throw new Error(`INVALID_DATASET_MANIFEST:input_fields:${index + 1}`);
    }
    return record as unknown as SampledRecord;
  });
}

function toSourceRecords(root: string, input: readonly SampledRecord[], options: Args): DatasetSourceRecord[] {
  const rootAbsolute = resolve(root);
  const overlap = [...options.ownedGenerators].filter((generator) => options.heldOutGenerators.has(generator));
  if (overlap.length) throw new Error(`INVALID_DATASET_MANIFEST:generator_role_overlap:${overlap.join(",")}`);
  return input.map((record, index) => {
    const samplePath = resolve(record.sample_path);
    if (!samplePath.startsWith(`${rootAbsolute}${sep}`)) throw new Error(`INVALID_DATASET_MANIFEST:path_escape:${index}`);
    const rights = RIGHTS[record.benchmark] || {
      license: "not-stated",
      provenance: "dataset README does not state a commercial license; explicit rights review is required",
    };
    const split = record.split === "fake_only" ? "test" : "evaluation";
    const generatorRole = record.label === 1
      ? options.ownedGenerators.has(record.domain) ? "owned"
        : options.heldOutGenerators.has(record.domain) ? "held_out" : "unknown"
      : undefined;
    return {
      path: relative(rootAbsolute, samplePath),
      sampleId: `${record.benchmark.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index.toString().padStart(6, "0")}`,
      split,
      label: record.label === 1 ? "ai_generated" : "real",
      domain: `${record.benchmark}/${record.domain}`,
      generator: record.label === 1 ? record.domain : null,
      generatorRole,
      sourceId: record.benchmark,
      rights: { ...rights, commercialUseAllowed: false },
    } satisfies DatasetSourceRecord;
  });
}

try {
  const options = parseArgs(process.argv.slice(2));
  const records = toSourceRecords(options.root, loadRecords(options.input), options);
  const manifest = buildDatasetManifest(options.root, records, options);
  writeFileSync(resolve(options.output), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ manifestId: manifest.manifestId, revision: manifest.revision, rightsPolicy: manifest.rightsPolicy, samples: manifest.samples.length, output: resolve(options.output) }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "INVALID_DATASET_MANIFEST"}\n`);
  process.exitCode = 1;
}
