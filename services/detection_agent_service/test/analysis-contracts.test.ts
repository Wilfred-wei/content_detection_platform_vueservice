import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AnalysisService } from "../src/analysis-service.js";
import { AnalysisStore } from "../src/analysis-store.js";
import { ANALYSIS_SCHEMA_VERSION, type AnalysisRun } from "../src/analysis-types.js";
import type { ExplanationVerifier } from "../src/explanation-verifier.js";
import type { ReportSynthesizer } from "../src/report-synthesizer.js";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TERMINAL_STAGE_STATES = new Set(["completed", "skipped", "policy_disabled", "unavailable", "failed"]);

const synthesizer: ReportSynthesizer = {
  async synthesize() {
    return {
      text: "当前证据不足，无法确定图像是否由 AI 生成。模型检测由当前策略禁用，本次未调用模型服务。",
      provider: "schema-test-provider",
      model: "schema-test-model",
      generatedAt: "2026-08-02T00:00:00.000Z",
    };
  },
};

const verifier: ExplanationVerifier = {
  async verify() {
    return {
      provider: "schema-test-verifier",
      model: "schema-test-verifier-model",
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

function createService(): AnalysisService {
  return new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "analysis-contracts-"))),
    1024 * 1024,
    synthesizer,
    verifier,
  );
}

async function waitForTerminal(service: AnalysisService, id: string): Promise<AnalysisRun> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const analysis = service.get(id);
    if (analysis.state === "completed" || analysis.state === "failed") return analysis;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("analysis did not reach a terminal state");
}

async function completedAnalysis(): Promise<AnalysisRun> {
  const service = createService();
  const submitted = service.submit({
    filename: "pixel.png",
    mimeType: "image/png",
    dataBase64: ONE_PIXEL_PNG,
  });
  const analysis = await waitForTerminal(service, submitted.analysis.id);
  assert.equal(analysis.state, "completed");
  return analysis;
}

function assertIsoTimestamp(value: string | undefined, field: string): void {
  assert.ok(value, `${field} is required`);
  assert.equal(new Date(value).toISOString(), value, `${field} must be an ISO timestamp`);
}

test("emits one versioned core schema graph with closed authoritative references", async () => {
  const analysis = await completedAnalysis();
  const report = analysis.report;
  assert.ok(report);
  assert.ok(analysis.decision);
  assert.ok(analysis.productDecision);
  assert.ok(analysis.claims);
  assert.ok(analysis.validation);

  const versionedRecords = [
    analysis,
    analysis.asset,
    ...analysis.progressEvents,
    ...analysis.evidence,
    analysis.decision,
    analysis.productDecision,
    ...analysis.claims,
    analysis.validation,
    report,
    report.asset,
    report.productDecision,
    report.provenanceConclusion,
    report.decision,
    ...report.claims,
    ...report.evidence,
    report.validation,
  ];
  for (const record of versionedRecords) {
    assert.equal(record.schemaVersion, ANALYSIS_SCHEMA_VERSION);
  }

  assert.match(analysis.id, /^[0-9a-f-]{36}$/i);
  assert.match(analysis.asset.id, /^[0-9a-f-]{36}$/i);
  assert.match(analysis.asset.sha256, /^[0-9a-f]{64}$/);
  assert.equal(analysis.asset.sizeBytes, Buffer.from(ONE_PIXEL_PNG, "base64").length);
  assert.equal(report.analysisId, analysis.id);
  assert.equal(report.asset.storedPath, undefined);
  assert.equal(report.sealed, true);
  assert.deepEqual(report.decision, report.provenanceConclusion);
  assert.deepEqual(report.productDecision, analysis.productDecision);

  const evidenceIds = new Set(analysis.evidence.map((record) => record.id));
  assert.equal(evidenceIds.size, analysis.evidence.length);
  for (const record of analysis.evidence) {
    assert.equal(record.analysisId, analysis.id);
    assertIsoTimestamp(record.createdAt, `evidence:${record.id}:createdAt`);
  }
  for (const reference of analysis.decision.evidenceRefs) assert.ok(evidenceIds.has(reference));
  for (const reference of analysis.productDecision.evidenceRefs) assert.ok(evidenceIds.has(reference));
  for (const claim of analysis.claims) {
    for (const reference of claim.evidenceRefs) assert.ok(evidenceIds.has(reference));
  }

  assertIsoTimestamp(analysis.createdAt, "analysis.createdAt");
  assertIsoTimestamp(analysis.updatedAt, "analysis.updatedAt");
  assertIsoTimestamp(analysis.decision.decidedAt, "decision.decidedAt");
  assertIsoTimestamp(analysis.validation.validatedAt, "validation.validatedAt");
  assertIsoTimestamp(report.createdAt, "report.createdAt");
});

test("records legal monotonic lifecycle transitions and satisfies terminal invariants", async () => {
  const analysis = await completedAnalysis();
  const events = analysis.progressEvents;
  assert.ok(analysis.report?.sealed);
  assert.equal(analysis.stateVersion, events.length);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_event, index) => index + 1));
  assert.deepEqual(
    events.filter((event) => event.scope === "analysis").map((event) => event.state),
    ["queued", "running", "completed"],
  );

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    assert.equal(event.schemaVersion, ANALYSIS_SCHEMA_VERSION);
    assert.equal(event.analysisId, analysis.id);
    assertIsoTimestamp(event.createdAt, `progress:${event.sequence}:createdAt`);
    if (index > 0) {
      assert.ok(Date.parse(event.createdAt) >= Date.parse(events[index - 1].createdAt));
    }
  }

  const stageIds = new Set(analysis.stages.map((stage) => stage.id));
  assert.equal(stageIds.size, analysis.stages.length);
  assert.deepEqual(new Set(analysis.executionPlan.map((node) => node.stageId)), stageIds);

  const firstEventSequence = new Map<string, number>();
  const terminalEventSequence = new Map<string, number>();
  for (const stage of analysis.stages) {
    const stageEvents = events.filter((event) => event.scope === "stage" && event.stageId === stage.id);
    assert.ok(stageEvents.length > 0, `${stage.id} must emit progress`);
    assert.equal(stageEvents.at(-1)?.state, stage.state);
    assert.ok(TERMINAL_STAGE_STATES.has(stage.state), `${stage.id} must be terminal`);
    assertIsoTimestamp(stage.completedAt, `${stage.id}.completedAt`);

    let terminalSeen = false;
    for (const event of stageEvents) {
      assert.equal(terminalSeen, false, `${stage.id} emitted progress after a terminal state`);
      if (event.state === "running") assertIsoTimestamp(stage.startedAt, `${stage.id}.startedAt`);
      if (TERMINAL_STAGE_STATES.has(event.state)) terminalSeen = true;
    }
    assert.equal(terminalSeen, true, `${stage.id} did not emit a terminal transition`);
    firstEventSequence.set(stage.id, stageEvents[0].sequence);
    terminalEventSequence.set(stage.id, stageEvents.at(-1)?.sequence || 0);
  }

  for (const node of analysis.executionPlan) {
    const first = firstEventSequence.get(node.stageId);
    assert.ok(first);
    for (const dependency of node.dependsOn) {
      const dependencyTerminal = terminalEventSequence.get(dependency);
      assert.ok(dependencyTerminal);
      assert.ok(dependencyTerminal < first, `${node.stageId} started before ${dependency} was terminal`);
    }
  }

  assert.equal(events.at(-1)?.scope, "analysis");
  assert.equal(events.at(-1)?.state, "completed");
  assert.ok(analysis.stages.every((stage) => stage.state !== "pending" && stage.state !== "running"));
});
