import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateModelBundle } from "../src/model-evaluation-bundle.js";
import { parseModelEvaluationRecords } from "../src/model-evaluation.js";

const args = process.argv.slice(2);
const inputs: string[] = [];
let outputPath: string | undefined;
let minimumSharedSamples = 100;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--input" && args[index + 1]) inputs.push(args[++index]);
  else if (arg === "--output" && args[index + 1]) outputPath = args[++index];
  else if (arg === "--minimum-shared-samples" && args[index + 1]) minimumSharedSamples = Number(args[++index]);
  else throw new Error("Usage: npm run evaluate:model-bundle -- --input <records.json> [--input <records.json>] --output <report.json> [--minimum-shared-samples N]");
}
if (inputs.length === 0) throw new Error("Usage: npm run evaluate:model-bundle -- --input <records.json> [--input <records.json>] --output <report.json> [--minimum-shared-samples N]");

const policy = JSON.parse(readFileSync(resolve(process.cwd(), "resources/model-evaluation-policy.v1.json"), "utf8")) as {
  targetFalsePositiveRate: number;
  minimumCalibrationControls: number;
  minimumEvaluationSamples: number;
  abstentionMargin: number;
  productionGate: NonNullable<Parameters<typeof evaluateModelBundle>[1]>["productionGate"];
};
const recordsByDetector: Record<string, ReturnType<typeof parseModelEvaluationRecords>> = {};
const sourceEligibility: Record<string, boolean> = {};
for (const input of inputs) {
  const absolute = resolve(input);
  const records = parseModelEvaluationRecords(JSON.parse(readFileSync(absolute, "utf8")));
  const detectorIds = [...new Set(records.map((record) => record.detectorId))];
  if (detectorIds.length !== 1) throw new Error(`INVALID_MODEL_EVALUATION_BUNDLE:one_detector_per_input:${absolute}`);
  const detectorId = detectorIds[0];
  recordsByDetector[detectorId] = records;
  const metadataPath = `${absolute}.meta.json`;
  if (!existsSync(metadataPath)) sourceEligibility[detectorId] = false;
  else {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { productionGateEligible?: unknown };
    sourceEligibility[detectorId] = metadata.productionGateEligible === true;
  }
}
const report = evaluateModelBundle(recordsByDetector, { ...policy, minimumSharedSamples, sourceEligibility });
const encoded = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) writeFileSync(resolve(outputPath), encoded, { mode: 0o600 });
else console.log(encoded);
if (!report.promotable) process.exitCode = 3;
