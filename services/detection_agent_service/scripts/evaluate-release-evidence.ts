import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateExplanationPromotion,
  parseExplanationEvaluationManifest,
  parseExplanationEvaluationPolicy,
  parseExplanationEvaluationRun,
} from "../src/explanation-evaluation.js";
import {
  evaluateForensicPromotion,
  parseForensicEvaluationManifest,
  parseForensicEvaluationPolicy,
  parseForensicEvaluationRun,
} from "../src/forensic-evaluation.js";
import { parseDatasetManifest, verifyDatasetAssets } from "../src/dataset-manifest.js";
import { loadModelCandidateRegistry } from "../src/model-registry.js";
import { loadPolicyBundle, verifyPolicyBundle } from "../src/policy-bundle.js";
import {
  loadProvenanceEvaluationManifest,
  summarizeProvenanceEvaluationManifest,
  verifyProvenanceEvaluationAssets,
} from "../src/provenance-evaluation-manifest.js";
import {
  loadProvenanceReleaseGateRegistry,
  evaluateProvenanceReleaseGate,
} from "../src/provenance-release-gates.js";
import { loadProvenanceRegistry } from "../src/provenance-registry.js";
import {
  loadProvenanceTransformationSuite,
  summarizeProvenanceTransformationSuite,
  verifyProvenanceTransformationArtifacts,
} from "../src/provenance-transformation-suite.js";

type EvidenceStatus = "passed" | "blocked";

interface EvidenceCheck {
  id: string;
  status: EvidenceStatus;
  source: string;
  reasons: string[];
  facts?: Record<string, unknown>;
}

interface ReleaseEvidenceReport {
  schemaVersion: "release-evidence.v1";
  generatedAt: string;
  status: "ready" | "blocked";
  productionSwapAuthorized: false;
  automaticPolicyMutation: false;
  checks: EvidenceCheck[];
}

interface Options {
  datasetManifest: string;
  datasetRoot?: string;
  modelReport?: string;
  explanationPolicy: string;
  explanationManifest: string;
  explanationRun: string;
  forensicPolicy: string;
  forensicManifest: string;
  forensicRun: string;
  output?: string;
}

const DEFAULTS: Options = {
  datasetManifest: "resources/dataset-manifests/aigi-eval-sampled-seed3521-n64.v1.json",
  explanationPolicy: "resources/explanation-evaluation-policy.v1.json",
  explanationManifest: "resources/explanation-evaluation-slice.v1.json",
  explanationRun: "resources/explanation-evaluation-run.pending.v1.json",
  forensicPolicy: "resources/forensic-evaluation-policy.v1.json",
  forensicManifest: "resources/forensic-evaluation-slice.v1.json",
  forensicRun: "resources/forensic-evaluation-run.pending.v1.json",
};

function usage(): never {
  throw new Error(
    "Usage: npm run evaluate:release-evidence -- [--dataset-manifest PATH] [--dataset-root PATH] [--model-report PATH] [--output PATH]",
  );
}

function parseArgs(argv: readonly string[]): Options {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) usage();
    switch (flag) {
      case "--dataset-manifest": options.datasetManifest = value; break;
      case "--dataset-root": options.datasetRoot = value; break;
      case "--model-report": options.modelReport = value; break;
      case "--output": options.output = value; break;
      default: usage();
    }
    index += 1;
  }
  return options;
}

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
}

function check(id: string, source: string, status: EvidenceStatus, reasons: string[] = [], facts?: Record<string, unknown>): EvidenceCheck {
  return { id, source, status, reasons, ...(facts ? { facts } : {}) };
}

function evaluateDataset(options: Options): EvidenceCheck {
  const path = resolve(options.datasetManifest);
  try {
    const manifest = parseDatasetManifest(readJson(path));
    const assetVerification = options.datasetRoot ? verifyDatasetAssets(manifest, options.datasetRoot) : null;
    const roles = { owned: 0, held_out: 0, unknown: 0, none: 0 };
    for (const sample of manifest.samples) {
      const role = sample.label === "real" ? "none" : sample.generatorRole || "unknown";
      roles[role] += 1;
    }
    const reasons: string[] = [];
    if (manifest.rightsPolicy !== "commercial_cleared") reasons.push("dataset_rights_not_commercial_cleared");
    if (roles.owned === 0) reasons.push("owned_generator_coverage_missing");
    if (roles.held_out === 0) reasons.push("held_out_generator_coverage_missing");
    if (roles.unknown > 0) reasons.push(`generator_roles_unknown:${roles.unknown}`);
    return check(
      "dataset_manifest",
      path,
      reasons.length === 0 ? "passed" : "blocked",
      reasons,
      {
        manifestId: manifest.manifestId,
        revision: manifest.revision,
        rightsPolicy: manifest.rightsPolicy,
        samples: manifest.samples.length,
        roles,
        sha256: fileSha256(path),
        assetDigestsVerified: Boolean(options.datasetRoot),
        resolution: assetVerification?.resolution ?? null,
        resolutionByLabel: assetVerification?.byLabel ?? null,
      },
    );
  } catch (error) {
    return check("dataset_manifest", path, "blocked", [error instanceof Error ? error.message : String(error)]);
  }
}

