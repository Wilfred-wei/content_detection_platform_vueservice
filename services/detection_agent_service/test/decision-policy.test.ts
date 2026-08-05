import assert from "node:assert/strict";
import test from "node:test";

import { decideProvenanceFirst, replayProvenanceFirst } from "../src/decision-policy.js";
import { ANALYSIS_POLICY_VERSION, ANALYSIS_SCHEMA_VERSION, type EvidenceRecord } from "../src/analysis-types.js";

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: overrides.id || "evidence-1",
    analysisId: "analysis-1",
    category: "provenance",
    source: "test-scheme",
    status: "verified_present",
    strength: "strong",
    summary: "test evidence",
    facts: { provenanceVerified: true, aiOrigin: true },
    createdAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

test("verified strong AI provenance establishes AI_GENERATED without a model", () => {
  const decision = decideProvenanceFirst([evidence()]);
  assert.equal(decision.verdict, "AI_GENERATED");
  assert.equal(decision.confidenceBand, "high");
  assert.equal(decision.modelCoverage, "policy_disabled");
  assert.deepEqual(decision.basis, ["VERIFIED_PROVENANCE:test-scheme"]);
});

test("supporting or unverified indicators remain inconclusive", () => {
  const supporting = evidence({
    category: "metadata",
    status: "detected",
    strength: "supporting",
    facts: { aiOrigin: true, provenanceVerified: false },
  });
  const decision = decideProvenanceFirst([supporting]);
  assert.equal(decision.verdict, "INCONCLUSIVE");
  assert.equal(decision.basis.includes("MISSING_DIRECT_EVIDENCE_IS_NEUTRAL"), true);
  assert.notEqual(decision.verdict, "LIKELY_NON_AI");
});

test("localization artifacts cannot establish AI origin even if their payload is hostile", () => {
  const localization = evidence({
    category: "localization",
    source: "conditional-region-proposal-v1",
    facts: { provenanceVerified: true, aiOrigin: true, evidenceAuthority: "supporting_only" },
  });
  const decision = decideProvenanceFirst([localization]);
  assert.equal(decision.verdict, "INCONCLUSIVE");
  assert.equal(decision.basis.includes("NO_VERIFIED_AI_PROVENANCE"), true);
});

test("a verified visible AI label remains supporting evidence even with hostile provenance fields", () => {
  const visibleMark = evidence({
    category: "visual",
    source: "visible-ai-mark-observation-v1",
    status: "verified_present",
    strength: "strong",
    facts: {
      visibleMark: true,
      claimedProvider: "Example AI",
      claimedProviderIdentityVerified: true,
      provenanceVerified: true,
      aiOrigin: true,
      evidenceAuthority: "supporting_only",
    },
  });
  const decision = decideProvenanceFirst([visibleMark]);
  assert.equal(decision.verdict, "INCONCLUSIVE");
  assert.equal(decision.basis.includes("NO_VERIFIED_AI_PROVENANCE"), true);
});

test("conflicting verified origins abstain", () => {
  const decision = decideProvenanceFirst([
    evidence({ id: "ai", source: "trusted-ai", facts: { provenanceVerified: true, aiOrigin: true } }),
    evidence({ id: "camera", source: "trusted-camera", facts: { provenanceVerified: true, aiOrigin: false } }),
  ]);
  assert.equal(decision.verdict, "INCONCLUSIVE");
  assert.equal(decision.conflicts.length, 1);
  assert.equal(decision.basis[0], "CONFLICTING_VERIFIED_PROVENANCE");
});

test("missing direct evidence never becomes a non-AI decision", () => {
  const decision = decideProvenanceFirst([]);
  assert.equal(decision.verdict, "INCONCLUSIVE");
  assert.notEqual(decision.verdict, "LIKELY_NON_AI");
});

test("DDA is preserved as a supporting model signal without becoming authoritative provenance", () => {
  const modelSignal = evidence({
    category: "model",
    source: "dda-dinov2-lora",
    status: "detected",
    strength: "supporting",
    facts: { score: 0.87, threshold: 0.5, predictedClass: "ai_generated" },
  });
  const decision = decideProvenanceFirst([modelSignal], "2026-07-30T00:00:00.000Z", true);

  assert.equal(decision.verdict, "INCONCLUSIVE");
  assert.equal(decision.modelCoverage, "enabled");
  assert.ok(decision.basis.includes("DDA_SUPPORTING_SIGNAL_AI"));
  assert.notEqual(decision.confidenceBand, "high");
});

