import assert from "node:assert/strict";
import test from "node:test";

import { loadPolicyBundle, parsePolicyBundle, verifyPolicyBundle } from "../src/policy-bundle.js";

test("verifies the immutable policy bundle and keeps it non-authoritative", () => {
  const bundle = loadPolicyBundle();
  assert.equal(bundle.productionSwapAuthorized, false);
  assert.equal(bundle.automaticPolicyMutation, false);
  assert.equal(verifyPolicyBundle(bundle).verifiedEntries, bundle.entries.length);
});

test("rejects policy authority escalation and path traversal", () => {
  const bundle = loadPolicyBundle();
  assert.throws(() => parsePolicyBundle({ ...bundle, productionSwapAuthorized: true }), /INVALID_POLICY_BUNDLE:authority/);
  assert.throws(() => parsePolicyBundle({ ...bundle, entries: [{ ...bundle.entries[0], path: "resources/../secret" }] }), /INVALID_POLICY_BUNDLE:path/);
});
