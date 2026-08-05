import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  type AigcMarker,
  inspectParsedMetadata,
  LocalMetadataInspector,
  metadataInspectionToEvidence,
} from "../src/metadata-inspector.js";
import {
  controlledEvaluationMetadataAuthentication,
  createEvaluationAigcMarker,
  jpegWithEvaluationAigcXmp,
} from "../src/provenance-evaluation-fixtures.js";

const BASE_JPEG = fileURLToPath(new URL("fixtures/c2pa/C.jpg", import.meta.url));

function marker(overrides: Partial<AigcMarker> = {}): AigcMarker {
  return createEvaluationAigcMarker("unsigned", {
    ContentProducer: "Test Generator",
    ProduceID: "production-id-123",
    ContentPropagator: "Test Generator",
    PropagateID: "production-id-123",
    ...overrides,
  });
}

function jpegWithXmp(aigcMarker: AigcMarker): Buffer {
  return jpegWithEvaluationAigcXmp(readFileSync(BASE_JPEG), aigcMarker);
}

test("normalizes a complete GB 45438-2025 marker as unsigned supporting metadata", () => {
  const inspection = inspectParsedMetadata({ xmp: { aigc: { AIGC: marker() } } });

  assert.equal(inspection.aigc.outcome, "valid_unsigned");
  assert.equal(inspection.aigc.labelMeaning, "confirmed");
  assert.equal(inspection.aigc.authenticated, false);
  assert.equal(inspection.segments.xmp, true);
  assert.equal(inspection.gpsExcluded, true);
});

test("rejects malformed AIGC fields and overlong provider values", () => {
  const malformed = { ...marker(), ContentProducer: "x".repeat(33), PropagateID: 42 };
  const inspection = inspectParsedMetadata({ xmp: { AIGC: malformed } });

  assert.equal(inspection.aigc.outcome, "invalid");
  assert.equal(inspection.aigc.violationCount >= 2, true);
});

test("flags duplicate and contradictory AIGC markers", () => {
  const inspection = inspectParsedMetadata({
    xmp: {
      items: [{ AIGC: marker({ Label: "1" }) }, { AIGC: marker({ Label: "3" }) }],
    },
  });

  assert.equal(inspection.aigc.outcome, "conflict");
  assert.equal(inspection.aigc.markerCount, 2);
  assert.match(inspection.aigc.reason || "", /conflicting/);
});

test("sanitizes provider text and hashes opaque identifiers in evidence", () => {
  const normalized = inspectParsedMetadata({
    xmp: { AIGC: marker({ ContentProducer: "Producer\u0000 Name", ReservedCode1: "private-signature" }) },
  });
  const inspection = { ...normalized, outcome: "parsed" as const };
  const evidence = metadataInspectionToEvidence("analysis-1", inspection).find((item) => item.source === "gb-45438-2025");

  assert.ok(evidence);
  assert.equal(evidence.status, "detected");
  assert.equal(evidence.strength, "supporting");
  assert.equal(evidence.facts.contentProducer, "Producer Name");
  assert.equal(typeof evidence.facts.produceIdSha256, "string");
  assert.equal(String(evidence.facts.produceIdSha256).length, 64);
  assert.equal(JSON.stringify(evidence).includes("production-id-123"), false);
  assert.equal(JSON.stringify(evidence).includes("private-signature"), false);
});

test("parses an embedded XMP AIGC marker from image bytes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "metadata-xmp-"));
  const path = join(directory, "aigc.jpg");
  writeFileSync(path, jpegWithXmp(marker()));

  const inspection = await new LocalMetadataInspector().inspect(path, "image/jpeg");
  assert.equal(inspection.outcome, "parsed");
  assert.equal(inspection.segments.xmp, true);
  assert.equal(inspection.aigc.outcome, "valid_unsigned");
});

test("requires signature, content binding, and issuer trust before strong evidence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "metadata-auth-"));
  const path = join(directory, "aigc.jpg");
  writeFileSync(path, jpegWithXmp(marker({ ReservedCode1: "test-signature" })));
  const inspector = new LocalMetadataInspector({
    async authenticate() {
      return controlledEvaluationMetadataAuthentication();
    },
  });

  const inspection = await inspector.inspect(path, "image/jpeg");
  const evidence = metadataInspectionToEvidence("analysis-1", inspection).find((item) => item.source === "gb-45438-2025");
  assert.equal(inspection.aigc.outcome, "valid_authenticated");
  assert.equal(evidence?.status, "verified_present");
  assert.equal(evidence?.strength, "strong");
});

test("keeps partially validated security material as unsigned", async () => {
  const directory = mkdtempSync(join(tmpdir(), "metadata-partial-auth-"));
  const path = join(directory, "aigc.jpg");
  writeFileSync(path, jpegWithXmp(marker({ ReservedCode1: "test-signature" })));
  const inspector = new LocalMetadataInspector({
    async authenticate() {
      return {
        signatureValidated: true,
        contentBindingValidated: false,
        issuerTrusted: true,
        reason: "Content binding did not validate.",
      };
    },
  });

  const inspection = await inspector.inspect(path, "image/jpeg");
  const evidence = metadataInspectionToEvidence("analysis-1", inspection).find((item) => item.source === "gb-45438-2025");
  assert.equal(inspection.aigc.outcome, "valid_unsigned");
  assert.equal(evidence?.status, "detected");
  assert.equal(evidence?.strength, "supporting");
});

test("bounds recursive metadata traversal", () => {
  const manyFields = Object.fromEntries(Array.from({ length: 2_100 }, (_value, index) => [`field-${index}`, index]));
  const inspection = inspectParsedMetadata({ xmp: manyFields });

  assert.equal(inspection.traversalTruncated, true);
  assert.equal(inspection.fieldCount <= 2_048, true);
});

test("reports unsupported formats without reading them as metadata absence", async () => {
  const inspection = await new LocalMetadataInspector().inspect("/not/read.gif", "image/gif");
  const evidence = metadataInspectionToEvidence("analysis-1", inspection);

  assert.equal(inspection.outcome, "unsupported");
  assert.ok(evidence.every((item) => item.status === "unsupported_format"));
});
