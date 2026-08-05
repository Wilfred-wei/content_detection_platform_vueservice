import assert from "node:assert/strict";
import test from "node:test";

import { ANALYSIS_SCHEMA_VERSION, type EvidenceRecord } from "../src/analysis-types.js";
import {
  applyProvenanceShortCircuitGate,
  loadProvenanceRegistry,
  resolveProvenanceShortCircuit,
  validateProvenanceRegistry,
  type ProvenanceRegistry,
  type ProvenanceScheme,
} from "../src/provenance-registry.js";
import {
  evaluateProvenanceReleaseGate,
  loadProvenanceReleaseGateRegistry,
  provenanceCompatibilityScopeSha256,
  provenanceSchemeIdentitySha256,
  validateProvenanceReleaseGateRegistry,
  wilsonUpperBound95,
  type ProvenanceReleaseGate,
  type ProvenanceReleaseGateRegistry,
} from "../src/provenance-release-gates.js";

const digest = (character: string) => character.repeat(64);

interface ApprovedFixture {
  registry: ProvenanceRegistry;
  gates: ProvenanceReleaseGateRegistry;
  scheme: ProvenanceScheme;
  gate: ProvenanceReleaseGate;
}

function approvedFixture(): ApprovedFixture {
  const registry = structuredClone(loadProvenanceRegistry());
  const gates = structuredClone(loadProvenanceReleaseGateRegistry());
  const scheme = registry.schemes.find((candidate) => candidate.id === "c2pa");
  const gate = gates.gates.find((candidate) => candidate.schemeId === "c2pa");
  assert.ok(scheme);
  assert.ok(gate);

  scheme.calibration = { status: "approved", artifact: digest("c") };
  scheme.shortCircuit.policy = "eligible";
  gate.decision = "approved";
  gate.evaluatedAt = "2026-08-02T00:00:00.000Z";
  gate.datasetManifestSha256 = digest("a");
  gate.evaluatorSha256 = digest("b");
  gate.falsePositive = {
    status: "passed",
    artifactSha256: digest("f"),
    unmarkedControls: gates.policy.minimumUnmarkedControls,
    falsePositives: 0,
  };
  gate.calibration = {
    status: "passed",
    artifactSha256: scheme.calibration.artifact,
    profileIds: scheme.execution.profiles.map((profile) => profile.id),
    completeMultiViewProcedure: true,
  };
  gate.compatibility = {
    status: "passed",
    artifactSha256: digest("d"),
    declaredScopeSha256: provenanceCompatibilityScopeSha256(scheme),
  };
  gate.robustness = {
    status: "passed",
    artifactSha256: digest("e"),
    coveredTransformations: [...gates.policy.requiredTransformations],
    correctCases: 950,
    totalCases: 1000,
  };
  gate.schemeIdentitySha256 = provenanceSchemeIdentitySha256(scheme);
  return { registry, gates, scheme, gate };
}

function strongEvidence(source = "c2pa"): EvidenceRecord {
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: "strong-evidence",
    analysisId: "analysis-1",
    category: "provenance",
    source,
    status: "verified_present",
    strength: "strong",
    summary: "签名、内容绑定和信任链均已验证。",
    facts: { schemeId: source, provenanceVerified: true, aiOrigin: true },
    createdAt: "2026-08-02T00:00:00.000Z",
  };
}

test("loads an immutable per-scheme gate for every current short-circuit candidate", () => {
  const registry = loadProvenanceRegistry();
  const gates = loadProvenanceReleaseGateRegistry();
  const candidates = registry.schemes.filter((scheme) => scheme.shortCircuit.policy === "candidate_after_gate");

  assert.equal(gates.provenanceRegistryVersion, registry.registryVersion);
  assert.equal(gates.policy.minimumUnmarkedControls, 10000);
  assert.equal(gates.policy.requiredTransformations.includes("screenshot"), true);
  assert.equal(candidates.length, gates.gates.length);
  for (const scheme of candidates) {
    const gate = gates.gates.find((candidate) => candidate.id === scheme.shortCircuit.gateId);
    assert.equal(gate?.schemeId, scheme.id);
    assert.equal(gate?.decision, "incomplete");
    assert.equal(resolveProvenanceShortCircuit(scheme.id).eligible, false);
  }
});

test("approves short-circuit registration only when all four gate families pass", () => {
  const fixture = approvedFixture();
  validateProvenanceReleaseGateRegistry(fixture.gates);
  const evaluation = evaluateProvenanceReleaseGate(fixture.scheme, fixture.registry.registryVersion, fixture.gates);

  assert.equal(evaluation.passed, true);
  assert.deepEqual(evaluation.reasons, []);
  assert.doesNotThrow(() => validateProvenanceRegistry(fixture.registry, fixture.gates));
  assert.ok(wilsonUpperBound95(0, fixture.gates.policy.minimumUnmarkedControls) < fixture.gates.policy.maximumWilsonUpperBound95);
});

