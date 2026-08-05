import assert from "node:assert/strict";
import test from "node:test";

import type { MediaAsset } from "../src/analysis-types.js";
import { getProvenanceScheme } from "../src/provenance-registry.js";
import {
  ClassicInvisibleWatermarkAdapter,
  JsonProcessTransport,
  MetaWatermarksAdapter,
  RegistryWatermarkInspector,
  SdxlInvisibleWatermarkAdapter,
  TrustMarkPqAdapter,
  WATERMARK_ADAPTER_PROTOCOL_VERSION,
  type WatermarkDetectionResult,
  type WorkerTransport,
} from "../src/watermark-adapters.js";

const asset: MediaAsset = {
  schemaVersion: "1.4.0",
  id: "asset-1",
  filename: "fixture.png",
  mimeType: "image/png",
  sizeBytes: 1234,
  sha256: "a".repeat(64),
  width: 512,
  height: 512,
  storedPath: "/tmp/fixture.png",
  createdAt: "2026-07-28T00:00:00.000Z",
};

function result(overrides: Partial<WatermarkDetectionResult> = {}): WatermarkDetectionResult {
  return {
    protocolVersion: WATERMARK_ADAPTER_PROTOCOL_VERSION,
    schemeId: "sdxl-invisible-watermark",
    adapterId: "sdxl-dwt-dct-v1",
    detectorVersion: "shieldmnt-invisible-watermark-compatible@0.2.0:dwtDct",
    profileId: "diffusers-sdxl-default-48bit-v1",
    outcome: "possibly_present",
    score: 1,
    threshold: 34 / 48,
    payloadMatched: true,
    payload: "b3ec907bb19e",
    attemptedViews: 1,
    latencyMs: 12,
    artifacts: [{ id: "sdxl-default-payload-hex", sha256: "4".repeat(64) }],
    diagnostics: { matchedBits: 48, calibrationApproved: false },
    ...overrides,
  };
}

function trustMarkResult(overrides: Partial<WatermarkDetectionResult> = {}): WatermarkDetectionResult {
  return result({
    schemeId: "adobe-trustmark",
    adapterId: "trustmark-pq-v1",
    detectorVersion: "adobe-trustmark@0.9.1:pq-cpu",
    profileId: "trustmark-pq-rotations-v1",
    score: null,
    threshold: null,
    payload: `sha256:${"6".repeat(64)}`,
    attemptedViews: 8,
    diagnostics: { consistentViews: 2, calibrationApproved: false },
    ...overrides,
  });
}

function metaResult(overrides: Partial<WatermarkDetectionResult> = {}): WatermarkDetectionResult {
  return result({
    schemeId: "meta-videoseal-v1",
    adapterId: "meta-watermarks-v1",
    detectorVersion: "meta-watermarks:videoseal@870ca7fb:wam@2c08af04",
    profileId: "videoseal-v1",
    score: 205 / 256,
    threshold: 200 / 256,
    payload: `sha256:${"7".repeat(64)}`,
    diagnostics: { matchingBits: 205, calibrationApproved: false },
    ...overrides,
  });
}

function classicResult(overrides: Partial<WatermarkDetectionResult> = {}): WatermarkDetectionResult {
  return result({
    schemeId: "classic-dwt-dct-svd",
    adapterId: "classic-invisible-watermarks-v1",
    detectorVersion: "shieldmnt-invisible-watermark@0.2.0:dwtDctSvd",
    profileId: "classic-dwt-dct-svd-64bit-v1",
    score: 1,
    threshold: 52 / 64,
    payload: "a17ec3d459b268f0",
    diagnostics: { matchedBits: 64, calibrationApproved: false },
    ...overrides,
  });
}

class StubTransport implements WorkerTransport {
  constructor(private readonly response: unknown) {}
  async execute(): Promise<unknown> { return this.response; }
}

test("normalizes an exact SDXL payload match as supporting evidence before calibration", async () => {
  const inspector = new RegistryWatermarkInspector([
    new SdxlInvisibleWatermarkAdapter(new StubTransport(result())),
  ]);
  const evidence = await inspector.inspect("analysis-1", asset, "2026-07-28T00:00:00.000Z");
  const sdxl = evidence.find((item) => item.source === "sdxl-invisible-watermark");

  assert.equal(sdxl?.status, "possibly_present");
  assert.equal(sdxl?.strength, "supporting");
  assert.equal(sdxl?.facts.payloadMatched, true);
  assert.equal(sdxl?.facts.adapterId, "sdxl-dwt-dct-v1");
  assert.equal(sdxl?.facts.absenceEstablished, false);
  assert.match(String(sdxl?.facts.artifactDigests), /watermark-classic-uv-lock/);
  assert.doesNotMatch(String(sdxl?.facts.artifactDigests), /"4{64}"/);
});

