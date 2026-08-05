import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAutomatedExplanationFixtures,
  evaluateAutomatedExplanationSuite,
} from "../src/automated-explanation-evaluation.js";

test("automated explanation fixtures cover every source label and reject adversarial mutations", () => {
  const report = evaluateAutomatedExplanationSuite();
  assert.equal(report.fixtures, 7);
  assert.equal(report.mutationCases, 39);
  assert.equal(report.canonicalPassRate, 1);
  assert.equal(report.mutationDetectionRate, 1);
  assert.equal(report.publicationPassed, true);
  assert.deepEqual(report.failures, []);
  assert.equal(buildAutomatedExplanationFixtures().length, report.fixtures);
});

test("publication thresholds remain closed when a canonical fixture is invalid", () => {
  const fixtures = buildAutomatedExplanationFixtures();
  const first = fixtures[0];
  assert.ok(first);
  first.decision = { ...first.decision, evidenceRefs: ["missing-evidence"] };
  const report = evaluateAutomatedExplanationSuite(fixtures);
  assert.equal(report.publicationPassed, false);
  assert.ok(report.failures.some((failure) => failure.startsWith(`${first.fixtureId}:canonical:`)));
});
