import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AnalysisService } from "../src/analysis-service.js";
import { AnalysisStore } from "../src/analysis-store.js";
import { loadConfig } from "../src/config.js";
import type { ExplanationVerifier } from "../src/explanation-verifier.js";
import type { ConversationEngine } from "../src/pi-engine.js";
import { createAgentServer } from "../src/server.js";
import { SessionStore } from "../src/session-store.js";
import type { ReportSynthesizer } from "../src/report-synthesizer.js";

const engine: ConversationEngine = {
  prompt: async (input) => `Pi received: ${input}`,
  abort: async () => {},
  dispose: () => {},
  toolNames: () => [],
};
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const reportSynthesizer: ReportSynthesizer = {
  async synthesize(input) {
    return {
      text: input.decision.verdict === "INCONCLUSIVE"
        ? "当前证据不足，无法确定图像是否由 AI 生成。模型检测由当前策略禁用，本次未调用模型服务。"
        : "检测结论为 AI 生成。模型检测由当前策略禁用，本次未调用模型服务。",
      provider: "test-provider",
      model: "test-model",
      generatedAt: "2026-07-29T00:00:00.000Z",
    };
  },
};
const explanationVerifier: ExplanationVerifier = {
  async verify() {
    return {
      provider: "test-verifier",
      model: "test-verifier-model",
      checks: ([
        ["positive", "semantic_positive", "YES"],
        ["inverse", "semantic_inverse", "NO"],
        ["paraphrase", "semantic_paraphrase", "YES"],
        ["forced_choice", "semantic_forced_choice", "ALIGNED"],
      ] as const).map(([id, method, answer]) => ({
        id: `polarity_${id}`,
        passed: true,
        outcome: "supported" as const,
        method,
        detail: "supported",
        answer,
      })),
    };
  },
};

function analysisService() {
  return new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "agent-server-"))),
    10 * 1024 * 1024,
    reportSynthesizer,
    explanationVerifier,
  );
}

