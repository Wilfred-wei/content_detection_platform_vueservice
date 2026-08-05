import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AnalysisService } from "../src/analysis-service.js";
import { AnalysisStore } from "../src/analysis-store.js";
import { ANALYSIS_SCHEMA_VERSION, type EvidenceRecord } from "../src/analysis-types.js";
import type { C2paInspector } from "../src/c2pa-inspector.js";
import {
  ACTIVE_DIRECT_EVIDENCE_POLICY,
  type DirectEvidencePolicy,
} from "../src/direct-evidence-policy.js";
import type { ExplanationVerifier } from "../src/explanation-verifier.js";
import { deterministicFallbackExplanation } from "../src/explanation-policy.js";
import type { MetadataInspector } from "../src/metadata-inspector.js";
import { MODEL_DETECTOR_PROTOCOL_VERSION, type ModelDetector } from "../src/model-detector.js";
import type { ReportSynthesizer } from "../src/report-synthesizer.js";
import type { WatermarkInspector } from "../src/watermark-adapters.js";
import {
  resolveProvenanceShortCircuit,
  type ProvenanceShortCircuitResolver,
} from "../src/provenance-registry.js";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const synthesizer: ReportSynthesizer = {
  async synthesize(input) {
    return {
      text: deterministicFallbackExplanation(input.decision, input.evidence),
      provider: "test-provider",
      model: "test-model",
      generatedAt: "2026-08-02T00:00:00.000Z",
    };
  },
};

const verifier: ExplanationVerifier = {
  async verify() {
    return {
      provider: "test-verifier",
      model: "test-verifier-model",
      checks: ([
        ["positive", "semantic_positive", "YES"],
        ["inverse", "semantic_inverse", "NO"],
        ["paraphrase", "semantic_paraphrase", "YES"],
        ["forced_choice", "semantic_forced_choice", "ALIGNED"],
      ] as const).map(([id, method, answer]) => ({
        id: `polarity_${id}`,
        passed: true,
        outcome: "supported" as const,
        method,
        detail: "supported",
        answer,
      })),
    };
  },
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function completed(service: AnalysisService, id: string) {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const analysis = service.get(id);
    if (["completed", "failed"].includes(analysis.state)) return analysis;
    await delay(5);
  }
  throw new Error("analysis did not finish");
}

function metadataInspector(waitMs = 0): MetadataInspector {
  return {
    async inspect() {
      await delay(waitMs);
      return {
        outcome: "absent",
        segments: { exif: false, xmp: false, iptc: false },
        fieldCount: 0,
        traversalTruncated: false,
        gpsExcluded: true,
        aigc: { outcome: "absent", markerCount: 0, authenticated: false, violationCount: 0 },
      };
    },
  };
}

function evidence(
  analysisId: string,
  source: string,
  aiOrigin: boolean | null,
  status: EvidenceRecord["status"] = "not_detected",
  strength: EvidenceRecord["strength"] = "none",
): EvidenceRecord {
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: `${source}-evidence`,
    analysisId,
    category: "watermark",
    source,
    status,
    strength,
    summary: `${source} result`,
    facts: aiOrigin === null
      ? { schemeId: source, detectionAttempted: true, absenceEstablished: true }
      : { schemeId: source, provenanceVerified: true, aiOrigin, detectionAttempted: true },
    createdAt: "2026-08-02T00:00:00.000Z",
  };
}

function createService(
  c2pa: C2paInspector,
  metadata: MetadataInspector,
  watermarks: WatermarkInspector,
  model: ModelDetector,
  policy: DirectEvidencePolicy = ACTIVE_DIRECT_EVIDENCE_POLICY,
  gateResolver: ProvenanceShortCircuitResolver = resolveProvenanceShortCircuit,
) {
  return new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "direct-evidence-routing-"))),
    1024 * 1024,
    synthesizer,
    verifier,
    c2pa,
    metadata,
    watermarks,
    undefined,
    undefined,
    model,
    policy,
    gateResolver,
  );
}

const approvedTestGate: ProvenanceShortCircuitResolver = (schemeId) => ({
  schemeId,
  gateId: `approved-test-gate:${schemeId}`,
  gateRegistryVersion: "test-gates-v1",
  passed: true,
  eligible: true,
  reasons: [],
});

test("waits for the direct-evidence barrier and short-circuits models independently of collector completion order", async () => {
  let modelCalls = 0;
  const c2pa: C2paInspector = {
    async inspect() {
      await delay(30);
      return {
        outcome: "valid_trusted",
        validationState: "Trusted",
        issuer: "Test Issuer",
        aiOrigin: true,
        validationStatusCount: 0,
      };
    },
  };
  const watermarks: WatermarkInspector = {
    async inspect(analysisId) {
      await delay(2);
      return [evidence(analysisId, "test-watermark", null)];
    },
  };
  const model: ModelDetector = {
    id: "must-not-run",
    enabled: true,
    async detect() {
      modelCalls += 1;
      throw new Error("MODEL_SHOULD_HAVE_BEEN_SHORT_CIRCUITED");
    },
  };
  const service = createService(c2pa, metadataInspector(1), watermarks, model, ACTIVE_DIRECT_EVIDENCE_POLICY, approvedTestGate);
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.state, "completed");
  assert.equal(modelCalls, 0);
  assert.equal(analysis.decision?.verdict, "AI_GENERATED");
  assert.equal(analysis.stages.find((stage) => stage.id === "model_detection")?.state, "skipped");
  assert.equal(analysis.directEvidencePolicyVersion, ACTIVE_DIRECT_EVIDENCE_POLICY.policyVersion);
  assert.equal(analysis.report?.directEvidencePolicyVersion, ACTIVE_DIRECT_EVIDENCE_POLICY.policyVersion);
  const c2paIndex = analysis.evidence.findIndex((item) => item.source === "c2pa");
  const watermarkIndex = analysis.evidence.findIndex((item) => item.source === "test-watermark");
  const metadataIndex = analysis.evidence.findIndex((item) => item.source === "gb-45438-2025");
  assert.ok(c2paIndex >= 0 && c2paIndex < watermarkIndex && watermarkIndex < metadataIndex);
  assert.equal(analysis.evidence[c2paIndex]?.facts.completionBarrier, "all_scheduled_terminal");
});

