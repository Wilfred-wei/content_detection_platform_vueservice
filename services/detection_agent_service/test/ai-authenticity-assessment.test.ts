import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PiAiAuthenticityAssessor,
  parseAiAssessmentCritic,
  parseDirectAiAssessment,
  parseFinalAiAdjudication,
  reconcileAiAssessment,
} from "../src/ai-authenticity-assessment.js";
import type { EvidenceRecord, MediaAsset } from "../src/analysis-types.js";
import { loadConfig } from "../src/config.js";
import type { EngineFactory } from "../src/pi-engine.js";

const directJson = JSON.stringify({
  verdict: "AI_GENERATED",
  confidence: 0.86,
  summary: "画面与专用检测信号共同支持 AI 生成，但仍保留相反证据。",
  reasons: [{
    id: "reason-1",
    direction: "supports_ai",
    claim: "重复纹理在局部出现不一致连接。",
    strength: "moderate",
    observationRefs: ["obs-1"],
    evidenceRefs: ["evidence-safe"],
  }],
  counterEvidence: ["压缩也可能造成部分纹理异常。"],
  limitations: ["综合判断不能验证具体生成器。"],
  imageInstructionDetected: false,
});

const criticJson = JSON.stringify({
  disposition: "CHALLENGE",
  summary: "视觉纹理理由不足，但该问题不否定独立检测模型结果。",
  challengedReasonIds: ["reason-1"],
  unsupportedReasonIds: ["reason-1"],
  counterEvidence: ["局部异常可能来自重复保存。"],
  counterEvidenceRefs: ["evidence-dda"],
  imageInstructionDetected: false,
});

const finalJson = JSON.stringify({
  verdict: "AI_GENERATED",
  confidence: 0.86,
  summary: "专用检测模型和原图综合分析总体支持 AI 生成，DDA 的相反方向作为冲突保留。",
  retainedReasonIds: [],
  rejectedReasonIds: ["reason-1"],
  evidenceRefs: ["evidence-mirror", "evidence-safe", "evidence-dda"],
  counterEvidence: ["DDA 支持非 AI 方向。"],
  limitations: ["三个模型的原始分数不能直接比较，也尚未完成本站校准。"],
  conflicts: ["DDA 与 MIRROR、SAFE 的方向不一致。"],
  imageInstructionDetected: false,
});

const evidenceIds = new Set(["evidence-safe", "evidence-mirror", "evidence-dda"]);

test("strictly parses a direct assessment with observation and evidence references", () => {
  const parsed = parseDirectAiAssessment(directJson, new Set(["obs-1"]), evidenceIds);
  assert.equal(parsed.verdict, "AI_GENERATED");
  assert.deepEqual(parsed.reasons[0].evidenceRefs, ["evidence-safe"]);
});

test("rejects unknown fields and unknown references", () => {
  const unknownField = JSON.stringify({ ...JSON.parse(directJson), requestedTool: "shell" });
  assert.throws(() => parseDirectAiAssessment(unknownField, new Set(["obs-1"]), evidenceIds), /UNEXPECTED_AI_ASSESSMENT_FIELD/);
  assert.throws(() => parseDirectAiAssessment(directJson, new Set(), evidenceIds), /UNKNOWN_AI_ASSESSMENT_OBSERVATION_REF/);
  assert.throws(() => parseDirectAiAssessment(directJson, new Set(["obs-1"]), new Set()), /UNKNOWN_AI_ASSESSMENT_EVIDENCE_REF/);
});

test("parses skeptical review as reason-level evidence without a verdict or confidence cap", () => {
  const critic = parseAiAssessmentCritic(criticJson, new Set(["reason-1"]), evidenceIds);
  assert.equal(critic.disposition, "CHALLENGE");
  assert.deepEqual(critic.unsupportedReasonIds, ["reason-1"]);
  assert.equal("verdict" in critic, false);
  assert.equal("confidenceCap" in critic, false);
});

