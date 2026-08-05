import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AnalysisService } from "../src/analysis-service.js";
import { AnalysisStore } from "../src/analysis-store.js";
import { unavailableAiAuthenticityAssessor, type AiAuthenticityAssessor } from "../src/ai-authenticity-assessment.js";
import type { DdaShadowConfig } from "../src/config.js";
import { DdaShadowModelDetector } from "../src/dda-model-detector.js";
import type { ExplanationVerifier } from "../src/explanation-verifier.js";
import type { ReportSynthesizer } from "../src/report-synthesizer.js";
import { MODEL_DETECTOR_PROTOCOL_VERSION, type ModelDetector } from "../src/model-detector.js";
import type { AnalysisScheduler } from "../src/analysis-queue.js";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const synthesizer: ReportSynthesizer = {
  async synthesize(input) {
    return {
      text: input.decision.verdict === "INCONCLUSIVE"
        ? "当前证据不足，无法确定图像是否由 AI 生成。模型检测由当前策略禁用，本次未调用模型服务。"
        : "检测结论为 AI 生成。模型检测由当前策略禁用，本次未调用模型服务。",
      provider: "test-provider",
      model: "test-model",
      generatedAt: "2026-07-29T00:00:00.000Z",
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

function createService(directory = mkdtempSync(join(tmpdir(), "analysis-service-"))) {
  return { directory, service: new AnalysisService(new AnalysisStore(directory), 1024 * 1024, synthesizer, verifier) };
}

async function completed(service: AnalysisService, id: string) {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const analysis = service.get(id);
    if (analysis.state === "completed" || analysis.state === "failed") return analysis;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("analysis did not finish");
}

test("runs the provenance-first framework with model policy disabled", async () => {
  const { service } = createService();
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.state, "completed");
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
  assert.equal(analysis.stages.find((stage) => stage.id === "watermark")?.state, "completed");
  assert.equal(analysis.stages.find((stage) => stage.id === "multimodal_observation")?.state, "unavailable");
  assert.equal(analysis.stages.find((stage) => stage.id === "model_detection")?.state, "policy_disabled");
  assert.deepEqual(analysis.progressEvents.map((event) => event.sequence), analysis.progressEvents.map((_event, index) => index + 1));
  assert.ok(analysis.progressEvents.some((event) => event.stageId === "watermark" && event.state === "running"));
  assert.equal(analysis.executionPlan.find((node) => node.stageId === "model_detection")?.condition, "policy_disabled");
  assert.equal(analysis.executionPlan.find((node) => node.stageId === "localization")?.condition, "disabled");
  assert.equal(analysis.stages.find((stage) => stage.id === "localization")?.state, "skipped");
  assert.equal(analysis.decision?.modelCoverage, "policy_disabled");
  assert.equal(analysis.evidence.find((item) => item.category === "model")?.status, "policy_disabled");
  assert.equal(service.report(analysis.id).sealed, true);
  assert.match(service.report(analysis.id).explanation, /证据不足/);
  assert.equal(service.report(analysis.id).synthesis.model, "test-model");
  assert.equal(service.report(analysis.id).validation.status, "verified");
  assert.equal(service.report(analysis.id).claims[0].id, "claim:verdict");
  assert.equal(analysis.stages.find((stage) => stage.id === "verification")?.state, "completed");
});

test("routes requested localization conditionally and reports unavailable vision without changing the decision", async () => {
  const { service } = createService();
  const submitted = service.submit({
    filename: "pixel.png",
    mimeType: "image/png",
    dataBase64: ONE_PIXEL_PNG,
    options: { enableLocalization: true },
  });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.executionPlan.find((node) => node.stageId === "localization")?.condition, "requested_and_supported_visual_claim");
  assert.equal(analysis.stages.find((stage) => stage.id === "localization")?.state, "unavailable");
  assert.match(analysis.stages.find((stage) => stage.id === "localization")?.reason || "", /MULTIMODAL_INSPECTOR_NOT_CONFIGURED/);
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
  assert.equal(analysis.evidence.some((item) => item.category === "localization"), false);
});

test("runs an enabled DDA detector before AI assessment and preserves it as supporting evidence", async () => {
  const dda: ModelDetector = {
    id: "dda-dinov2-lora",
    enabled: true,
    async detect() {
      return {
        protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
        detectorId: "dda-dinov2-lora",
        detectorVersion: "test-dda",
        outcome: "detected",
        score: 0.812345,
        threshold: 0.5,
        predictedClass: "ai_generated",
        latencyMs: 42,
        preprocessingId: "resize-336-clip-normalize-v1",
        checkpointSha256: "b".repeat(64),
        calibrationStatus: "official_threshold_unverified_for_deployment",
        diagnostics: { device: "cuda:test" },
      };
    },
  };
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-dda-"))),
    1024 * 1024,
    synthesizer,
    verifier,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dda,
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);
  const modelEvidence = analysis.evidence.find((item) => item.source === "dda-dinov2-lora");

  assert.equal(analysis.state, "completed");
  assert.equal(analysis.executionPlan.find((node) => node.stageId === "model_detection")?.condition, "unresolved_and_detector_available");
  assert.equal(analysis.stages.find((stage) => stage.id === "model_detection")?.state, "completed");
  assert.equal(modelEvidence?.status, "detected");
  assert.equal(modelEvidence?.facts.score, 0.812345);
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
  assert.equal(analysis.decision?.modelCoverage, "enabled");
  assert.ok(analysis.decision?.basis.includes("DDA_SUPPORTING_SIGNAL_AI"));
  assert.ok(analysis.claims?.some((claim) => claim.id === "claim:model:1" && claim.statement.includes("0.8123")));
  assert.ok(analysis.report?.limitations.some((item) => item.includes("尚未完成本站部署域校准")));
});

