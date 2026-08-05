import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { createConfiguredWatermarkInspector } from "../src/watermark-adapters.js";
import {
  collectProvenanceObservation,
  parseProvenanceObservationCase,
} from "../src/provenance-observation-runner.js";

interface Options {
  input: string;
  output: string;
  root: string;
  generatedAt?: string;
  limit?: number;
}

function usage(): never {
  throw new Error("Usage: npm run collect:provenance-observations -- --input CASES.jsonl --root ASSET_ROOT --output OBSERVATIONS.jsonl [--generated-at ISO] [--limit N]");
}

function parseArgs(argv: string[]): Options {
  const values: Partial<Options> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !flag.startsWith("--")) usage();
    if (flag === "--input") values.input = resolve(value);
    else if (flag === "--output") values.output = resolve(value);
    else if (flag === "--root") values.root = resolve(value);
    else if (flag === "--generated-at") values.generatedAt = value;
    else if (flag === "--limit") values.limit = Number(value);
    else usage();
    index += 1;
  }
  if (!values.input || !values.output || !values.root) usage();
  if (values.generatedAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(values.generatedAt)) usage();
  if (values.limit !== undefined && (!Number.isInteger(values.limit) || values.limit < 1 || values.limit > 100_000)) usage();
  return values as Options;
}

function insideRoot(root: string, path: string): boolean {
  return !isAbsolute(path) && !relative(root, resolve(root, path)).startsWith(`..${sep}`);
}

const options = parseArgs(process.argv.slice(2));
const root = resolve(options.root);
const cases = readFileSync(options.input, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line, index) => {
    try {
      return parseProvenanceObservationCase(JSON.parse(line) as unknown);
    } catch (error) {
      throw new Error(`INVALID_PROVENANCE_OBSERVATION_CASE_JSONL:${index + 1}:${error instanceof Error ? error.message : "unknown"}`);
    }
  })
  .slice(0, options.limit);
if (cases.length === 0) throw new Error("EMPTY_PROVENANCE_OBSERVATION_CASES");
if (new Set(cases.map((item) => item.recordId)).size !== cases.length) {
  throw new Error("DUPLICATE_PROVENANCE_OBSERVATION_RECORD");
}
if (new Set(cases.map((item) => item.evaluationRunId)).size !== 1
  || new Set(cases.map((item) => item.datasetManifestSha256)).size !== 1
  || new Set(cases.map((item) => item.transformationSuiteSha256)).size !== 1) {
  throw new Error("MIXED_PROVENANCE_OBSERVATION_RUN");
}

const inspector = createConfiguredWatermarkInspector();
const output: string[] = [];
for (const input of cases) {
  if (!insideRoot(root, input.assetPath)) throw new Error(`PROVENANCE_OBSERVATION_PATH_ESCAPE:${input.recordId}`);
  const absolutePath = resolve(root, input.assetPath);
  const observation = await collectProvenanceObservation(input, { absolutePath, inspector, generatedAt: options.generatedAt });
  output.push(JSON.stringify(observation));
}
writeFileSync(options.output, `${output.join("\n")}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ cases: output.length, output: options.output, sequential: true }, null, 2)}\n`);
