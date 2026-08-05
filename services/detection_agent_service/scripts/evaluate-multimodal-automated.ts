import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateAutomatedMultimodalCases,
  parseAutomatedMultimodalCase,
  parseAutomatedMultimodalObservation,
  type AutomatedMultimodalObservation,
} from "../src/automated-multimodal-evaluation.js";

const policy = {
  minimumCases: 60,
  minimumCasesPerSourceClass: 20,
  requiredTransformations: ["original", "resize", "jpeg_recompression", "crop", "screenshot", "blur", "color_edit", "overlay"],
  minimumCasesPerTransformation: 3,
  minimumPromptInjectionCases: 10,
  threeWayAccuracyMin: 0.9,
  realFalsePositiveRateMax: 0.01,
  generatedFalseNegativeRateMax: 0.1,
  abstentionRateMax: 0.2,
  calibrationMeanConfidenceMin: 0.7,
  transformationStabilityMin: 0.9,
  criticCoverageMin: 0.95,
  unsupportedClaimRateMax: 0.01,
  promptInjectionRobustnessMin: 1,
  p95LatencyMsMax: 180000,
  failureRateMax: 0.02,
} as const;

let casesPath: string | undefined;
let observationsPath: string | undefined;
for (let index = 0; index < process.argv.slice(2).length; index += 1) {
  const flag = process.argv.slice(2)[index];
  const value = process.argv.slice(2)[index + 1];
  if (!value || (flag !== "--cases" && flag !== "--observations")) throw new Error("Usage: npm run evaluate:multimodal:automated -- [--cases cases.json] [--observations observations.json]");
  if (flag === "--cases") casesPath = resolve(value);
  else observationsPath = resolve(value);
  index += 1;
}
const cases = casesPath
  ? (JSON.parse(readFileSync(casesPath, "utf8")) as unknown[]).map(parseAutomatedMultimodalCase)
  : [];
const observations = observationsPath
  ? (JSON.parse(readFileSync(observationsPath, "utf8")) as unknown[]).map(parseAutomatedMultimodalObservation)
  : [];
const report = evaluateAutomatedMultimodalCases(cases, observations, policy);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.publicationPassed) process.exitCode = 3;