test("keeps a DDA shadow candidate out of evidence and AI assessment context", async () => {
  const directory = mkdtempSync(join(tmpdir(), "analysis-dda-shadow-"));
  const result = (score: number, checkpointSha256: string, detectorVersion: string) => ({
    protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
    detectorId: "dda-dinov2-lora",
    detectorVersion,
    outcome: score >= 0.5 ? "detected" as const : "not_detected" as const,
    score,
    threshold: 0.5,
    predictedClass: score >= 0.5 ? "ai_generated" as const : "non_ai" as const,
    latencyMs: 12,
    preprocessingId: "resize-336-clip-normalize-v1",
    checkpointSha256,
    calibrationStatus: "official_threshold_unverified_for_deployment" as const,
    diagnostics: {},
  });
  const baseline: ModelDetector = {
    id: "dda-dinov2-lora", enabled: true,
    async detect() { return result(0.1, "b".repeat(64), "DDA-official-neurips2025"); },
  };
  const candidate: ModelDetector = {
    id: "dda-dinov2-lora", enabled: true,
    async detect() { return result(0.95, "c".repeat(64), "DDA-universal-test-step128"); },
  };
  const shadowConfig: DdaShadowConfig = {
    enabled: true,
    candidateId: "test-step128",
    candidateStatus: "two_seed_offline_gates_passed_not_production_deployed",
    candidateManifestPath: join(directory, "selected_candidate.json"),
    candidateManifestSha256: "d".repeat(64),
    auditLogPath: join(directory, "shadow.jsonl"),
    candidate: {
      enabled: true, uvCommand: "uv", workerProjectDir: "/worker", sourceDir: "/source",
      checkpointPath: "/candidate.pth", checkpointSha256: "c".repeat(64), dinov2HubDir: "/dinov2",
      device: "cuda:0", timeoutMs: 30_000, startupTimeoutMs: 180_000, maxQueue: 8,
      detectorVersion: "DDA-universal-test-step128",
    },
  };
  const shadow = new DdaShadowModelDetector(baseline, candidate, shadowConfig);
  let assessmentEvidence: readonly { source: string; facts: Record<string, string | number | boolean | null> }[] = [];
  const assessor: AiAuthenticityAssessor = {
    async assess(asset, observations, evidence) {
      assessmentEvidence = evidence;
      return unavailableAiAuthenticityAssessor.assess(asset, observations, evidence);
    },
  };
  const service = new AnalysisService(
    new AnalysisStore(directory), 1024 * 1024, synthesizer, verifier,
    undefined, undefined, undefined, undefined, assessor, shadow,
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);
  await shadow.drainAudit();

  const modelEvidence = analysis.evidence.filter((item) => item.source === "dda-dinov2-lora");
  assert.equal(modelEvidence.length, 1);
  assert.equal(modelEvidence[0]?.facts.score, 0.1);
  assert.equal(modelEvidence[0]?.facts.checkpointSha256, "b".repeat(64));
  assert.equal(analysis.evidence.some((item) => item.facts.checkpointSha256 === "c".repeat(64)), false);
  assert.equal(assessmentEvidence.some((item) => item.facts.checkpointSha256 === "c".repeat(64)), false);
  assert.equal(assessmentEvidence.filter((item) => item.source === "dda-dinov2-lora").length, 1);
});

