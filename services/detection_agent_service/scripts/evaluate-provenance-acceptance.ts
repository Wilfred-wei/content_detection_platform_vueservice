import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateProvenanceAcceptance,
  parseProvenanceAcceptanceCase,
  parseProvenanceAcceptanceTrace,
  type ProvenanceAcceptanceCase,
  type ProvenanceAcceptanceTrace,
} from "../src/provenance-acceptance.js";
import { parseProvenanceSchemeObservation } from "../src/provenance-scheme-evaluation.js";

interface Arguments { cases: string; observations?: string; traces?: string; }

function parseArguments(argv: string[]): Arguments {
  let cases: string | undefined;
  let observations: string | undefined;
  let traces: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value) throw new Error("Usage: npm run evaluate:provenance-acceptance -- --cases <jsonl> [--observations <jsonl>] [--traces <jsonl>]");
    if (flag === "--cases") cases = resolve(value);
    else if (flag === "--observations") observations = resolve(value);
    else if (flag === "--traces") traces = resolve(value);
    else throw new Error(`UNKNOWN_ARGUMENT:${flag}`);
    index += 1;
  }
  if (!cases) throw new Error("MISSING_ARGUMENT:--cases");
  return { cases, observations, traces };
}

function jsonl<T>(path: string, parse: (value: unknown) => T): T[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    try { return parse(JSON.parse(line) as unknown); }
    catch (error) { throw new Error(`INVALID_PROVENANCE_ACCEPTANCE_JSONL:${path}:${index + 1}:${error instanceof Error ? error.message : "unknown"}`); }
  });
}

const args = parseArguments(process.argv.slice(2));
const cases: ProvenanceAcceptanceCase[] = jsonl(args.cases, parseProvenanceAcceptanceCase);
const observations = args.observations ? jsonl(args.observations, parseProvenanceSchemeObservation) : [];
const traces: ProvenanceAcceptanceTrace[] = args.traces ? jsonl(args.traces, parseProvenanceAcceptanceTrace) : [];
const report = evaluateProvenanceAcceptance(cases, observations, traces);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.acceptancePassed) process.exitCode = 3;
