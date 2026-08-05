import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LegacyAiDetectionAdapter, type LegacyAiDetectionConfig } from "../src/legacy-ai-detection-adapter.js";
import type { MediaAsset } from "../src/analysis-types.js";

const asset: MediaAsset = {
  schemaVersion: "1.17.0",
  id: "asset",
  filename: "sample.png",
  mimeType: "image/png",
  sizeBytes: 3,
  sha256: "a".repeat(64),
  storedPath: join(mkdtempSync(join(tmpdir(), "legacy-adapter-")), "sample.bin"),
  createdAt: new Date().toISOString(),
};

const config: LegacyAiDetectionConfig = {
  enabled: true,
  url: "http://127.0.0.1:9999/detect",
  timeoutMs: 200,
  threshold: 0.5,
  modelVersion: "legacy-test-v1",
};

test("normalizes a legacy service score and keeps heatmap as non-authoritative diagnostics", async () => {
  writeFileSync(asset.storedPath, Buffer.from("png"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { dataBase64: string; sha256: string };
    assert.equal(body.dataBase64, Buffer.from("png").toString("base64"));
    assert.equal(body.sha256, asset.sha256);
    return new Response(JSON.stringify({ score: 0.82, prediction: "ai_generated", modelVersion: "legacy-v2", heatmap: { ignored: true } }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await new LegacyAiDetectionAdapter(config).detect(asset);
    assert.equal(result.detectorId, "ai-detection-service");
    assert.equal(result.outcome, "detected");
    assert.equal(result.predictedClass, "ai_generated");
    assert.equal(result.detectorVersion, "legacy-v2");
    assert.equal(result.diagnostics.heatmapAvailable, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed legacy scores and disabled adapters", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ score: 4 }), { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(() => new LegacyAiDetectionAdapter(config).detect(asset), /LEGACY_MODEL_MALFORMED_RESPONSE/);
    await assert.rejects(() => new LegacyAiDetectionAdapter({ ...config, enabled: false }).detect(asset), /LEGACY_MODEL_DISABLED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