test("degrades an unavailable DDA worker without failing the analysis", async () => {
  const dda: ModelDetector = {
    id: "dda-dinov2-lora",
    enabled: true,
    async detect() { throw new Error("DDA_WORKER_EXITED"); },
  };
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-dda-unavailable-"))),
    1024 * 1024,
    synthesizer,
    verifier,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dda,
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.state, "completed");
  assert.equal(analysis.stages.find((stage) => stage.id === "model_detection")?.state, "unavailable");
  assert.equal(analysis.evidence.find((item) => item.source === "dda-dinov2-lora")?.status, "detector_unavailable");
  assert.equal(analysis.decision?.modelCoverage, "enabled");
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
});

test("degrades an unavailable MIRROR worker without failing the analysis", async () => {
  const mirror: ModelDetector = {
    id: "mirror-dinov3-hplus",
    enabled: true,
    async detect() { throw new Error("MIRROR_WORKER_EXITED"); },
  };
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-mirror-unavailable-"))),
    1024 * 1024,
    synthesizer,
    verifier,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mirror,
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.state, "completed");
  assert.equal(analysis.stages.find((stage) => stage.id === "model_detection")?.state, "unavailable");
  assert.equal(analysis.evidence.find((item) => item.source === "mirror-dinov3-hplus")?.status, "detector_unavailable");
  assert.equal(analysis.decision?.modelCoverage, "enabled");
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
});

test("preserves DDA, SAFE, and MIRROR disagreement without score fusion", async () => {
  const dda: ModelDetector = {
    id: "dda-dinov2-lora",
    enabled: true,
    async detect() {
      return {
        protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
        detectorId: "dda-dinov2-lora",
        detectorVersion: "test-dda",
        outcome: "detected",
        score: 0.8,
        threshold: 0.5,
        predictedClass: "ai_generated",
        latencyMs: 10,
        preprocessingId: "resize-336-clip-normalize-v1",
        checkpointSha256: "a".repeat(64),
        calibrationStatus: "official_threshold_unverified_for_deployment",
        diagnostics: {},
      };
    },
  };
  const mirror: ModelDetector = {
    id: "mirror-dinov3-hplus",
    enabled: true,
    async detect() {
      return {
        protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
        detectorId: "mirror-dinov3-hplus",
        detectorVersion: "test-mirror",
        outcome: "not_detected",
        score: 0.2,
        threshold: 0.5,
        predictedClass: "non_ai",
        latencyMs: 20,
        preprocessingId: "mirror-short512-center224-jpeg96-v1",
        checkpointSha256: "b".repeat(64),
        calibrationStatus: "experimental_threshold_unverified_for_deployment",
        diagnostics: { licenseStatus: "unverified_experimental_use_only" },
      };
    },
  };
  const safe: ModelDetector = {
    id: "safe-wavelet-resnet",
    enabled: true,
    async detect() {
      return {
        protocolVersion: MODEL_DETECTOR_PROTOCOL_VERSION,
        detectorId: "safe-wavelet-resnet",
        detectorVersion: "test-safe",
        outcome: "detected",
        score: 0.7,
        threshold: 0.5,
        predictedClass: "ai_generated",
        latencyMs: 8,
        preprocessingId: "safe-center-crop256-totensor-v1",
        checkpointSha256: "c".repeat(64),
        calibrationStatus: "official_threshold_unverified_for_deployment",
        diagnostics: { sourceRevision: "d".repeat(40) },
      };
    },
  };
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-model-disagreement-"))),
    1024 * 1024,
    synthesizer,
    verifier,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    [dda, safe, mirror],
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.evidence.find((item) => item.source === "dda-dinov2-lora")?.facts.score, 0.8);
  assert.equal(analysis.evidence.find((item) => item.source === "mirror-dinov3-hplus")?.facts.score, 0.2);
  assert.equal(analysis.evidence.find((item) => item.source === "safe-wavelet-resnet")?.facts.score, 0.7);
  const comparison = analysis.evidence.find((item) => item.source === "model-route-comparison");
  assert.equal(comparison?.facts.comparison, "disagreement");
  assert.equal(comparison?.facts.scoreFusion, "none_preserve_disagreement");
  assert.equal(comparison?.facts.fusionPolicy, "none_preserve_disagreement");
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
  assert.ok(analysis.decision?.basis.includes("DDA_SUPPORTING_SIGNAL_AI"));
  assert.ok(analysis.decision?.basis.includes("MODEL_SUPPORTING_SIGNAL_NON_AI:mirror-dinov3-hplus"));
  assert.ok(analysis.decision?.basis.includes("MODEL_SUPPORTING_SIGNAL_AI:safe-wavelet-resnet"));
  assert.ok(analysis.report?.limitations.some((item) => item.includes("MIRROR")));
  assert.ok(analysis.report?.limitations.some((item) => item.includes("SAFE")));
});

