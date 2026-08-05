import assert from "node:assert/strict";
import test from "node:test";

import { createAnalysisTools } from "../src/analysis-tools.js";
import type { AnalysisService } from "../src/analysis-service.js";

const ANALYSIS_ID = "analysis-contract-001";

function toolCall(tool: ReturnType<typeof createAnalysisTools>[number], analysisId: string) {
  return tool.execute("contract-call", { analysisId }, undefined, undefined, undefined as never);
}

test("Pi Skill tools are bound aggregate reads and cannot create or mutate an analysis", async () => {
  const calls: string[] = [];
  const snapshot = {
    id: ANALYSIS_ID,
    state: "completed",
    stateVersion: 4,
    stages: [{ id: "report", state: "completed" }],
    decision: { verdict: "INCONCLUSIVE", basis: ["test"], confidenceBand: "unavailable", conflicts: [], evidenceRefs: [] },
  };
  const service = {
    get(id: string) {
      calls.push(`get:${id}`);
      if (id !== ANALYSIS_ID) throw new Error("ANALYSIS_NOT_FOUND");
      return snapshot;
    },
    evidence(id: string) {
      calls.push(`evidence:${id}`);
      if (id !== ANALYSIS_ID) throw new Error("ANALYSIS_NOT_FOUND");
      return [];
    },
    report(id: string) {
      calls.push(`report:${id}`);
      if (id !== ANALYSIS_ID) throw new Error("ANALYSIS_NOT_FOUND");
      return { analysisId: id, sealed: true };
    },
  } as unknown as AnalysisService;

  const tools = createAnalysisTools(service);
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["analyze_image", "get_analysis_status", "get_evidence", "get_report"]);
  for (const tool of tools) {
    const schema = tool.parameters as unknown as { properties?: Record<string, unknown>; required?: string[] };
    assert.deepEqual(Object.keys(schema.properties || {}), ["analysisId"], `${tool.name} must accept only analysisId`);
    assert.deepEqual(schema.required, ["analysisId"], `${tool.name} must require analysisId`);
    await toolCall(tool, ANALYSIS_ID);
  }

  assert.deepEqual(calls, [
    `get:${ANALYSIS_ID}`,
    `get:${ANALYSIS_ID}`,
    `evidence:${ANALYSIS_ID}`,
    `report:${ANALYSIS_ID}`,
  ]);
  assert.deepEqual(snapshot, {
    id: ANALYSIS_ID,
    state: "completed",
    stateVersion: 4,
    stages: [{ id: "report", state: "completed" }],
    decision: { verdict: "INCONCLUSIVE", basis: ["test"], confidenceBand: "unavailable", conflicts: [], evidenceRefs: [] },
  });
});

test("Skill access cannot precede a web-created analysis record", async () => {
  const service = {
    get() { throw new Error("ANALYSIS_NOT_FOUND"); },
    evidence() { throw new Error("ANALYSIS_NOT_FOUND"); },
    report() { throw new Error("ANALYSIS_NOT_FOUND"); },
  } as unknown as AnalysisService;
  const tools = createAnalysisTools(service);
  await assert.rejects(() => toolCall(tools[0]!, "not-created-by-web"), /ANALYSIS_NOT_FOUND/);
});
