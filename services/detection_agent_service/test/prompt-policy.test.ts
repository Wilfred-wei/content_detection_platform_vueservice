import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVE_FORENSIC_PROMPT_BUNDLE,
  ForensicInspectionProfileCatalog,
} from "../src/forensic-inspection-profiles.js";
import { ACTIVE_EXPLANATION_PROMPT_BUNDLE } from "../src/explanation-prompts.js";
import {
  AGENT_SYSTEM_POLICY,
  FORENSIC_OBSERVATION_SYSTEM_POLICY,
  FORENSIC_PLANNER_SYSTEM_POLICY,
  REPORT_SYNTHESIS_SYSTEM_POLICY,
} from "../src/pi-engine.js";

test("forensic prompt bundle v2 is immutable, bounded, and supporting-only", () => {
  const catalog = new ForensicInspectionProfileCatalog();
  assert.equal(Object.isFrozen(ACTIVE_FORENSIC_PROMPT_BUNDLE), true);
  assert.equal(catalog.activeBundle().id, "forensic-visual-evidence-v2");
  assert.equal(catalog.activeBundle().version, "2.0.0");
  assert.equal(catalog.list().every((profile) =>
    profile.promptBundleId === ACTIVE_FORENSIC_PROMPT_BUNDLE.id
    && profile.promptBundleVersion === ACTIVE_FORENSIC_PROMPT_BUNDLE.version
    && profile.authority === "supporting_only"
    && profile.evaluationStatus === "prototype_not_calibrated"
    && profile.limits.maxOutputTokens === 1_000), true);
  assert.equal(new Set(catalog.list().map((profile) => profile.promptHash)).size, catalog.list().length);
});

test("system roles separate conversation, observation, planning, and synthesis authority", () => {
  assert.match(AGENT_SYSTEM_POLICY, /require an analysis ID/i);
  assert.match(AGENT_SYSTEM_POLICY, /web API, not chat or filesystem access/i);
  assert.match(AGENT_SYSTEM_POLICY, /News verification and video forensics are not configured/i);
  assert.match(FORENSIC_OBSERVATION_SYSTEM_POLICY, /not an authenticity classifier/i);
  assert.match(FORENSIC_OBSERVATION_SYSTEM_POLICY, /visual normality are neutral/i);
  assert.match(FORENSIC_PLANNER_SYSTEM_POLICY, /falsify or materially clarify/i);
  assert.match(FORENSIC_PLANNER_SYSTEM_POLICY, /visible AI labels/i);
  assert.match(REPORT_SYNTHESIS_SYSTEM_POLICY, /supporting-only/i);
  assert.match(REPORT_SYNTHESIS_SYSTEM_POLICY, /copied, removed, or forged/i);
});

test("explanation synthesis and verifier prompts share one immutable bundle", () => {
  assert.equal(ACTIVE_EXPLANATION_PROMPT_BUNDLE.id, "evidence-grounded-explanation-v1");
  assert.equal(ACTIVE_EXPLANATION_PROMPT_BUNDLE.evaluationStatus, "prototype_not_calibrated");
  assert.equal(Object.isFrozen(ACTIVE_EXPLANATION_PROMPT_BUNDLE), true);
  assert.equal(Object.isFrozen(ACTIVE_EXPLANATION_PROMPT_BUNDLE.promptHashes), true);
  assert.equal(Object.keys(ACTIVE_EXPLANATION_PROMPT_BUNDLE.promptHashes).length, 8);
  assert.equal(Object.values(ACTIVE_EXPLANATION_PROMPT_BUNDLE.promptHashes).every((hash) => /^[a-f0-9]{64}$/.test(hash)), true);
});

test("AI image Skill routes existing analyses without turning chat into a detector", () => {
  const skill = readFileSync(new URL("../skills/ai-image-detection/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /version: 1\.2\.0/);
  assert.match(skill, /immutable analysis ID/);
  assert.match(skill, /never claim to inspect an image from chat/);
  assert.match(skill, /Do not use the conversational model's own visual impression as detection evidence/);
  assert.match(skill, /can be copied, removed, or forged/);
  assert.match(skill, /Do not select, skip, repeat, or reorder individual detectors/);
});
