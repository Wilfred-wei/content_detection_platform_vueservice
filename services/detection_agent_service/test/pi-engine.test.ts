import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AnalysisService } from "../src/analysis-service.js";
import { AnalysisStore } from "../src/analysis-store.js";
import { loadConfig } from "../src/config.js";
import { AGENT_SYSTEM_POLICY, createPiEngineFactory } from "../src/pi-engine.js";

test("creates a Pi session with only aggregate analysis tools", async () => {
  const config = loadConfig({ PI_API_KEY: "test-only", PI_PROVIDER: "openai", PI_MODEL: "gpt-5.4" });
  const analyses = new AnalysisService(new AnalysisStore(mkdtempSync(join(tmpdir(), "pi-analysis-"))), config.maxImageBytes);
  const engine = await createPiEngineFactory(config, analyses)();
  assert.deepEqual(engine.toolNames().sort(), ["analyze_image", "get_analysis_status", "get_evidence", "get_report"]);
  engine.dispose();
});

test("system policy forbids invented detection output", () => {
  assert.match(AGENT_SYSTEM_POLICY, /Never invent a detection score/);
  assert.match(AGENT_SYSTEM_POLICY, /not configured yet/);
});
