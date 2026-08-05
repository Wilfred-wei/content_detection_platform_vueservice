import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SERVICE_ROOT = fileURLToPath(new URL("../", import.meta.url));

test("release evidence CLI emits an auditable blocked report for the checked-in pending inputs", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/evaluate-release-evidence.ts"], {
    cwd: SERVICE_ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 3, result.stderr);
  const report = JSON.parse(result.stdout) as {
    schemaVersion: string;
    status: string;
    productionSwapAuthorized: boolean;
    automaticPolicyMutation: boolean;
    checks: Array<{ id: string; status: string; reasons: string[] }>;
  };
  assert.equal(report.schemaVersion, "release-evidence.v1");
  assert.equal(report.status, "blocked");
  assert.equal(report.productionSwapAuthorized, false);
  assert.equal(report.automaticPolicyMutation, false);
  assert.equal(report.checks.find((item) => item.id === "policy_bundle_integrity")?.status, "passed");
  assert.equal(report.checks.find((item) => item.id === "dataset_manifest")?.status, "blocked");
  assert.equal(report.checks.find((item) => item.id === "explanation_evaluation")?.status, "blocked");
});