test("rejects a final adjudication that attempts to retain an unsupported reason", () => {
  const invalid = JSON.stringify({ ...JSON.parse(finalJson), retainedReasonIds: ["reason-1"], rejectedReasonIds: [] });
  assert.throws(
    () => parseFinalAiAdjudication(invalid, new Set(["reason-1"]), evidenceIds, new Set(["reason-1"])),
    /INVALID_AI_ADJUDICATION_RETAINED_REASON/,
  );
});

test("known AI-generated disagreement sample is not downgraded solely by critic disagreement", () => {
  const direct = parseDirectAiAssessment(directJson, new Set(["obs-1"]), evidenceIds);
  const critic = parseAiAssessmentCritic(criticJson, new Set(["reason-1"]), evidenceIds);
  const final = parseFinalAiAdjudication(finalJson, new Set(["reason-1"]), evidenceIds, new Set(critic.unsupportedReasonIds));
  const reconciled = reconcileAiAssessment(direct, critic, final);

  assert.equal(reconciled.verdict, "AI_GENERATED");
  assert.equal(reconciled.confidence, 0.86);
  assert.equal(reconciled.confidenceBand, "high");
  assert.equal(reconciled.status, "adjudicated");
  assert.deepEqual(reconciled.reasons, []);
  assert.deepEqual(reconciled.evidenceRefs, ["evidence-mirror", "evidence-safe", "evidence-dda"]);
  assert.match(reconciled.summary, /支持 AI 生成/);
  assert.ok(reconciled.conflicts.some((item) => item.includes("理由级反证")));
});

test("runs a fresh final adjudicator with registered specialist-detector context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-adjudication-"));
  const imagePath = join(directory, "sample.png");
  await writeFile(imagePath, Buffer.from("test-image"));
  const prompts: string[] = [];
  const factory = (response: string): EngineFactory => async () => ({
    prompt: async (prompt, images) => {
      prompts.push(prompt);
      assert.equal(images?.length, 1);
      return response;
    },
    abort: async () => {},
    dispose: () => {},
    toolNames: () => [],
  });
  const asset: MediaAsset = {
    schemaVersion: "test",
    id: "asset-1",
    filename: "sample.png",
    mimeType: "image/png",
    sizeBytes: 10,
    sha256: "a".repeat(64),
    storedPath: imagePath,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
  const evidence: EvidenceRecord[] = [
    ["evidence-safe", "safe-wavelet-resnet", "detected", 0.9406, "ai_generated"],
    ["evidence-mirror", "mirror-dinov3-hplus", "detected", 0.8575, "ai_generated"],
    ["evidence-dda", "dda-dinov2-lora", "not_detected", 0.048, "non_ai"],
  ].map(([id, source, status, score, predictedClass]) => ({
    schemaVersion: "test",
    id: id as string,
    analysisId: "analysis-1",
    category: "model",
    source: source as string,
    status: status as EvidenceRecord["status"],
    strength: "supporting",
    summary: `${source} test result`,
    facts: {
      score: score as number,
      threshold: 0.5,
      predictedClass: predictedClass as string,
      calibrationStatus: source === "mirror-dinov3-hplus"
        ? "experimental_threshold_unverified_for_deployment"
        : "official_threshold_unverified_for_deployment",
    },
    createdAt: "2026-08-01T00:00:00.000Z",
  }));
  const config = {
    ...loadConfig({}),
    provider: "openai",
    model: "test-vision-model",
    apiKey: "test-key",
    providerReady: true,
  };
  const assessor = new PiAiAuthenticityAssessor(
    config,
    factory(directJson),
    factory(criticJson),
    factory(finalJson),
  );

  try {
    const result = await assessor.assess(asset, [{
      id: "obs-1",
      profileId: "blind-visual-observation-v1",
      cueId: "texture",
      state: "present",
      support: "supports_synthetic",
      description: "纹理连接异常。",
      region: null,
      viewSha256: asset.sha256,
    }], evidence);
    assert.equal(result.final?.verdict, "AI_GENERATED");
    assert.equal(result.reconciled.confidenceBand, "high");
    assert.equal(prompts.length, 3);
    assert.match(prompts[0], /high_value_forensic_signal/);
    assert.match(prompts[0], /local high-frequency wavelet artifacts/);
    assert.match(prompts[2], /skepticalReview/);
    assert.match(prompts[2], /evidence-mirror/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