function evaluateModel(options: Options): EvidenceCheck {
  if (!options.modelReport) {
    return check("model_evaluation", "--model-report", "blocked", ["model_report_not_supplied"]);
  }
  const path = resolve(options.modelReport);
  try {
    const report = readJson(path) as Record<string, unknown>;
    const reasons = report.promotable === true ? [] : ["model_report_not_promotable"];
    return check("model_evaluation", path, reasons.length === 0 ? "passed" : "blocked", reasons, {
      reportSha256: fileSha256(path),
      promotable: report.promotable === true,
      promotionReasons: Array.isArray(report.promotionReasons) ? report.promotionReasons : [],
      detectorIds: Array.isArray(report.detectorIds) ? report.detectorIds : [],
      fixedFpr: report.fixedFpr ?? null,
      confusion: report.confusion ?? null,
    });
  } catch (error) {
    return check("model_evaluation", path, "blocked", [error instanceof Error ? error.message : String(error)]);
  }
}

function evaluateProvenance(): EvidenceCheck {
  try {
    const manifest = loadProvenanceEvaluationManifest();
    verifyProvenanceEvaluationAssets(manifest);
    const suite = loadProvenanceTransformationSuite();
    verifyProvenanceTransformationArtifacts(suite);
    const registry = loadProvenanceRegistry();
    const gates = loadProvenanceReleaseGateRegistry();
    const gateResults = registry.schemes
      .filter((scheme) => scheme.shortCircuit.policy !== "prohibited")
      .map((scheme) => ({ schemeId: scheme.id, ...evaluateProvenanceReleaseGate(scheme, registry.registryVersion, gates) }));
    const reasons = gateResults.flatMap((result) => result.reasons.map((reason) => `${result.schemeId}:${reason}`));
    const manifestSummary = summarizeProvenanceEvaluationManifest(manifest);
    const suiteSummary = summarizeProvenanceTransformationSuite(suite);
    return check(
      "provenance_short_circuit",
      "resources/provenance-evaluation-manifest.v1.json + resources/provenance-transformation-suite.v1.json",
      reasons.length === 0 && manifestSummary.releaseGateEligible && suiteSummary.releaseGateEligible ? "passed" : "blocked",
      reasons.length ? reasons : ["provenance_release_gate_incomplete"],
      {
        manifest: manifestSummary,
        transformations: suiteSummary,
        gateResults,
      },
    );
  } catch (error) {
    return check("provenance_short_circuit", "provenance registries", "blocked", [error instanceof Error ? error.message : String(error)]);
  }
}

function evaluateExplanation(options: Options): EvidenceCheck {
  const source = `${options.explanationPolicy} + ${options.explanationManifest} + ${options.explanationRun}`;
  try {
    const report = evaluateExplanationPromotion(
      parseExplanationEvaluationPolicy(readJson(options.explanationPolicy)),
      parseExplanationEvaluationManifest(readJson(options.explanationManifest)),
      parseExplanationEvaluationRun(readJson(options.explanationRun)),
    );
    return check("explanation_evaluation", source, report.status === "promotable" ? "passed" : "blocked", report.status === "promotable" ? [] : ["explanation_evaluation_not_promotable"], {
      status: report.status,
      metrics: report.metrics,
      failedChecks: report.checks.filter((item) => !item.passed).map((item) => item.id),
    });
  } catch (error) {
    return check("explanation_evaluation", source, "blocked", [error instanceof Error ? error.message : String(error)]);
  }
}

function evaluateForensic(options: Options): EvidenceCheck {
  const source = `${options.forensicPolicy} + ${options.forensicManifest} + ${options.forensicRun}`;
  try {
    const report = evaluateForensicPromotion(
      parseForensicEvaluationPolicy(readJson(options.forensicPolicy)),
      parseForensicEvaluationManifest(readJson(options.forensicManifest)),
      parseForensicEvaluationRun(readJson(options.forensicRun)),
    );
    return check("forensic_evaluation", source, report.status === "promotable" ? "passed" : "blocked", report.status === "promotable" ? [] : ["forensic_evaluation_not_promotable"], {
      status: report.status,
      metrics: report.metrics,
      failedChecks: report.checks.filter((item) => !item.passed).map((item) => item.id),
    });
  } catch (error) {
    return check("forensic_evaluation", source, "blocked", [error instanceof Error ? error.message : String(error)]);
  }
}

function evaluatePolicyBundle(): EvidenceCheck {
  try {
    const bundle = loadPolicyBundle();
    const verification = verifyPolicyBundle(bundle);
    const registry = loadModelCandidateRegistry();
    return check("policy_bundle_integrity", "resources/policy-bundle.v1.json", "passed", [], {
      ...verification,
      registryVersion: registry.registryVersion,
      candidateCount: registry.candidates.length,
      productionSwapAuthorized: false,
      automaticPolicyMutation: false,
    });
  } catch (error) {
    return check("policy_bundle_integrity", "resources/policy-bundle.v1.json", "blocked", [error instanceof Error ? error.message : String(error)]);
  }
}

function buildReport(options: Options): ReleaseEvidenceReport {
  const checks = [
    evaluatePolicyBundle(),
    evaluateDataset(options),
    evaluateModel(options),
    evaluateProvenance(),
    evaluateExplanation(options),
    evaluateForensic(options),
  ];
  return {
    schemaVersion: "release-evidence.v1",
    generatedAt: new Date().toISOString(),
    status: checks.every((item) => item.status === "passed") ? "ready" : "blocked",
    productionSwapAuthorized: false,
    automaticPolicyMutation: false,
    checks,
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  const report = buildReport(options);
  const encoded = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) writeFileSync(resolve(options.output), encoded, { mode: 0o600 });
  process.stdout.write(encoded);
  if (report.status !== "ready") process.exitCode = 3;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
