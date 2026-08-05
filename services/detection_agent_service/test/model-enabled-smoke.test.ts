import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AnalysisService } from "../src/analysis-service.js";
import { AnalysisStore } from "../src/analysis-store.js";
import { MODEL_DETECTOR_PROTOCOL_VERSION, type ModelDetector } from "../src/model-detector.js";
import type { C2paInspector } from "../src/c2pa-inspector.js";
import type { MetadataInspector } from "../src/metadata-inspector.js";
import type { WatermarkInspector } from "../src/watermark-adapters.js";
import type { ExplanationVerifier } from "../src/explanation-verifier.js";
import type { ReportSynthesizer } from "../src/report-synthesizer.js";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const c2pa: C2paInspector = { async inspect() { return { outcome: "absent", validationStatusCount: 0 }; } };
const metadata: MetadataInspector = {
  async inspect() {
    return { outcome: "absent", segments: { exif: false, xmp: false, iptc: false }, fieldCount: 0, traversalTruncated: false, gpsExcluded: true, aigc: { outcome: "absent", markerCount: 0, authenticated: false, violationCount: 0 } };
  },
};
const watermarks: WatermarkInspector = { async inspect() { return []; } };

const synthesizer: ReportSynthesizer = {
  async synthesize() {
    return { text: "当前证据不足，模型结果作为辅助信号保留。", provider: "smoke-provider", model: "smoke-model", generatedAt: "2026-08-05T00:00:00.000Z" };
  },
};
const verifier: ExplanationVerifier = {
  async verify() {
    return {
      provider: "smoke-verifier",
      model: "smoke-verifier-model",
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
        detail: "smoke-supported",
        answer,
      })),
    };
  },
};

const model: ModelDetector = {
  id: "smoke-model",
  enabled: true,
  runtimeInfo() {
    return { detectorId: "smoke-model", enabled: true, device: "cpu", residency: "process_scoped", admission: "single_slot_bounded_queue", maxQueue: 4, microbatchSize: 1, resourceClass: "cpu" };
  },
  async detect() {
    return {
      protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
      detectorId: "smoke-model",
      detectorVersion: "smoke-v1",
      outcome: "detected" as const,
      score: 0.91,
      threshold: 0.5,
      predictedClass: "ai_generated" as const,
      latencyMs: 1,
      preprocessingId: "smoke-preprocess-v1",
      checkpointSha256: "a".repeat(64),
      calibrationStatus: "official_threshold_unverified_for_deployment" as const,
      diagnostics: {},
    };
  },
};

async function completed(service: AnalysisService, id: string) {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const analysis = service.get(id);
    if (["completed", "failed"].includes(analysis.state)) return analysis;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("model smoke did not finish");
}

test("model-enabled route reaches a sealed report without making model evidence authoritative", async () => {
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "model-enabled-smoke-"))),
    1024 * 1024,
    synthesizer,
    verifier,
    c2pa,
    metadata,
    watermarks,
    undefined,
    undefined,
    model,
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.state, "completed");
  assert.equal(analysis.stages.find((stage) => stage.id === "model_detection")?.state, "completed");
  assert.equal(analysis.evidence.find((item) => item.source === "smoke-model")?.status, "detected");
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
  assert.equal(analysis.report?.sealed, true);
  assert.equal(analysis.report?.synthesis.provider, "smoke-provider");
  assert.ok(["passed", "fallback"].includes(analysis.report?.validation.status || ""));
  assert.ok((analysis.report?.validation.checks.length || 0) >= 4);
});
