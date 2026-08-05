import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AnalysisService } from "../src/analysis-service.js";
import { AnalysisStore } from "../src/analysis-store.js";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("rejects same-version stale writes and never exposes the idempotency key", () => {
  const directory = mkdtempSync(join(tmpdir(), "analysis-store-cas-"));
  const store = new AnalysisStore(directory);
  const service = new AnalysisService(store, 1024 * 1024);
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG, idempotencyKey: "private-client-key" });
  const first = store.get(submitted.analysis.id)!;
  const stale = structuredClone(first);
  first.stateVersion += 1;
  first.updatedAt = new Date().toISOString();
  store.save(first);
  assert.throws(() => store.save(stale), /STATE_VERSION_CONFLICT/);
  assert.equal((submitted.analysis as unknown as { idempotencyKey?: string }).idempotencyKey, "private-client-key");
});

test("rejects duplicate evidence ids and non-monotonic progress", () => {
  const store = new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-store-invariants-")));
  const service = new AnalysisService(store, 1024 * 1024);
  const submitted = service.submit({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG });
  const analysis = store.get(submitted.analysis.id)!;
  analysis.stateVersion += 1;
  analysis.evidence.push(structuredClone({
    schemaVersion: "1.17.0",
    id: "duplicate",
    analysisId: analysis.id,
    category: "integrity",
    source: "test",
    status: "detected",
    strength: "informational",
    summary: "test",
    facts: {},
    createdAt: new Date().toISOString(),
  }));
  analysis.evidence.push(structuredClone(analysis.evidence.at(-1)!));
  assert.throws(() => store.save(analysis), /EVIDENCE_ID_CONFLICT/);

  const fresh = store.get(submitted.analysis.id)!;
  fresh.stateVersion += 1;
  fresh.progressEvents[0]!.sequence = 3;
  assert.throws(() => store.save(fresh), /PROGRESS_SEQUENCE_CONFLICT/);
});