test("regenerates once and publishes a deterministic fallback when verification keeps failing", async () => {
  let synthesisCalls = 0;
  const contradictorySynthesizer: ReportSynthesizer = {
    async synthesize() {
      synthesisCalls += 1;
      return {
        text: "结论为 AI 生成，并且检测到局部纹理伪影。",
        provider: "test-provider",
        model: "test-model",
        generatedAt: "2026-07-29T00:00:00.000Z",
      };
    },
  };
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-fallback-"))),
    1024 * 1024,
    contradictorySynthesizer,
    verifier,
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.state, "completed");
  assert.equal(synthesisCalls, 2);
  assert.equal(analysis.validation?.status, "fallback");
  assert.equal(analysis.synthesis?.outputType, "deterministic_fallback");
  assert.match(analysis.explanation || "", /结论为不确定/);
  assert.ok(analysis.validation?.checks.some((check) => check.id === "synthesis_verdict_consistency" && !check.passed));
});

test("fails the explanation stage when required AI synthesis fails", async () => {
  const failingSynthesizer: ReportSynthesizer = {
    async synthesize() { throw new Error("PI_PROVIDER_NOT_CONFIGURED"); },
  };
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-synthesis-failure-"))),
    1024 * 1024,
    failingSynthesizer,
    verifier,
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = await completed(service, submitted.analysis.id);

  assert.equal(analysis.state, "failed");
  assert.equal(analysis.error?.code, "AI_SYNTHESIS_FAILED");
  assert.equal(analysis.stages.find((stage) => stage.id === "explanation")?.state, "failed");
  assert.equal(analysis.decision?.verdict, "INCONCLUSIVE");
  assert.equal(analysis.report, undefined);
});

