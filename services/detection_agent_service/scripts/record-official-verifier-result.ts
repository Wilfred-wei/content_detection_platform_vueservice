import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  appendManualOfficialVerifierRecord,
  createManualOfficialVerifierRecord,
} from "../src/manual-official-verifier-evaluation.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`MISSING_OPTION_VALUE:${name}`);
  return value;
}

const inputPath = option("--input");
const outputPath = option("--output");
if (!inputPath || !outputPath) {
  throw new Error("USAGE: record-official-verifier-result --input <owned-sample-result.json> --output <evaluation-manifest.jsonl>");
}

let input: unknown;
try {
  input = JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown;
} catch (error) {
  throw new Error(`INVALID_MANUAL_OFFICIAL_VERIFIER_INPUT:${error instanceof Error ? error.message : "unknown"}`);
}

const record = createManualOfficialVerifierRecord(input);
await appendManualOfficialVerifierRecord(resolve(outputPath), record);
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
