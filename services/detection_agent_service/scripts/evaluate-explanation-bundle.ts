import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evaluateExplanationPromotion,
  parseExplanationEvaluationManifest,
  parseExplanationEvaluationPolicy,
  parseExplanationEvaluationRun,
} from "../src/explanation-evaluation.js";

interface Paths { policy: string; manifest: string; results: string }

function parseArgs(argv: string[]): Paths {
  const paths: Paths = {
    policy: "resources/explanation-evaluation-policy.v1.json",
    manifest: "resources/explanation-evaluation-slice.v1.json",
    results: "resources/explanation-evaluation-run.pending.v1.json",
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--policy", "--manifest", "--results"].includes(flag)) {
      throw new Error("USAGE: npm run evaluate:explanation -- [--policy PATH] [--manifest PATH] [--results PATH]");
    }
    paths[flag.slice(2) as keyof Paths] = value;
  }
  return paths;
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function main(): Promise<void> {
  const paths = parseArgs(process.argv.slice(2));
  const [policy, manifest, run] = await Promise.all([json(paths.policy), json(paths.manifest), json(paths.results)]);
  const report = evaluateExplanationPromotion(
    parseExplanationEvaluationPolicy(policy),
    parseExplanationEvaluationManifest(manifest),
    parseExplanationEvaluationRun(run),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "promotable") process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "UNKNOWN_EXPLANATION_EVALUATION_ERROR"}\n`);
  process.exitCode = 1;
});