test("exposes capabilities and a complete chat round trip", async (t) => {
  const config = { ...loadConfig({}), providerReady: true };
  const store = new SessionStore(async () => engine, 5, 10);
  const server = createAgentServer(config, store, analysisService());
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => { store.close(); server.close(); });

  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const capabilityResponse = await fetch(`${base}/v1/capabilities`);
  const capabilityBody = await capabilityResponse.json() as { data: { capabilities: Array<{ id: string; status: string; modelPolicy?: string; modelRegistry?: { version: string }; provenanceRegistry?: { version: string } }> } };
  assert.equal(capabilityResponse.headers.get("cache-control"), "no-store");
  assert.equal(capabilityBody.data.capabilities[0].status, "framework_ready");
  assert.equal(capabilityBody.data.capabilities[0].provenanceRegistry?.version, "2026-07-29.2");
  assert.equal(capabilityBody.data.capabilities[0].modelRegistry?.version, "2026-08-03.1");
  assert.equal(capabilityBody.data.capabilities[0].modelPolicy, "disabled");

  const registryResponse = await fetch(`${base}/v1/provenance/registry`);
  const registryBody = await registryResponse.json() as { data: { schemes: Array<{ id: string }> } };
  assert.equal(registryResponse.status, 200);
  assert.ok(registryBody.data.schemes.some((scheme) => scheme.id === "c2pa"));

  const modelRegistryResponse = await fetch(`${base}/v1/models/registry`);
  const modelRegistryBody = await modelRegistryResponse.json() as { data: { candidates: Array<{ id: string; runtimeEligibility: string }> } };
  assert.equal(modelRegistryResponse.status, 200);
  assert.equal(modelRegistryBody.data.candidates.find((candidate) => candidate.id === "mirror-dinov3-hplus")?.runtimeEligibility, "experimental_supporting");
  assert.equal(modelRegistryBody.data.candidates.find((candidate) => candidate.id === "rem-dinov3-hplus")?.runtimeEligibility, "unavailable");

  const modelRuntimeResponse = await fetch(`${base}/v1/models/runtime`);
  const modelRuntimeBody = await modelRuntimeResponse.json() as { data: { models: Array<{ detectorId: string; residency: string; admission: string; microbatchSize: number }> } };
  assert.equal(modelRuntimeResponse.status, 200);
  assert.ok(modelRuntimeBody.data.models.some((model) => model.detectorId === "model-policy-disabled"));
  assert.ok(modelRuntimeBody.data.models.every((model) => model.microbatchSize === 1));

  const readinessResponse = await fetch(`${base}/v1/release/readiness`);
  const readinessBody = await readinessResponse.json() as { data: { schemaVersion: string; status: string; productionSwapAuthorized: boolean; checks: Array<{ id: string; status: string }> } };
  assert.equal(readinessResponse.status, 200);
  assert.equal(readinessBody.data.schemaVersion, "release-readiness.v1");
  assert.equal(readinessBody.data.status, "blocked");
  assert.equal(readinessBody.data.productionSwapAuthorized, false);
  assert.ok(readinessBody.data.checks.some((check) => check.id === "model_quality_and_capacity" && check.status === "blocked"));

  const created = await fetch(`${base}/v1/sessions`, { method: "POST" });
  const createdBody = await created.json() as { data: { id: string } };
  const chat = await fetch(`${base}/v1/sessions/${createdBody.data.id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "hello" }),
  });
  const chatBody = await chat.json() as { data: { messages: Array<{ content: string }> } };
  assert.equal(chatBody.data.messages.at(-1)?.content, "Pi received: hello");
});

test("tests and applies masked runtime configuration", async (t) => {
  const config = loadConfig({});
  const store = new SessionStore(async () => engine, 5, 10);
  let testedProvider = "";
  const server = createAgentServer(config, store, analysisService(), {
    testConnection: async (candidate) => { testedProvider = candidate.provider; },
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => { store.close(); server.close(); });

  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const payload = {
    provider: "custom-openai",
    model: "local-model",
    baseUrl: "http://127.0.0.1:9000/v1",
    apiKey: "test-secret",
    allowAnonymous: false,
  };

  const testResponse = await fetch(`${base}/v1/config/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(testResponse.status, 200);
  assert.equal(testedProvider, "custom-openai");
  assert.equal(config.provider, "openai");

  const updateResponse = await fetch(`${base}/v1/config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const updateBody = await updateResponse.json() as { data: Record<string, unknown> };
  assert.equal(updateResponse.status, 200);
  assert.equal(updateBody.data.apiKeyConfigured, true);
  assert.equal(updateBody.data.apiKey, undefined);
  assert.equal(updateBody.data.sessionsReset, true);

  const readResponse = await fetch(`${base}/v1/config`);
  const readBody = await readResponse.json() as { data: Record<string, unknown> };
  assert.equal(readBody.data.provider, "custom-openai");
  assert.equal(readBody.data.apiKey, undefined);
});

test("submits an image and returns status, evidence, and a sealed report", async (t) => {
  const config = { ...loadConfig({}), providerReady: true };
  const store = new SessionStore(async () => engine, 5, 10);
  const server = createAgentServer(config, store, analysisService());
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => { store.close(); server.close(); });

  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const submitted = await fetch(`${base}/v1/analyses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG }),
  });
  assert.equal(submitted.status, 202);
  const submittedBody = await submitted.json() as { data: { id: string; asset: Record<string, unknown> } };
  assert.equal(submittedBody.data.asset.storedPath, undefined);
  assert.equal((submittedBody.data as Record<string, unknown>).idempotencyKey, undefined);

  let state = "queued";
  for (let attempt = 0; attempt < 20 && state !== "completed"; attempt += 1) {
    const response = await fetch(`${base}/v1/analyses/${submittedBody.data.id}`);
    const body = await response.json() as { data: { state: string } };
    state = body.data.state;
    if (state !== "completed") await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(state, "completed");

  const evidence = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/evidence`);
  const evidenceBody = await evidence.json() as { data: { evidence: unknown[] } };
  assert.ok(evidenceBody.data.evidence.length >= 4);
  const asset = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/asset`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "image/png");
  assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), Buffer.from(ONE_PIXEL_PNG, "base64"));
  const report = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/report`);
  const reportBody = await report.json() as { data: { sealed: boolean; explanation: string; synthesis: { model: string }; decision: { verdict: string } } };
  assert.equal(reportBody.data.sealed, true);
  assert.equal(reportBody.data.decision.verdict, "INCONCLUSIVE");
  assert.match(reportBody.data.explanation, /证据不足/);
  assert.equal(reportBody.data.synthesis.model, "test-model");
});

test("exposes cursor progress, queue metrics, export, and authorized asset deletion", async (t) => {
  const config = { ...loadConfig({ AGENT_ALLOW_ASSET_DELETION: "true" }), providerReady: true };
  const store = new SessionStore(async () => engine, 5, 10);
  const server = createAgentServer(config, store, analysisService());
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => { store.close(); server.close(); });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const submitted = await fetch(`${base}/v1/analyses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG, idempotencyKey: `cursor-${Date.now()}` }),
  });
  const submittedBody = await submitted.json() as { data: { id: string } };
  let state = "queued";
  for (let attempt = 0; attempt < 40 && state !== "completed"; attempt += 1) {
    const response = await fetch(`${base}/v1/analyses/${submittedBody.data.id}`);
    state = ((await response.json()) as { data: { state: string } }).data.state;
    if (state !== "completed") await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(state, "completed");
  const progress = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/progress?cursor=0`);
  const progressBody = await progress.json() as { data: { terminal: boolean; events: unknown[]; nextCursor: number } };
  assert.equal(progressBody.data.terminal, true);
  assert.ok(progressBody.data.events.length > 2);
  const tail = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/progress?cursor=${progressBody.data.nextCursor}`);
  assert.deepEqual((await tail.json() as { data: { events: unknown[] } }).data.events, []);
  const metrics = await fetch(`${base}/v1/metrics`);
  assert.equal((await metrics.json() as { data: { queue: { running: number } } }).data.queue.running, 0);
  const exported = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/export`);
  assert.equal((await exported.json() as { data: { report: { sealed: boolean } } }).data.report.sealed, true);
  const deleted = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/asset`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  const asset = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/asset`);
  assert.equal(asset.status, 410);
});

test("isolates tenant analysis routes and preserves sealed reports after byte deletion", async (t) => {
  const config = { ...loadConfig({ AGENT_ALLOW_ASSET_DELETION: "true" }), providerReady: true };
  const store = new SessionStore(async () => engine, 5, 10);
  const analyses = analysisService();
  const server = createAgentServer(config, store, analyses);
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => { store.close(); server.close(); });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const headers = { "content-type": "application/json", "x-agent-scope": "tenant-a" };
  const submitted = await fetch(`${base}/v1/analyses`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG, idempotencyKey: `tenant-${Date.now()}` }),
  });
  const submittedBody = await submitted.json() as { data: { id: string } };
  let state = "queued";
  for (let attempt = 0; attempt < 40 && state !== "completed"; attempt += 1) {
    const response = await fetch(`${base}/v1/analyses/${submittedBody.data.id}`, { headers: { "x-agent-scope": "tenant-a" } });
    state = ((await response.json()) as { data: { state: string } }).data.state;
    if (state !== "completed") await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(state, "completed");

  const otherTenant = { "x-agent-scope": "tenant-b" };
  for (const suffix of ["", "/evidence", "/report", "/asset", "/export"] as const) {
    assert.equal((await fetch(`${base}/v1/analyses/${submittedBody.data.id}${suffix}`, { headers: otherTenant })).status, 404);
  }

  const deleted = await fetch(`${base}/v1/analyses/${submittedBody.data.id}/asset`, {
    method: "DELETE",
    headers: { "x-agent-scope": "tenant-a" },
  });
  assert.equal(deleted.status, 200);
  assert.equal((await fetch(`${base}/v1/analyses/${submittedBody.data.id}/asset`, { headers: { "x-agent-scope": "tenant-a" } })).status, 410);
  assert.equal((await fetch(`${base}/v1/analyses/${submittedBody.data.id}/report`, { headers: { "x-agent-scope": "tenant-a" } })).status, 200);
  const afterDelete = analyses.get(submittedBody.data.id);
  assert.equal(afterDelete.assetDeletedAt !== undefined, true);
  assert.equal(afterDelete.tombstone?.reason, "authorized_deletion");
  assert.equal(afterDelete.report?.sealed, true);
});

test("retention expiry creates an audit tombstone without removing the sealed report", async (t) => {
  const config = { ...loadConfig({ AGENT_ALLOW_ASSET_DELETION: "true" }), providerReady: true };
  const store = new SessionStore(async () => engine, 5, 10);
  const analyses = analysisService();
  const server = createAgentServer(config, store, analyses);
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => { store.close(); server.close(); });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const submitted = await fetch(`${base}/v1/analyses`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-scope": "tenant-retention" },
    body: JSON.stringify({ filename: "pixel.png", mimeType: "image/png", dataBase64: ONE_PIXEL_PNG, idempotencyKey: `retention-${Date.now()}` }),
  });
  const submittedBody = await submitted.json() as { data: { id: string } };
  let state = "queued";
  for (let attempt = 0; attempt < 40 && state !== "completed"; attempt += 1) {
    state = ((await (await fetch(`${base}/v1/analyses/${submittedBody.data.id}`, { headers: { "x-agent-scope": "tenant-retention" } })).json()) as { data: { state: string } }).data.state;
    if (state !== "completed") await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(state, "completed");
  const updatedAt = Date.parse(analyses.get(submittedBody.data.id).updatedAt);
  assert.equal(analyses.pruneExpired(1, updatedAt + 2), 1);
  const retained = analyses.get(submittedBody.data.id);
  assert.equal(retained.tombstone?.reason, "retention_expiry");
  assert.equal(retained.report?.sealed, true);
  assert.equal((await fetch(`${base}/v1/analyses/${submittedBody.data.id}/report`, { headers: { "x-agent-scope": "tenant-retention" } })).status, 200);
  assert.equal((await fetch(`${base}/v1/analyses/${submittedBody.data.id}/asset`, { headers: { "x-agent-scope": "tenant-retention" } })).status, 410);
});

test("requires a bearer token when the service is configured for public access", async (t) => {
  const config = loadConfig({ AGENT_AUTH_TOKEN: "a".repeat(32), AGENT_REQUIRE_AUTH: "true" });
  const store = new SessionStore(async () => engine, 5, 10);
  const server = createAgentServer(config, store, analysisService());
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => { store.close(); server.close(); });
  const { port } = server.address() as AddressInfo;
  const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/capabilities`);
  assert.equal(unauthorized.status, 401);
  const authorized = await fetch(`http://127.0.0.1:${port}/v1/capabilities`, { headers: { authorization: `Bearer ${"a".repeat(32)}` } });
  assert.equal(authorized.status, 200);
});
