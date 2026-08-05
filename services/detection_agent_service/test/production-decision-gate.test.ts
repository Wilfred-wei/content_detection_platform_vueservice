import assert from "node:assert/strict";
import test from "node:test";

import { applyProductionDecisionGate, type ProductionDecisionGate } from "../src/analysis-service.js";
import type { DecisionRecord } from "../src/analysis-types.js";

const candidate: DecisionRecord = {
  schemaVersion: "1.17.0",
  verdict: "AI_GENERATED",
  confidenceBand: "high",
  basis: ["AI_FINAL_MULTIMODAL_ADJUDICATION"],
  evidenceRefs: ["model-1"],
  conflicts: [],
  modelCoverage: "enabled",
  policyVersion: "policy-v1",
  decidedAt: "2026-08-05T00:00:00.000Z",
};

const blocked: ProductionDecisionGate = { authorized: false, reason: "release_evidence_pending" };
const authorized: ProductionDecisionGate = { authorized: true, reason: "operator_promoted" };

test("closed production gate preserves the AI opinion but publishes an inconclusive product decision", () => {
  const result = applyProductionDecisionGate(candidate, { ...candidate, verdict: "INCONCLUSIVE", basis: ["NO_VERIFIED_AI_PROVENANCE"] }, blocked);
  assert.equal(result.verdict, "INCONCLUSIVE");
  assert.equal(result.confidenceBand, "unavailable");
  assert.ok(result.basis.includes("PRODUCTION_ACCURACY_GATE_BLOCKED"));
  assert.ok(result.conflicts.includes("PRODUCTION_LABELING_GATE:release_evidence_pending"));
  assert.equal(result.evidenceRefs[0], "model-1");
});

test("closed production gate does not suppress verified provenance", () => {
  const provenance: DecisionRecord = {
    ...candidate,
    verdict: "AI_GENERATED",
    basis: ["VERIFIED_PROVENANCE:c2pa"],
    policyVersion: "provenance-v1",
  };
  assert.deepEqual(applyProductionDecisionGate(provenance, provenance, blocked), provenance);
});

test("authorized production gate leaves the adjudicated decision unchanged", () => {
  assert.deepEqual(applyProductionDecisionGate(candidate, { ...candidate, verdict: "INCONCLUSIVE" }, authorized), candidate);
});