test("preserves a calibrated not-detected result as neutral evidence", async () => {
  const inspector = new RegistryWatermarkInspector([
    new SdxlInvisibleWatermarkAdapter(new StubTransport(result({
      outcome: "not_detected",
      score: 20 / 48,
      payloadMatched: false,
      payload: "000000000000",
    }))),
  ]);
  const evidence = await inspector.inspect("analysis-1", asset);
  const sdxl = evidence.find((item) => item.source === "sdxl-invisible-watermark");

  assert.equal(sdxl?.status, "not_detected");
  assert.equal(sdxl?.strength, "none");
  assert.equal(sdxl?.facts.absenceEstablished, true);
});

test("rejects malformed worker output without allowing it to become evidence", async () => {
  const inspector = new RegistryWatermarkInspector([
    new SdxlInvisibleWatermarkAdapter(new StubTransport({ outcome: "verified_present" })),
  ]);
  const evidence = await inspector.inspect("analysis-1", asset);
  const sdxl = evidence.find((item) => item.source === "sdxl-invisible-watermark");

  assert.equal(sdxl?.status, "error");
  assert.equal(sdxl?.strength, "none");
  assert.equal(sdxl?.facts.errorCode, "WORKER_MALFORMED_RESPONSE");
});

test("reports a missing adapter as unavailable instead of not detected", async () => {
  const inspector = new RegistryWatermarkInspector([]);
  const evidence = await inspector.inspect("analysis-1", asset);
  const sdxl = evidence.find((item) => item.source === "sdxl-invisible-watermark");

  assert.equal(sdxl?.status, "detector_unavailable");
  assert.equal(sdxl?.facts.detectionAttempted, false);
  assert.equal(sdxl?.facts.absenceEstablished, false);
});

test("preserves worker timeout as an attempted but inconclusive outcome", async () => {
  const transport: WorkerTransport = {
    async execute() { throw new Error("WORKER_TIMEOUT"); },
  };
  const inspector = new RegistryWatermarkInspector([new SdxlInvisibleWatermarkAdapter(transport)]);
  const evidence = await inspector.inspect("analysis-1", asset);
  const sdxl = evidence.find((item) => item.source === "sdxl-invisible-watermark");

  assert.equal(sdxl?.status, "error");
  assert.equal(sdxl?.facts.outcome, "timeout");
  assert.equal(sdxl?.facts.detectionAttempted, true);
  assert.equal(sdxl?.facts.absenceEstablished, false);
});

test("adapter sends the exact registry profile to the worker transport", async () => {
  let requestPayload: unknown;
  const transport: WorkerTransport = {
    async execute(payload) {
      requestPayload = payload;
      return result();
    },
  };
  const scheme = getProvenanceScheme("sdxl-invisible-watermark");
  assert.ok(scheme);
  const profile = scheme.execution.profiles[0];
  assert.ok(profile);
  const adapter = new SdxlInvisibleWatermarkAdapter(transport);

  await adapter.detect({
    analysisId: "analysis-1",
    asset,
    scheme,
    profile,
    deadlineAt: new Date(Date.now() + 1000).toISOString(),
  });

  assert.equal((requestPayload as { settings: Record<string, unknown> }).settings.expectedPayloadHex, "b3ec907bb19e");
  assert.equal((requestPayload as { settings: Record<string, unknown> }).settings.expectedPayloadBits, 48);
});

test("adapter rejects unsupported dimensions before starting the worker", async () => {
  let called = false;
  const transport: WorkerTransport = {
    async execute() {
      called = true;
      return result();
    },
  };
  const scheme = getProvenanceScheme("sdxl-invisible-watermark");
  assert.ok(scheme);
  const profile = scheme.execution.profiles[0];
  assert.ok(profile);
  const adapter = new SdxlInvisibleWatermarkAdapter(transport);

  const detection = await adapter.detect({
    analysisId: "analysis-1",
    asset: { ...asset, width: 1, height: 1 },
    scheme,
    profile,
    deadlineAt: new Date(Date.now() + 1000).toISOString(),
  });

  assert.equal(called, false);
  assert.equal(detection.outcome, "unsupported_format");
  assert.equal(detection.diagnostics.reason, "dimensions");
});

