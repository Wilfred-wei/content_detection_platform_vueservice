import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evaluateForensicPromotion,
  parseForensicEvaluationManifest,
  parseForensicEvaluationPolicy,
  parseForensicEvaluationRun,
} from "../src/forensic-evaluation.js";

interface Paths {
  policy: string;
  manifest: string;
  results: string;
}

function parseArgs(argv: string[]): Paths {
  const paths: Paths = {
    policy: "resources/forensic-evaluation-policy.v1.json",
    manifest: "resources/forensic-evaluation-slice.v1.json",
    results: "resources/forensic-evaluation-run.pending.v1.json",
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--policy", "--manifest", "--results"].includes(flag)) {
      throw new Error("USAGE: npm run evaluate:forensic -- [--policy PATH] [--manifest PATH] [--results PATH]");
    }
    paths[flag.slice(2) as keyof Paths] = value;
  }
  return paths;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function main(): Promise<void> {
  const paths = parseArgs(process.argv.slice(2));
  const [policyInput, manifestInput, runInput] = await Promise.all([
    readJson(paths.policy),
    readJson(paths.manifest),
    readJson(paths.results),
  ]);
  const report = evaluateForensicPromotion(
    parseForensicEvaluationPolicy(policyInput),
    parseForensicEvaluationManifest(manifestInput),
    parseForensicEvaluationRun(runInput),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "promotable") process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "UNKNOWN_EVALUATION_ERROR";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
