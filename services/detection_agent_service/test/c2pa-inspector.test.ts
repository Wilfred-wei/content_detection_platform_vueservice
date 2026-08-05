import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  type C2paManifestStore,
  c2paInspectionToEvidence,
  LocalC2paInspector,
  normalizeC2paManifest,
} from "../src/c2pa-inspector.js";

const ONE_PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const AI_SOURCE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
const OFFICIAL_C2PA_FIXTURE = fileURLToPath(new URL("fixtures/c2pa/C.jpg", import.meta.url));
const OFFICIAL_TEST_ANCHORS = fileURLToPath(new URL("fixtures/c2pa/trust-anchors.pem", import.meta.url));

function manifestStore(validationState: "Invalid" | "Valid" | "Trusted", digitalSourceType = AI_SOURCE): C2paManifestStore {
  const label = "contentauth:urn:uuid:test";
  return {
    active_manifest: label,
    validation_state: validationState,
    validation_status: validationState === "Valid" ? [{ code: "signingCredential.untrusted" }] : [],
    manifests: {
      [label]: {
        label,
        claim_generator: "test-generator/1.0",
        signature_info: { issuer: "Trusted Test Issuer" },
        assertions: [{
          label: "c2pa.actions.v2",
          data: { actions: [{ action: "c2pa.created", digitalSourceType }] },
        }],
      },
    },
  };
}

test("normalizes trusted AI provenance into strong verified evidence", () => {
  const inspection = normalizeC2paManifest(manifestStore("Trusted"), true, ["Trusted Test"]);
  const evidence = c2paInspectionToEvidence("analysis-1", inspection);

  assert.equal(inspection.outcome, "valid_trusted");
  assert.equal(inspection.aiOrigin, true);
  assert.equal(evidence.status, "verified_present");
  assert.equal(evidence.strength, "strong");
  assert.equal(evidence.facts.provenanceVerified, true);
});

test("downgrades a valid manifest outside issuer policy", () => {
  const inspection = normalizeC2paManifest(manifestStore("Trusted"), true, ["Different Issuer"]);
  const evidence = c2paInspectionToEvidence("analysis-1", inspection);

  assert.equal(inspection.outcome, "valid_untrusted");
  assert.equal(evidence.status, "detected");
  assert.equal(evidence.strength, "supporting");
  assert.equal(evidence.facts.provenanceVerified, false);
});

test("preserves invalid content binding as invalid evidence, never a call error or absence", () => {
  const store = manifestStore("Invalid");
  store.validation_status = [{ code: "assertion.dataHash.mismatch" }];
  const inspection = normalizeC2paManifest(store, true);
  const evidence = c2paInspectionToEvidence("analysis-1", inspection);

  assert.equal(inspection.outcome, "invalid");
  assert.equal(evidence.status, "invalid");
  assert.equal(evidence.facts.validationCodes, "assertion.dataHash.mismatch");
  assert.notEqual(evidence.status, "not_detected");
});

test("reads an ordinary PNG as explicitly absent using the real local c2patool", async () => {
  const directory = mkdtempSync(join(tmpdir(), "c2pa-absent-"));
  const path = join(directory, "pixel.png");
  writeFileSync(path, ONE_PIXEL_PNG);
  const inspection = await new LocalC2paInspector().inspect(path, "image/png");

  assert.equal(inspection.outcome, "absent");
  assert.equal(c2paInspectionToEvidence("analysis-1", inspection).status, "not_detected");
});

test("validates an official embedded C2PA sample without overstating trust", async () => {
  const inspection = await new LocalC2paInspector().inspect(OFFICIAL_C2PA_FIXTURE, "image/jpeg");

  assert.equal(inspection.outcome, "valid_untrusted");
  assert.equal(inspection.validationState, "Valid");
  assert.equal(inspection.aiOrigin, true);
  assert.equal(inspection.embedded, true);
});

test("promotes an official C2PA sample only when its test root is configured", async () => {
  const inspection = await new LocalC2paInspector({
    trustAnchorsPath: OFFICIAL_TEST_ANCHORS,
    trustedIssuerPatterns: ["C2PA Test Signing Cert"],
  }).inspect(OFFICIAL_C2PA_FIXTURE, "image/jpeg");

  assert.equal(inspection.outcome, "valid_trusted");
  assert.equal(inspection.validationState, "Trusted");
  assert.equal(c2paInspectionToEvidence("analysis-1", inspection).strength, "strong");
});

test("reports a modified C2PA asset as invalid content binding", async () => {
  const directory = mkdtempSync(join(tmpdir(), "c2pa-tampered-"));
  const path = join(directory, "C-tampered.jpg");
  const bytes = readFileSync(OFFICIAL_C2PA_FIXTURE);
  bytes[bytes.length - 20] ^= 1;
  writeFileSync(path, bytes);

  const inspection = await new LocalC2paInspector().inspect(path, "image/jpeg");
  assert.equal(inspection.outcome, "invalid");
  assert.equal(inspection.validationState, "Invalid");
  assert.equal(c2paInspectionToEvidence("analysis-1", inspection).status, "invalid");
});

test("distinguishes unsupported input from an absent manifest", async () => {
  const directory = mkdtempSync(join(tmpdir(), "c2pa-unsupported-"));
  const path = join(directory, "plain.txt");
  writeFileSync(path, "not an image");

  const inspection = await new LocalC2paInspector().inspect(path, "text/plain");
  assert.equal(inspection.outcome, "unsupported");
  assert.equal(c2paInspectionToEvidence("analysis-1", inspection).status, "unsupported_format");
});

test("reports a missing local validator as unavailable", async () => {
  const inspection = await new LocalC2paInspector({
    executablePath: "/definitely-not-installed/c2patool",
  }).inspect(OFFICIAL_C2PA_FIXTURE, "image/jpeg");

  assert.equal(inspection.outcome, "unavailable");
  assert.equal(c2paInspectionToEvidence("analysis-1", inspection).status, "detector_unavailable");
});

test("refuses to run when the mandatory offline settings file is missing", async () => {
  const inspection = await new LocalC2paInspector({
    settingsPath: "/definitely-not-installed/c2pa-settings.toml",
  }).inspect(OFFICIAL_C2PA_FIXTURE, "image/jpeg");

  assert.equal(inspection.outcome, "error");
  assert.equal(c2paInspectionToEvidence("analysis-1", inspection).status, "error");
});
