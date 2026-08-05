import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectClosedVerifierCoverage } from "../src/closed-verifier-adapters.js";
import {
  appendManualOfficialVerifierRecord,
  createManualOfficialVerifierRecord,
  parseManualOfficialVerifierRecord,
  summarizeManualOfficialVerifierManifest,
} from "../src/manual-official-verifier-evaluation.js";

const sha = (character: string) => character.repeat(64);

function input() {
  return {
    schemeId: "openai-verify",
    asset: {
      sampleId: "owned-openai-sample-001",
      sha256: sha("a"),
      ownership: "owned_or_authorized",
      sourceLabel: "ai_generated",
    },
    verification: {
      method: "manual_official_verifier",
      portalUrl: "https://openai.com/verify",
      performedAt: "2026-08-02T00:00:00.000Z",
      operatorId: "evaluator-01",
      result: "detected",
      artifactSha256: sha("b"),
      note: "Owned sample checked manually; no automated request was made.",
    },
  };
}

test("creates a deterministic evaluation-only record for an owned sample and official host", () => {
  const record = createManualOfficialVerifierRecord(input(), "2026-08-02T01:00:00.000Z");
  const repeated = createManualOfficialVerifierRecord(input(), "2026-08-02T02:00:00.000Z");

  assert.equal(record.recordId, repeated.recordId);
  assert.equal(record.schemaVersion, "manual-official-verifier-evaluation.v1");
  assert.equal(record.asset.ownership, "owned_or_authorized");
  assert.deepEqual(record.restrictions, {
    automatedAccess: false,
    productionEvidenceEligible: false,
    shortCircuitEligible: false,
    policyMutationAllowed: false,
  });
  assert.equal("analysisId" in record, false);
  assert.equal("evidence" in record, false);
  assert.equal("decision" in record, false);
});

test("rejects unowned samples, automated access, unofficial hosts, and online authority fields", () => {
  const unowned = structuredClone(input());
  unowned.asset.ownership = "unknown";
  assert.throws(() => createManualOfficialVerifierRecord(unowned), /SAMPLE_NOT_OWNED/);

  const automated = structuredClone(input());
  automated.verification.method = "automated_browser";
  assert.throws(() => createManualOfficialVerifierRecord(automated), /AUTOMATED_OFFICIAL_VERIFIER_ACCESS_PROHIBITED/);

  const unofficial = structuredClone(input());
  unofficial.verification.portalUrl = "https://example.com/fake-openai-verifier";
  assert.throws(() => createManualOfficialVerifierRecord(unofficial), /UNOFFICIAL_VERIFIER_PORTAL/);

  const commercialApi = structuredClone(input());
  commercialApi.schemeId = "aws-bedrock-watermark-detection";
  commercialApi.verification.portalUrl = "https://aws.amazon.com/bedrock/";
  assert.throws(() => createManualOfficialVerifierRecord(commercialApi), /NOT_EVALUATION_ONLY/);

  const authority = { ...input(), analysisId: "analysis-1" };
  assert.throws(() => createManualOfficialVerifierRecord(authority), /root:fields/);
});

test("stored records reject authority escalation and content tampering", () => {
  const record = createManualOfficialVerifierRecord(input(), "2026-08-02T01:00:00.000Z");
  const elevated = structuredClone(record);
  elevated.restrictions.shortCircuitEligible = true as false;
  assert.throws(() => parseManualOfficialVerifierRecord(elevated), /AUTHORITY_ESCALATION/);

  const tampered = structuredClone(record);
  tampered.verification.result = "not_detected";
  assert.throws(() => parseManualOfficialVerifierRecord(tampered), /RECORD_ID_MISMATCH/);
});

test("appends a private deduplicated JSONL manifest and summarizes it without changing runtime coverage", async () => {
  const directory = mkdtempSync(join(tmpdir(), "manual-official-verifier-"));
  const path = join(directory, "evaluation.jsonl");
  const first = createManualOfficialVerifierRecord(input(), "2026-08-02T01:00:00.000Z");
  await appendManualOfficialVerifierRecord(path, first);
  await assert.rejects(() => appendManualOfficialVerifierRecord(path, first), /DUPLICATE_MANUAL_OFFICIAL_VERIFIER_RECORD/);

  const secondInput = structuredClone(input());
  secondInput.asset.sampleId = "owned-openai-sample-002";
  secondInput.asset.sha256 = sha("c");
  secondInput.verification.result = "not_detected";
  secondInput.verification.artifactSha256 = sha("d");
  const second = createManualOfficialVerifierRecord(secondInput, "2026-08-02T01:05:00.000Z");
  await appendManualOfficialVerifierRecord(path, second);

  const raw = readFileSync(path, "utf8");
  const summary = summarizeManualOfficialVerifierManifest(raw);
  assert.equal(summary.records, 2);
  assert.equal(summary.schemes["openai-verify"], 2);
  assert.equal(summary.results.detected, 1);
  assert.equal(summary.results.not_detected, 1);
  assert.equal(summary.restrictions.productionEvidenceEligible, false);
  assert.equal(statSync(path).mode & 0o077, 0);

  const runtimeCoverage = collectClosedVerifierCoverage("analysis-1");
  const openAiCoverage = runtimeCoverage.find((record) => record.source === "openai-verify");
  assert.equal(openAiCoverage?.status, "detector_unavailable");
  assert.equal(openAiCoverage?.facts.detectionAttempted, false);
});
