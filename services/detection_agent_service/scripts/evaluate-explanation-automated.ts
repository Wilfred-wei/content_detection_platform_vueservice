import { evaluateAutomatedExplanationSuite } from "../src/automated-explanation-evaluation.js";

const report = evaluateAutomatedExplanationSuite();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.publicationPassed) process.exitCode = 3;
