import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateModelRecords, parseModelEvaluationRecords } from "../src/model-evaluation.js";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run evaluate:models -- <records.json> [report.json]");
  process.exitCode = 2;
} else {
  const records = parseModelEvaluationRecords(JSON.parse(readFileSync(resolve(inputPath), "utf8")));
  const policyPath = resolve(process.cwd(), "resources/model-evaluation-policy.v1.json");
  const policy = JSON.parse(readFileSync(policyPath, "utf8")) as {
    targetFalsePositiveRate: number;
    minimumCalibrationControls: number;
    minimumEvaluationSamples: number;
    abstentionMargin: number;
    productionGate: NonNullable<Parameters<typeof evaluateModelRecords>[1]>["productionGate"];
  };
  const report = evaluateModelRecords(records, policy);
  const sourceMetadataPath = `${resolve(inputPath)}.meta.json`;
  if (!existsSync(sourceMetadataPath)) {
    report.promotable = false;
    report.promotionReasons.push("input_manifest_metadata_missing");
  } else {
    const sourceMetadata = JSON.parse(readFileSync(sourceMetadataPath, "utf8")) as { productionGateEligible?: unknown };
    if (sourceMetadata.productionGateEligible !== true) {
      report.promotable = false;
      report.promotionReasons.push("input_manifest_not_production_eligible");
    }
  }
  const output = JSON.stringify(report, null, 2);
  if (process.argv[3]) writeFileSync(resolve(process.argv[3]), `${output}\n`, { mode: 0o600 });
  else console.log(output);
  if (!report.promotable) process.exitCode = 3;
}
