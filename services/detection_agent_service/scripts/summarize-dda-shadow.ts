import { readFile } from "node:fs/promises";

import {
  evaluateDdaShadow,
  parseDdaShadowAuditJsonl,
  parseDdaShadowTruthJsonl,
} from "../src/dda-shadow-evaluation.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`MISSING_OPTION_VALUE:${name}`);
  return value;
}

const auditPath = option("--audit");
if (!auditPath) throw new Error("USAGE: summarize-dda-shadow --audit <audit.jsonl> [--labels <truth.jsonl>]");
const labelPath = option("--labels");
const audit = parseDdaShadowAuditJsonl(await readFile(auditPath, "utf8"));
const labels = labelPath ? parseDdaShadowTruthJsonl(await readFile(labelPath, "utf8")) : [];
process.stdout.write(`${JSON.stringify(evaluateDdaShadow(audit, labels), null, 2)}\n`);
