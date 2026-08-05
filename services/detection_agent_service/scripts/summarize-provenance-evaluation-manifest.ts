import {
  loadProvenanceEvaluationManifest,
  summarizeProvenanceEvaluationManifest,
  verifyProvenanceEvaluationAssets,
} from "../src/provenance-evaluation-manifest.js";

const manifest = loadProvenanceEvaluationManifest();
verifyProvenanceEvaluationAssets(manifest);
process.stdout.write(`${JSON.stringify(summarizeProvenanceEvaluationManifest(manifest), null, 2)}\n`);