test("does not allow a gate file to weaken the code-owned safety floor", () => {
  const mutations: Array<(gates: ProvenanceReleaseGateRegistry) => void> = [
    (gates) => { gates.policy.minimumUnmarkedControls = 1; },
    (gates) => { gates.policy.maximumFalsePositiveRate = 1; },
    (gates) => { gates.policy.maximumWilsonUpperBound95 = 1; },
    (gates) => { gates.policy.minimumRobustnessCorrectness = 0; },
    (gates) => { gates.policy.requiredTransformations = gates.policy.requiredTransformations.filter((item) => item !== "adversarial"); },
  ];

  for (const mutate of mutations) {
    const gates = structuredClone(loadProvenanceReleaseGateRegistry());
    mutate(gates);
    assert.throws(() => validateProvenanceReleaseGateRegistry(gates), /INVALID_PROVENANCE_RELEASE_GATES:policy/);
  }
});

test("rejects every independent release-gate bypass", async (context) => {
  const cases: Array<{ name: string; mutate: (fixture: ApprovedFixture) => void; pattern: RegExp }> = [
    {
      name: "false-positive rate or statistical upper bound fails",
      mutate: ({ gate }) => { gate.falsePositive.falsePositives = 2; },
      pattern: /false_positive_gate_failed/,
    },
    {
      name: "calibration does not cover the complete procedure",
      mutate: ({ gate }) => { gate.calibration.completeMultiViewProcedure = false; },
      pattern: /calibration_gate_failed/,
    },
    {
      name: "compatibility scope is not the declared scheme scope",
      mutate: ({ gate }) => { gate.compatibility.declaredScopeSha256 = digest("0"); },
      pattern: /compatibility_gate_failed/,
    },
    {
      name: "robustness correctness is below the code-owned floor",
      mutate: ({ gate }) => { gate.robustness.correctCases = 949; },
      pattern: /robustness_gate_failed/,
    },
    {
      name: "scheme changes after evaluation",
      mutate: ({ scheme }) => { scheme.compatibility.push("unreviewed product scope"); },
      pattern: /release_gate_scheme_identity_mismatch|compatibility_gate_failed/,
    },
    {
      name: "gate decision is not approved",
      mutate: ({ gate }) => { gate.decision = "incomplete"; },
      pattern: /release_gate_incomplete/,
    },
  ];

  for (const gateCase of cases) {
    await context.test(gateCase.name, () => {
      const fixture = approvedFixture();
      gateCase.mutate(fixture);
      assert.throws(() => validateProvenanceRegistry(fixture.registry, fixture.gates), gateCase.pattern);
    });
  }

  await context.test("registration references a missing gate", () => {
    const fixture = approvedFixture();
    fixture.scheme.shortCircuit.gateId = "missing-gate";
    assert.throws(() => validateProvenanceRegistry(fixture.registry, fixture.gates), /releaseGateMismatch/);
  });

  await context.test("gate registry targets another provenance registry version", () => {
    const fixture = approvedFixture();
    fixture.gates.provenanceRegistryVersion = "stale-registry";
    assert.throws(
      () => validateProvenanceRegistry(fixture.registry, fixture.gates),
      /releaseGateRegistryVersion|INVALID_PROVENANCE_RELEASE_GATES:.*:registryVersion/,
    );
  });
});

test("runtime gate downgrades unapproved or unknown strong evidence before decisioning", () => {
  const blocked = applyProvenanceShortCircuitGate(strongEvidence());
  assert.equal(blocked.status, "verified_present");
  assert.equal(blocked.strength, "supporting");
  assert.equal(blocked.facts.shortCircuitAuthorized, false);
  assert.match(String(blocked.facts.releaseGateReasons), /release_gate_incomplete/);

  const unknown = applyProvenanceShortCircuitGate(strongEvidence("unregistered-worker-scheme"));
  assert.equal(unknown.strength, "supporting");
  assert.match(String(unknown.facts.releaseGateReasons), /scheme_not_registered/);

  const approved = applyProvenanceShortCircuitGate(strongEvidence(), (schemeId) => ({
    schemeId,
    gateId: "approved-test-gate",
    gateRegistryVersion: "test-gates-v1",
    passed: true,
    eligible: true,
    reasons: [],
  }));
  assert.equal(approved.strength, "strong");
  assert.equal(approved.facts.shortCircuitAuthorized, true);
});