test("preserves conflicting verified origins and prohibits provenance short-circuiting", async () => {
  let modelCalls = 0;
  const c2pa: C2paInspector = {
    async inspect() {
      return { outcome: "valid_trusted", validationState: "Trusted", issuer: "AI Issuer", aiOrigin: true, validationStatusCount: 0 };
    },
  };
  const watermarks: WatermarkInspector = {
    async inspect(analysisId) {
      return [evidence(analysisId, "verified-camera-origin", false, "verified_present", "strong")];
    },
  };
  const model: ModelDetector = {
    id: "conflict-followup-model",
    enabled: true,
    async detect() {
      modelCalls += 1;
      return {
        protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
        detectorId: "conflict-followup-model",
        detectorVersion: "test-v1",
        outcome: "detected",
        score: 0.8,
        threshold: 0.5,
        predictedClass: "ai_generated",
        latencyMs: 1,
        preprocessingId: "test-v1",
        checkpointSha256: "a".repeat(64),
        calibrationStatus: "official_threshold_unverified_for_deployment",
        diagnostics: {},
      };
    },
  };
  const service = createService(c2pa, metadataInspector(), watermarks, model, ACTIVE_DIRECT_EVIDENCE_POLICY, approvedTestGate);
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.state, "completed");
  assert.equal(modelCalls, 1);
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
  assert.match(analysis.decision?.conflicts[0] || "", /VERIFIED_ORIGIN_CONFLICT/);
  assert.notEqual(analysis.stages.find((stage) => stage.id === "model_detection")?.state, "skipped");
});

test("bounds a stalled direct-evidence collector and records a neutral terminal failure", async () => {
  const c2pa: C2paInspector = {
    async inspect() { return { outcome: "absent", validationStatusCount: 0 }; },
  };
  const watermarks: WatermarkInspector = {
    async inspect() { return new Promise<EvidenceRecord[]>(() => {}); },
  };
  const disabledModel: ModelDetector = {
    id: "disabled-model",
    enabled: false,
    async detect() { throw new Error("DISABLED_MODEL_CALLED"); },
  };
  const timeoutPolicy: DirectEvidencePolicy = {
    ...ACTIVE_DIRECT_EVIDENCE_POLICY,
    policyVersion: "direct-evidence-timeout-test-v1",
    collectorDeadlineMs: 15,
  };
  const service = createService(c2pa, metadataInspector(), watermarks, disabledModel, timeoutPolicy);
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);
  const timeoutEvidence = analysis.evidence.find((item) => item.source === "direct-evidence-barrier:registered-watermarks");

  assert.equal(analysis.state, "completed");
  assert.equal(timeoutEvidence?.status, "error");
  assert.equal(timeoutEvidence?.facts.absenceEstablished, false);
  assert.equal(timeoutEvidence?.facts.errorCode, "DIRECT_EVIDENCE_COLLECTOR_TIMEOUT");
  assert.equal(timeoutEvidence?.facts.directEvidencePolicyVersion, timeoutPolicy.policyVersion);
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
  assert.equal(analysis.decision?.modelCoverage, "policy_disabled");
});

test("does not short-circuit on a cryptographically valid result before its production gate passes", async () => {
  let modelCalls = 0;
  const c2pa: C2paInspector = {
    async inspect() {
      return { outcome: "valid_trusted", validationState: "Trusted", issuer: "Test Issuer", aiOrigin: true, validationStatusCount: 0 };
    },
  };
  const watermarks: WatermarkInspector = { async inspect() { return []; } };
  const model: ModelDetector = {
    id: "gate-followup-model",
    enabled: true,
    async detect() {
      modelCalls += 1;
      return {
        protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
        detectorId: "gate-followup-model",
        detectorVersion: "test-v1",
        outcome: "not_detected",
        score: 0.2,
        threshold: 0.5,
        predictedClass: "likely_non_ai",
        latencyMs: 1,
        preprocessingId: "test-v1",
        checkpointSha256: "a".repeat(64),
        calibrationStatus: "official_threshold_unverified_for_deployment",
        diagnostics: {},
      };
    },
  };
  const service = createService(c2pa, metadataInspector(), watermarks, model);
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);
  const c2paEvidence = analysis.evidence.find((item) => item.source === "c2pa");

  assert.equal(analysis.state, "completed");
  assert.equal(modelCalls, 1);
  assert.equal(c2paEvidence?.status, "verified_present");
  assert.equal(c2paEvidence?.strength, "supporting");
  assert.equal(c2paEvidence?.facts.shortCircuitAuthorized, false);
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
});
