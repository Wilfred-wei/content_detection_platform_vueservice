import {
  loadProvenanceTransformationSuite,
  summarizeProvenanceTransformationSuite,
  verifyProvenanceTransformationArtifacts,
} from "../src/provenance-transformation-suite.js";

const suite = loadProvenanceTransformationSuite();
verifyProvenanceTransformationArtifacts(suite);
process.stdout.write(`${JSON.stringify(summarizeProvenanceTransformationSuite(suite), null, 2)}\n`);