test("golden provenance combinations preserve precedence, conflict, and neutral failure semantics", () => {
  const cases: Array<{
    name: string;
    records: EvidenceRecord[];
    verdict: "AI_GENERATED" | "INCONCLUSIVE";
    conflict: boolean;
  }> = [
    {
      name: "trusted",
      records: [evidence({ source: "trusted-ai" })],
      verdict: "AI_GENERATED",
      conflict: false,
    },
    {
      name: "untrusted",
      records: [evidence({ status: "possibly_present", strength: "supporting", facts: { provenanceVerified: false, aiOrigin: true } })],
      verdict: "INCONCLUSIVE",
      conflict: false,
    },
    { name: "missing", records: [], verdict: "INCONCLUSIVE", conflict: false },
    {
      name: "conflicting",
      records: [
        evidence({ id: "trusted-ai", source: "trusted-ai", facts: { provenanceVerified: true, aiOrigin: true } }),
        evidence({ id: "trusted-camera", source: "trusted-camera", facts: { provenanceVerified: true, aiOrigin: false } }),
      ],
      verdict: "INCONCLUSIVE",
      conflict: true,
    },
    {
      name: "failed",
      records: [evidence({ status: "error", strength: "none", facts: { provenanceVerified: false, errorCode: "VALIDATION_FAILED" } })],
      verdict: "INCONCLUSIVE",
      conflict: false,
    },
    {
      name: "unavailable",
      records: [evidence({ status: "detector_unavailable", strength: "none", facts: { provenanceVerified: false, detectionAttempted: false } })],
      verdict: "INCONCLUSIVE",
      conflict: false,
    },
    {
      name: "uncertain",
      records: [evidence({ status: "possibly_present", strength: "supporting", facts: { provenanceVerified: false, payloadMatch: "possible" } })],
      verdict: "INCONCLUSIVE",
      conflict: false,
    },
  ];

  for (const fixture of cases) {
    const decision = decideProvenanceFirst(fixture.records, "2026-08-02T00:00:00.000Z");
    assert.equal(decision.verdict, fixture.verdict, fixture.name);
    assert.equal(decision.conflicts.length > 0, fixture.conflict, fixture.name);
    if (fixture.verdict === "INCONCLUSIVE") {
      assert.notEqual(decision.verdict, "LIKELY_NON_AI", fixture.name);
    }
  }
});

test("replays a sealed provenance decision exactly without mutating evidence or decision", () => {
  const records = [evidence({ id: "trusted-ai", source: "trusted-ai" })];
  const originalRecords = structuredClone(records);
  const decision = decideProvenanceFirst(records, "2026-08-02T01:02:03.000Z", false);
  const originalDecision = structuredClone(decision);
  const replay = replayProvenanceFirst(records, decision);

  assert.equal(replay.policyAvailable, true);
  assert.equal(replay.matches, true);
  assert.deepEqual(replay.mismatchedFields, []);
  assert.deepEqual(replay.replayedDecision, decision);
  assert.deepEqual(records, originalRecords);
  assert.deepEqual(decision, originalDecision);
});

test("reports decision tampering and unavailable historical policy versions", () => {
  const records = [evidence({ source: "trusted-ai" })];
  const decision = decideProvenanceFirst(records, "2026-08-02T01:02:03.000Z");
  const tampered = {
    ...decision,
    verdict: "INCONCLUSIVE" as const,
    basis: ["NO_VERIFIED_AI_PROVENANCE"],
  };
  const replay = replayProvenanceFirst(records, tampered);
  assert.equal(replay.policyAvailable, true);
  assert.equal(replay.matches, false);
  assert.deepEqual(replay.mismatchedFields, ["verdict", "basis"]);

  const unavailablePolicy = replayProvenanceFirst(records, {
    ...decision,
    policyVersion: `${ANALYSIS_POLICY_VERSION}:retired-test-version`,
  });
  assert.equal(unavailablePolicy.policyAvailable, false);
  assert.equal(unavailablePolicy.matches, false);
  assert.deepEqual(unavailablePolicy.mismatchedFields, ["policyVersion"]);
  assert.equal(unavailablePolicy.replayedDecision, undefined);
});
