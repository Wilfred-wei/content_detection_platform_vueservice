import { resolve } from "node:path";

import {
  evaluateProvenanceSchemes,
  loadProvenanceSchemeObservationJsonl,
} from "../src/provenance-scheme-evaluation.js";

interface Arguments {
  input: string;
  generatedAt: string;
  targetFalsePositiveRate?: number;
}

function parseArguments(argv: string[]): Arguments {
  let input: string | undefined;
  let generatedAt: string | undefined;
  let targetFalsePositiveRate: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !flag.startsWith("--")) throw new Error(`INVALID_ARGUMENT:${flag}`);
    if (flag === "--input") input = resolve(value);
    else if (flag === "--generated-at") generatedAt = value;
    else if (flag === "--target-fpr") targetFalsePositiveRate = Number(value);
    else throw new Error(`UNKNOWN_ARGUMENT:${flag}`);
    index += 1;
  }
  if (!input) throw new Error("MISSING_ARGUMENT:--input");
  if (!generatedAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(generatedAt)) {
    throw new Error("INVALID_ARGUMENT:--generated-at");
  }
  if (targetFalsePositiveRate !== undefined && (!Number.isFinite(targetFalsePositiveRate) || targetFalsePositiveRate < 0 || targetFalsePositiveRate > 1)) {
    throw new Error("INVALID_ARGUMENT:--target-fpr");
  }
  return { input, generatedAt, targetFalsePositiveRate };
}

const args = parseArguments(process.argv.slice(2));
const report = evaluateProvenanceSchemes(loadProvenanceSchemeObservationJsonl(args.input), {
  generatedAt: args.generatedAt,
  targetFalsePositiveRate: args.targetFalsePositiveRate,
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