test("TrustMark adapter sends the exact P/Q multi-view registry profile", async () => {
  let requestPayload: unknown;
  const transport: WorkerTransport = {
    async execute(payload) {
      requestPayload = payload;
      return trustMarkResult();
    },
  };
  const scheme = getProvenanceScheme("adobe-trustmark");
  assert.ok(scheme);
  const profile = scheme.execution.profiles[0];
  assert.ok(profile);

  const detection = await new TrustMarkPqAdapter(transport).detect({
    analysisId: "analysis-1",
    asset,
    scheme,
    profile,
    deadlineAt: new Date(Date.now() + 1000).toISOString(),
  });

  const settings = (requestPayload as { settings: Record<string, unknown> }).settings;
  assert.equal(settings.models, "P,Q");
  assert.equal(settings.rotations, "0,90,180,270");
  assert.equal(settings.calibrationApproved, false);
  assert.equal(detection.outcome, "possibly_present");
  assert.ok(detection.artifacts.some((artifact) => artifact.id === "trustmark-p-decoder"));
});

test("TrustMark adapter rejects undersized images before model loading", async () => {
  let called = false;
  const transport: WorkerTransport = {
    async execute() {
      called = true;
      return trustMarkResult();
    },
  };
  const scheme = getProvenanceScheme("adobe-trustmark");
  assert.ok(scheme);
  const profile = scheme.execution.profiles[0];
  assert.ok(profile);

  const detection = await new TrustMarkPqAdapter(transport).detect({
    analysisId: "analysis-1",
    asset: { ...asset, width: 32, height: 32 },
    scheme,
    profile,
    deadlineAt: new Date(Date.now() + 1000).toISOString(),
  });

  assert.equal(called, false);
  assert.equal(detection.outcome, "unsupported_format");
  assert.equal(detection.diagnostics.reason, "dimensions");
});

test("Meta adapter applies a validated deployment device override", async () => {
  let requestPayload: unknown;
  const transport: WorkerTransport = {
    async execute(payload) {
      requestPayload = payload;
      return metaResult();
    },
  };
  const scheme = getProvenanceScheme("meta-videoseal-v1");
  assert.ok(scheme);
  const profile = scheme.execution.profiles[0];
  assert.ok(profile);

  await new MetaWatermarksAdapter(transport, "cuda:3").detect({
    analysisId: "analysis-1",
    asset,
    scheme,
    profile,
    deadlineAt: new Date(Date.now() + 1000).toISOString(),
  });

  const settings = (requestPayload as { settings: Record<string, unknown> }).settings;
  assert.equal(settings.device, "cuda:3");
  assert.equal(settings.calibrationApproved, false);
});

test("Meta adapter serializes GPU worker admission", async () => {
  let active = 0;
  let maximumActive = 0;
  const transport: WorkerTransport = {
    async execute() {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active -= 1;
      return metaResult();
    },
  };
  const scheme = getProvenanceScheme("meta-videoseal-v1");
  assert.ok(scheme);
  const profile = scheme.execution.profiles[0];
  assert.ok(profile);
  const adapter = new MetaWatermarksAdapter(transport);
  const detectionRequest = {
    analysisId: "analysis-1",
    asset,
    scheme,
    profile,
    deadlineAt: new Date(Date.now() + 2000).toISOString(),
  };

  await Promise.all([adapter.detect(detectionRequest), adapter.detect(detectionRequest)]);
  assert.equal(maximumActive, 1);
});

test("classic adapter sends the registered algorithm and payload profile", async () => {
  let requestPayload: unknown;
  const transport: WorkerTransport = {
    async execute(payload) {
      requestPayload = payload;
      return classicResult();
    },
  };
  const scheme = getProvenanceScheme("classic-dwt-dct-svd");
  assert.ok(scheme);
  const profile = scheme.execution.profiles[0];
  assert.ok(profile);

  const detection = await new ClassicInvisibleWatermarkAdapter(transport).detect({
    analysisId: "analysis-1",
    asset,
    scheme,
    profile,
    deadlineAt: new Date(Date.now() + 1000).toISOString(),
  });

  const settings = (requestPayload as { settings: Record<string, unknown> }).settings;
  assert.equal(settings.method, "dwtDctSvd");
  assert.equal(settings.expectedPayloadHex, "a17ec3d459b268f0");
  assert.equal(detection.outcome, "possibly_present");
});

test("JSON process transport exchanges one bounded request without a shell", async () => {
  process.env.WATERMARK_TEST_SECRET = "must-not-reach-worker";
  const transport = new JsonProcessTransport({
    command: process.execPath,
    args: [
      "-e",
      "let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({received:JSON.parse(data),secret:process.env.WATERMARK_TEST_SECRET||null})))",
    ],
    cwd: process.cwd(),
  });

  const response = await transport.execute({ marker: "contract" }, new Date(Date.now() + 2000).toISOString());
  delete process.env.WATERMARK_TEST_SECRET;

  assert.deepEqual(response, { received: { marker: "contract" }, secret: null });
});
