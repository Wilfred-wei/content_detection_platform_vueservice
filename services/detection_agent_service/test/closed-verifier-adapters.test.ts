import assert from "node:assert/strict";
import test from "node:test";

import { collectClosedVerifierCoverage } from "../src/closed-verifier-adapters.js";

test("closed and commercial verifiers return explicit non-attempt outcomes", () => {
  const records = collectClosedVerifierCoverage("analysis-1", "2026-07-28T00:00:00.000Z");
  const sources = new Set(records.map((record) => record.source));

  for (const source of ["openai-verify", "google-synthid", "aws-bedrock-watermark-detection", "aliyun-aigc-marking", "tencent-cloud-aigc-detection", "baidu-aigc-watermark", "huawei-cloud-aigc-marking"]) {
    assert.ok(sources.has(source), `missing explicit adapter for ${source}`);
  }
  assert.ok(records.every((record) => ["detector_unavailable", "policy_disabled"].includes(record.status)));
  assert.ok(records.every((record) => record.facts.detectionAttempted === false));
  assert.ok(records.every((record) => record.facts.absenceEstablished === false));
  assert.ok(records.every((record) => record.status !== "not_detected"));
});

test("commercial APIs are disabled by policy while manual verifiers are unavailable", () => {
  const records = collectClosedVerifierCoverage("analysis-1");
  assert.equal(records.find((record) => record.source === "aws-bedrock-watermark-detection")?.status, "policy_disabled");
  assert.equal(records.find((record) => record.source === "openai-verify")?.status, "detector_unavailable");
  assert.equal(records.find((record) => record.source === "google-synthid")?.status, "detector_unavailable");
});
