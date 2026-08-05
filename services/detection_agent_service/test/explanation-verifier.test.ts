import assert from "node:assert/strict";
import test from "node:test";

import type { ClaimRecord, DecisionRecord } from "../src/analysis-types.js";
import { loadConfig } from "../src/config.js";
import { buildPolarityQuestions, PiExplanationVerifier } from "../src/explanation-verifier.js";
import type { EngineFactory } from "../src/pi-engine.js";

const decision: DecisionRecord = {
  schemaVersion: "1.7.0",
  verdict: "INCONCLUSIVE",
  confidenceBand: "low",
  basis: ["No verified provenance."],
  evidenceRefs: [],
  conflicts: [],
  modelCoverage: "policy_disabled",
  policyVersion: "test-policy",
  decidedAt: "2026-07-29T00:00:00.000Z",
};

const claims: ClaimRecord[] = [{
  schemaVersion: "1.7.0",
  id: "claim:verdict",
  type: "verdict",
  materiality: "material",
  statement: "权威结论为证据不足，当前无法确定是否由 AI 生成。",
  evidenceRefs: [],
  authoritativeValue: "INCONCLUSIVE",
}];

const input = {
  analysisId: "analysis-1",
  decision,
  claims,
  explanation: "当前证据不足，无法确定图像是否由 AI 生成。",
};

test("builds positive, inverse, paraphrase, and forced-choice questions", () => {
  const questions = buildPolarityQuestions(input);
  assert.deepEqual(questions.map((item) => item.variant), ["positive", "inverse", "paraphrase", "forced_choice"]);
  assert.equal(questions.every((item) => item.prompt.includes("authoritativeVerdict")), true);
});

test("normalizes four independent polarity answers into supported checks", async () => {
  let sessions = 0;
  const factory: EngineFactory = async () => {
    sessions += 1;
    return {
      async prompt(prompt) {
        if (prompt.includes("反向问题")) return "NO";
        if (prompt.includes("强制选择")) return "ALIGNED";
        return "YES";
      },
      abort: async () => {},
      dispose: () => {},
      toolNames: () => [],
    };
  };
  const config = { ...loadConfig({}), provider: "openai", model: "test-model", providerReady: true };
  const result = await new PiExplanationVerifier(config, factory).verify(input);

  assert.equal(sessions, 4);
  assert.equal(result.checks.length, 4);
  assert.equal(result.checks.every((check) => check.passed && check.outcome === "supported"), true);
});
