import assert from "node:assert/strict";
import test from "node:test";

import { ANALYSIS_SCHEMA_VERSION, type DecisionRecord, type EvidenceRecord } from "../src/analysis-types.js";
import { decideProvenanceFirst } from "../src/decision-policy.js";
import {
  createAtomicClaims,
  createExplanationDraft,
  deriveLimitations,
  validateExplanationDraft,
  validateSynthesizedText,
} from "../src/explanation-policy.js";

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: overrides.id || "evidence-1",
    analysisId: "analysis-1",
    category: "metadata",
    source: "safe_image_parser",
    status: "detected",
    strength: "informational",
    summary: "test evidence",
    facts: { exifContainer: true },
    createdAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

test("inconclusive explanation exactly reflects metadata and disabled model coverage", () => {
  const records = [
    evidence(),
    evidence({ id: "watermark", category: "watermark", source: "registry", status: "detector_unavailable", strength: "none", facts: {} }),
  ];
  const decision = decideProvenanceFirst(records);
  const draft = createExplanationDraft(decision, records);
  const validation = validateExplanationDraft(draft, decision, records);

  assert.equal(draft.verdict, "INCONCLUSIVE");
  assert.deepEqual(draft.metadataIndicatorRefs, ["evidence-1"]);
  assert.equal(draft.text.includes("策略明确禁用"), true);
  assert.equal(validation.status, "verified");
  assert.equal(validation.checks.every((check) => check.passed), true);
});

test("verified AI provenance is named and passes all checks", () => {
  const records = [evidence({
    category: "provenance",
    source: "c2pa",
    status: "verified_present",
    strength: "strong",
    facts: { provenanceVerified: true, aiOrigin: true },
  })];
  const decision = decideProvenanceFirst(records);
  const draft = createExplanationDraft(decision, records);
  const validation = validateExplanationDraft(draft, decision, records);

  assert.equal(draft.text.includes("结论为 AI 生成"), true);
  assert.equal(draft.text.includes("c2pa"), true);
  assert.equal(validation.status, "verified");
});

test("a product verdict remains AI-generated when conflicts and an inconclusive provenance conclusion are disclosed", () => {
  const decision: DecisionRecord = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    verdict: "AI_GENERATED",
    confidenceBand: "medium",
    basis: ["AI_FINAL_MULTIMODAL_ADJUDICATION"],
    evidenceRefs: [],
    conflicts: ["专用检测器方向不一致。"],
    modelCoverage: "enabled",
    policyVersion: "test-policy",
    decidedAt: "2026-08-01T00:00:00.000Z",
  };
  const draft = createExplanationDraft(decision, []);
  const claims = createAtomicClaims(decision, []);
  const checks = validateSynthesizedText(
    "检测结论为 AI 生成。来源凭证结论不确定，当前没有通过校验的可信来源。",
    claims,
    decision,
    [],
  );

  assert.match(draft.text, /^结论为 AI 生成。综合证据存在冲突/);
  assert.equal(checks.find((check) => check.id === "synthesis_verdict_consistency")?.passed, true);
});

test("tampered verdict, evidence references, and model coverage fail exact checks", () => {
  const records = [evidence()];
  const decision = decideProvenanceFirst(records);
  const draft = createExplanationDraft(decision, records);
  const validation = validateExplanationDraft({
    ...draft,
    verdict: "AI_GENERATED",
    evidenceRefs: ["missing"],
    modelCoverage: "enabled",
  }, decision, records);

  assert.equal(validation.status, "failed");
  assert.equal(validation.checks.find((check) => check.id === "verdict_consistency")?.passed, false);
  assert.equal(validation.checks.find((check) => check.id === "evidence_reference_consistency")?.passed, false);
  assert.equal(validation.checks.find((check) => check.id === "model_coverage_consistency")?.passed, false);
});

test("unavailable direct evidence is reflected as a limitation", () => {
  const records = [evidence({ category: "watermark", status: "unsupported_format", strength: "none", facts: {} })];
  const decision = decideProvenanceFirst(records);
  const draft = createExplanationDraft(decision, records);

  assert.equal(draft.limitations.some((item) => item.includes("检测器不可用")), true);
  assert.equal(validateExplanationDraft(draft, decision, records).status, "verified");
});