test("retries a transient failure under the same analysis identity", async () => {
  let synthesisCalls = 0;
  const transientSynthesizer: ReportSynthesizer = {
    async synthesize(input) {
      synthesisCalls += 1;
      if (synthesisCalls === 1) throw new Error("AI_SYNTHESIS_EMPTY");
      return synthesizer.synthesize(input);
    },
  };
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-retry-"))),
    1024 * 1024,
    transientSynthesizer,
    verifier,
  );
  const submitted = service.submit({
    filename: "pixel.png",
    mimeType: "image/png",
    dataBase64: ONE_PIXEL_PNG,
    options: { enableLocalization: true },
  });
  const failed = await completed(service, submitted.analysis.id);

  assert.equal(failed.state, "failed");
  assert.equal(failed.attempt, 1);
  assert.equal(failed.error?.retryable, true);
  const lastSequence = failed.progressEvents.at(-1)?.sequence || 0;

  const queued = service.retry(failed.id);
  assert.equal(queued.id, failed.id);
  assert.equal(queued.state, "queued");
  assert.equal(queued.attempt, 2);
  assert.equal(queued.retryHistory.length, 1);
  assert.equal(queued.retryHistory[0]?.error.code, "AI_SYNTHESIS_FAILED");
  assert.equal(queued.options.enableLocalization, true);

  const recovered = await completed(service, failed.id);
  assert.equal(recovered.id, failed.id);
  assert.equal(recovered.state, "completed");
  assert.equal(recovered.attempt, 2);
  assert.equal(recovered.report?.sealed, true);
  assert.ok(recovered.progressEvents.some((event) => event.reason === "RETRY_ATTEMPT_2"));
  assert.ok((recovered.progressEvents.at(-1)?.sequence || 0) > lastSequence);
  assert.deepEqual(
    recovered.progressEvents.map((event) => event.sequence),
    recovered.progressEvents.map((_event, index) => index + 1),
  );
  assert.throws(() => service.retry(failed.id), /ANALYSIS_NOT_RETRYABLE/);
});

test("does not leave a retry stranded when the durable queue rejects it", async () => {
  let synthesisCalls = 0;
  const transientSynthesizer: ReportSynthesizer = {
    async synthesize(input) {
      synthesisCalls += 1;
      if (synthesisCalls === 1) throw new Error("AI_SYNTHESIS_EMPTY");
      return synthesizer.synthesize(input);
    },
  };
  let execute: ((analysisId: string, leaseId: string) => Promise<void>) | undefined;
  let enqueueCalls = 0;
  const rejectingScheduler: AnalysisScheduler = {
    start(handler) { execute = handler; },
    enqueue(analysisId) {
      enqueueCalls += 1;
      if (enqueueCalls > 1) throw new Error("ANALYSIS_QUEUE_OVERLOADED");
      queueMicrotask(() => { void execute?.(analysisId, "test-lease"); });
    },
    cancel() { return false; },
    isLeaseCurrent() { return true; },
    stats() { return { queued: 0, running: 0, capacity: 1, maxQueue: 1, concurrency: 1, oldestQueuedAt: null, recoveredLeases: 0, expiredJobs: 0 }; },
    close() {},
  };
  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-retry-queue-reject-"))),
    1024 * 1024,
    transientSynthesizer,
    verifier,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    rejectingScheduler,
  );
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const failed = await completed(service, submitted.analysis.id);
  assert.equal(failed.state, "failed");
  assert.throws(() => service.retry(failed.id), /ANALYSIS_QUEUE_OVERLOADED/);
  const stranded = service.get(failed.id);
  assert.equal(stranded.state, "failed");
  assert.equal(stranded.error?.code, "ANALYSIS_QUEUE_OVERLOADED");
  assert.equal(stranded.error?.retryable, true);
});

test("reuses an idempotent submission and reloads persisted analyses", async () => {
  const { directory, service } = createService();
  const input = { filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG, idempotencyKey: "same-request" };
  const first = service.submit(input);
  await completed(service, first.analysis.id);
  const second = service.submit(input);
  const reloaded = new AnalysisService(new AnalysisStore(directory), 1024 * 1024);

  assert.equal(second.reused, true);
  assert.equal(second.analysis.id, first.analysis.id);
  assert.equal(reloaded.get(first.analysis.id).state, "completed");
});

test("derives a version-bound default idempotency key", () => {
  const { service } = createService();
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });

  assert.equal(submitted.analysis.idempotencyKey.length, 64);
  assert.notEqual(submitted.analysis.idempotencyKey, submitted.analysis.asset.sha256);
});

test("rejects unsupported and oversized image submissions", () => {
  const { service } = createService();
  assert.throws(() => service.submit({ filename: "bad.txt", mimeType: "image/png", dataBase64: Buffer.from("not an image").toString("base64") }), /UNSUPPORTED_IMAGE/);
  const smallLimit = new AnalysisService(new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-small-"))), 4);
  assert.throws(() => smallLimit.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG }), /IMAGE_TOO_LARGE/);
});