test("only visually validated supporting evidence becomes an explanation claim", () => {
  const visual = evidence({
    id: "visual-1",
    category: "visual",
    source: "blind-general-v1",
    status: "detected",
    strength: "supporting",
    summary: "多模态观察发现支持性视觉线索：局部结构不一致。",
    facts: { evidenceAuthority: "supporting_only" },
  });
  const records = [visual];
  const decision = decideProvenanceFirst(records);

  assert.equal(createAtomicClaims(decision, records, undefined, new Set()).some((claim) => claim.type === "visual"), false);
  const claims = createAtomicClaims(decision, records, undefined, new Set([visual.id]));
  assert.equal(claims.filter((claim) => claim.type === "visual").length, 1);
  assert.equal(claims.find((claim) => claim.type === "visual")?.authoritativeValue, "supporting_only");

  const unverifiedClaims = createAtomicClaims(decision, records, undefined, new Set());
  const checks = validateSynthesizedText(
    "当前证据不足，无法确定是否由 AI 生成。模型检测由当前策略禁用，本次未调用模型服务。检测到局部纹理异常。",
    unverifiedClaims,
    decision,
    records,
    new Set(),
  );
  assert.equal(checks.find((check) => check.id === "synthesis_visual_claim_scope")?.passed, false);
});

test("visible mark explanations preserve forgery and claimed-provider boundaries", () => {
  const visibleMark = evidence({
    id: "visible-mark-1",
    category: "visual",
    source: "visible-ai-mark-observation-v1",
    status: "detected",
    strength: "supporting",
    summary: "图中存在经复核的可见 AI 标识，标识声称 Example AI。",
    facts: {
      visibleMark: true,
      claimedProvider: "Example AI",
      claimedProviderIdentityVerified: false,
      provenanceVerified: false,
      evidenceAuthority: "supporting_only",
      copyable: true,
      removable: true,
      forgeable: true,
    },
  });
  const records = [visibleMark];
  const decision = decideProvenanceFirst(records);
  const supported = new Set([visibleMark.id]);
  const claims = createAtomicClaims(decision, records, undefined, supported);

  assert.equal(claims.some((claim) => claim.type === "visual" && claim.evidenceRefs.includes(visibleMark.id)), true);
  assert.equal(deriveLimitations(decision, records).some((item) => item.includes("复制、移除或伪造")), true);

  const overclaimChecks = validateSynthesizedText(
    "当前证据不足，无法确定是否由 AI 生成。Example AI 已验证生成了该图像。模型检测由当前策略禁用，本次未调用模型服务。",
    claims,
    decision,
    records,
    supported,
  );
  assert.equal(overclaimChecks.find((check) => check.id === "synthesis_visible_mark_authority")?.passed, false);

  const boundedChecks = validateSynthesizedText(
    "当前证据不足，无法确定是否由 AI 生成。图中可见 AI 标识声称 Example AI，但该标识可伪造，无法验证厂商身份或图像来源。模型检测由当前策略禁用，本次未调用模型服务。",
    claims,
    decision,
    records,
    supported,
  );
  assert.equal(boundedChecks.find((check) => check.id === "synthesis_visible_mark_authority")?.passed, true);
});

test("binds scores, thresholds, and directions to the detector that produced them", () => {
  const records = [
    evidence({
      id: "dda-1",
      category: "model",
      source: "dda-dinov2-lora",
      status: "detected",
      strength: "supporting",
      facts: { score: 0.8123, threshold: 0.5, predictedClass: "ai_generated" },
    }),
    evidence({
      id: "safe-1",
      category: "model",
      source: "safe-wavelet-resnet",
      status: "not_detected",
      strength: "supporting",
      facts: { score: 0.2, threshold: 0.7, predictedClass: "non_ai" },
    }),
  ];
  const modelDecision: DecisionRecord = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    verdict: "AI_GENERATED",
    confidenceBand: "medium",
    basis: ["AI_FINAL_MULTIMODAL_ADJUDICATION"],
    evidenceRefs: records.map((item) => item.id),
    conflicts: ["专用检测器方向不一致。"],
    modelCoverage: "enabled",
    policyVersion: "test-policy",
    decidedAt: "2026-08-02T00:00:00.000Z",
  };
  const claims = createAtomicClaims(modelDecision, records);
  const valid = validateSynthesizedText(
    "检测结论为 AI 生成。DDA 分数为 0.8123，阈值为 0.5000，支持 AI 生成方向。SAFE 分数为 0.2000，阈值为 0.7000，支持非 AI 方向。",
    claims,
    modelDecision,
    records,
  );
  assert.equal(valid.find((check) => check.id === "synthesis_model_score_threshold_consistency")?.passed, true);
  assert.equal(valid.find((check) => check.id === "synthesis_detector_status_consistency")?.passed, true);

  const swapped = validateSynthesizedText(
    "检测结论为 AI 生成。DDA 分数为 0.2000，阈值为 0.7000，支持非 AI 方向。SAFE 分数为 0.8123，阈值为 0.5000，支持 AI 生成方向。",
    claims,
    modelDecision,
    records,
  );
  assert.equal(swapped.find((check) => check.id === "synthesis_numeric_consistency")?.passed, true);
  assert.equal(swapped.find((check) => check.id === "synthesis_model_score_threshold_consistency")?.passed, false);
  assert.equal(swapped.find((check) => check.id === "synthesis_detector_status_consistency")?.passed, false);

  const tamperedClaims = structuredClone(claims);
  const ddaClaim = tamperedClaims.find((claim) => claim.id === "claim:model:1");
  assert.ok(ddaClaim);
  ddaClaim.statement = ddaClaim.statement.replace("0.8123", "0.2000");
  ddaClaim.evidenceRefs = ["missing-evidence"];
  const tamperedClaimChecks = validateSynthesizedText(
    "检测结论为 AI 生成。DDA 分数为 0.8123，阈值为 0.5000，支持 AI 生成方向。SAFE 分数为 0.2000，阈值为 0.7000，支持非 AI 方向。",
    tamperedClaims,
    modelDecision,
    records,
  );
  assert.equal(tamperedClaimChecks.find((check) => check.id === "claim_value_consistency")?.passed, false);
  assert.equal(tamperedClaimChecks.find((check) => check.id === "claim_reference_consistency")?.passed, false);
});

test("rejects score or direction claims for an unavailable detector", () => {
  const records = [evidence({
    id: "dda-unavailable",
    category: "model",
    source: "dda-dinov2-lora",
    status: "detector_unavailable",
    strength: "none",
    facts: {},
  })];
  const decision = decideProvenanceFirst(records, undefined, true);
  const claims = createAtomicClaims(decision, records);
  const checks = validateSynthesizedText(
    "当前证据不足，无法确定是否由 AI 生成。DDA 分数为 0.5000，支持 AI 生成方向。",
    claims,
    decision,
    records,
  );
  assert.equal(checks.find((check) => check.id === "synthesis_detector_status_consistency")?.passed, false);
});

test("does not promote invalid provenance or unsigned metadata into verified origin", () => {
  const records = [
    evidence({
      id: "c2pa-invalid",
      category: "provenance",
      source: "c2pa",
      status: "invalid",
      strength: "none",
      facts: { issuer: "OpenAI", provenanceVerified: false },
    }),
    evidence({
      id: "metadata-ai",
      category: "metadata",
      source: "metadata",
      status: "detected",
      strength: "supporting",
      facts: { aiIndicators: true, authenticated: false },
    }),
  ];
  const decision = decideProvenanceFirst(records);
  const claims = createAtomicClaims(decision, records);
  const provenanceOverclaim = validateSynthesizedText(
    "当前证据不足，无法确定是否由 AI 生成。OpenAI C2PA 来源凭证验证通过，属于可信来源。模型检测由策略禁用，本次未调用模型。",
    claims,
    decision,
    records,
  );
  assert.equal(provenanceOverclaim.find((check) => check.id === "synthesis_provenance_consistency")?.passed, false);

  const metadataOverclaim = validateSynthesizedText(
    "当前证据不足，无法确定是否由 AI 生成。EXIF 元数据证明图像由 AI 生成。模型检测由策略禁用，本次未调用模型。",
    claims,
    decision,
    records,
  );
  assert.equal(metadataOverclaim.find((check) => check.id === "synthesis_metadata_authority")?.passed, false);

  const bounded = validateSynthesizedText(
    "当前证据不足，无法确定是否由 AI 生成。C2PA 凭证未通过验证；EXIF 元数据仅作为支持性指示，不能证明图像来源。模型检测由策略禁用，本次未调用模型。",
    claims,
    decision,
    records,
  );
  assert.equal(bounded.find((check) => check.id === "synthesis_provenance_consistency")?.passed, true);
  assert.equal(bounded.find((check) => check.id === "synthesis_metadata_authority")?.passed, true);
});
