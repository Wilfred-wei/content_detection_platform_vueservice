import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildRuntimeConfig, loadConfig, publicRuntimeConfig } from "../src/config.js";

test("reports provider as not configured without credentials", () => {
  const config = loadConfig({});
  assert.equal(config.providerReady, false);
  assert.equal(config.provider, "openai");
  assert.equal(config.port, 8020);
});

test("allows an explicitly anonymous local endpoint", () => {
  const config = loadConfig({ PI_BASE_URL: "http://127.0.0.1:9000/v1", PI_ALLOW_ANONYMOUS: "true" });
  assert.equal(config.providerReady, true);
  assert.equal(config.baseUrl, "http://127.0.0.1:9000/v1");
});

test("parses bounded weighted analysis scopes", () => {
  const config = loadConfig({ AGENT_ANALYSIS_SCOPE_WEIGHTS: JSON.stringify({ anonymous: 1, premium: 3 }) });
  assert.deepEqual(config.analysisScopeWeights, { anonymous: 1, premium: 3 });
  assert.throws(() => loadConfig({ AGENT_ANALYSIS_SCOPE_WEIGHTS: JSON.stringify({ premium: 0 }) }), /AGENT_ANALYSIS_SCOPE_WEIGHTS/);
});

test("parses bounded shared model-device capacities", () => {
  const config = loadConfig({
    AGENT_MODEL_DEVICE_CAPACITIES: JSON.stringify([
      { device: "cuda:0", memoryMb: 16_384, slots: 1 },
      { device: "cuda:1", memoryMb: null, slots: 2 },
    ]),
  });
  assert.deepEqual(config.modelDeviceCapacities, [
    { device: "cuda:0", memoryMb: 16_384, slots: 1 },
    { device: "cuda:1", memoryMb: null, slots: 2 },
  ]);
  assert.throws(() => loadConfig({ AGENT_MODEL_DEVICE_CAPACITIES: JSON.stringify([{ device: "cuda:0", memoryMb: 1, slots: 1 }, { device: "cuda:0", memoryMb: 2, slots: 1 }]) }), /AGENT_MODEL_DEVICE_CAPACITIES/);
  assert.throws(() => loadConfig({ AGENT_MODEL_DEVICE_CAPACITIES: JSON.stringify([{ device: "cuda:0", memoryMb: null, slots: 0 }]) }), /AGENT_MODEL_DEVICE_CAPACITIES/);
});

test("loads a startup key from a bounded JSON secret file", () => {
  const directory = mkdtempSync(join(tmpdir(), "agent-key-file-"));
  const path = join(directory, "auth.json");
  writeFileSync(path, JSON.stringify({ OPENAI_API_KEY: "file-secret" }), { mode: 0o600 });

  const config = loadConfig({ PI_API_KEY_FILE: path });

  assert.equal(config.providerReady, true);
  assert.equal(config.apiKey, "file-secret");
  assert.equal(publicRuntimeConfig(config).apiKeyConfigured, true);
});

test("builds a runtime configuration without exposing its secret", () => {
  const initial = loadConfig({ PI_API_KEY: "existing-secret" });
  const candidate = buildRuntimeConfig(initial, {
    provider: "custom-openai",
    model: "local-model",
    baseUrl: "http://127.0.0.1:9000/v1/",
    allowAnonymous: false,
  });

  assert.equal(candidate.apiKey, "existing-secret");
  assert.equal(candidate.baseUrl, "http://127.0.0.1:9000/v1");
  assert.equal(publicRuntimeConfig(candidate).apiKeyConfigured, true);
  assert.equal("apiKey" in publicRuntimeConfig(candidate), false);
});

test("disables browser configuration by default in production", () => {
  const storageKey = "a".repeat(64);
  assert.equal(loadConfig({ NODE_ENV: "production", AGENT_STORAGE_ENCRYPTION_KEY: storageKey }).runtimeConfigEnabled, false);
  assert.equal(loadConfig({ NODE_ENV: "production", AGENT_STORAGE_ENCRYPTION_KEY: storageKey }).productionLabelingAuthorized, false);
  assert.equal(loadConfig({ NODE_ENV: "production", AGENT_STORAGE_ENCRYPTION_KEY: storageKey, AGENT_PRODUCTION_LABELING_AUTHORIZED: "true" }).productionLabelingAuthorized, true);
  assert.equal(loadConfig({ NODE_ENV: "production", AGENT_STORAGE_ENCRYPTION_KEY: storageKey, AGENT_ALLOW_RUNTIME_CONFIG: "true" }).runtimeConfigEnabled, true);
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /AGENT_STORAGE_ENCRYPTION_KEY/);
  assert.throws(() => loadConfig({ AGENT_STORAGE_ENCRYPTION_KEY: "not-a-key" }), /AGENT_STORAGE_ENCRYPTION_KEY/);
});

test("requires complete immutable DDA artifact configuration when enabled", () => {
  assert.throws(() => loadConfig({ DDA_ENABLED: "true" }), /INVALID_CONFIGURATION:DDA/);
  const config = loadConfig({
    DDA_ENABLED: "true",
    DDA_SOURCE_DIR: "/opt/dda",
    DDA_CHECKPOINT_PATH: "/models/dda.pth",
    DDA_CHECKPOINT_SHA256: "a".repeat(64),
    DDA_DINOV2_HUB_DIR: "/models/dinov2",
    DDA_DEVICE: "cuda:1",
    DDA_MEMORY_RESERVATION_MB: "4096",
    DDA_SLOT_COUNT: "2",
    DDA_MICROBATCH_SIZE: "4",
    DDA_MAX_BATCH_DELAY_MS: "25",
  });
  assert.equal(config.dda.enabled, true);
  assert.equal(config.dda.device, "cuda:1");
  assert.equal(config.dda.checkpointSha256, "a".repeat(64));
  assert.equal(config.dda.detectorVersion, "DDA-official-neurips2025");
  assert.deepEqual({ memoryReservationMb: config.dda.memoryReservationMb, slotCount: config.dda.slotCount, microbatchSize: config.dda.microbatchSize, maxBatchDelayMs: config.dda.maxBatchDelayMs }, { memoryReservationMb: 4096, slotCount: 2, microbatchSize: 4, maxBatchDelayMs: 25 });
  assert.equal(config.ddaShadow.enabled, false);
});

test("allows the active DDA checkpoint to declare its immutable runtime version", () => {
  const config = loadConfig({
    DDA_ENABLED: "true",
    DDA_SOURCE_DIR: "/opt/dda",
    DDA_DETECTOR_VERSION: "DDA-universal-v2-step7200",
    DDA_CHECKPOINT_PATH: "/models/dda-universal-v2.pth",
    DDA_CHECKPOINT_SHA256: "a".repeat(64),
    DDA_DINOV2_HUB_DIR: "/models/dinov2",
  });
  assert.equal(config.dda.detectorVersion, "DDA-universal-v2-step7200");
  assert.throws(() => loadConfig({
    DDA_ENABLED: "true",
    DDA_SOURCE_DIR: "/opt/dda",
    DDA_DETECTOR_VERSION: "x".repeat(241),
    DDA_CHECKPOINT_PATH: "/models/dda.pth",
    DDA_CHECKPOINT_SHA256: "a".repeat(64),
    DDA_DINOV2_HUB_DIR: "/models/dinov2",
  }), /DDA_DETECTOR_VERSION/);
});

test("requires an enabled baseline and an immutable non-promoted DDA shadow manifest", () => {
  assert.throws(() => loadConfig({ DDA_SHADOW_ENABLED: "true" }), /INVALID_CONFIGURATION:DDA shadow/);
  const directory = mkdtempSync(join(tmpdir(), "dda-shadow-config-"));
  const checkpointSha256 = "c".repeat(64);
  const manifest = JSON.stringify({
    candidate_id: "universal-test-step128",
    status: "two_seed_offline_gates_passed_not_production_deployed",
    checkpoint: { sha256: checkpointSha256 },
    selection: { production_swap_authorized: false },
  });
  const manifestPath = join(directory, "selected_candidate.json");
  writeFileSync(manifestPath, manifest);
  const manifestSha256 = createHash("sha256").update(manifest).digest("hex");
  const config = loadConfig({
    DDA_ENABLED: "true",
    DDA_SOURCE_DIR: "/opt/dda",
    DDA_CHECKPOINT_PATH: "/models/dda.pth",
    DDA_CHECKPOINT_SHA256: "a".repeat(64),
    DDA_DINOV2_HUB_DIR: "/models/dinov2",
    DDA_SHADOW_ENABLED: "true",
    DDA_SHADOW_CHECKPOINT_PATH: "/models/dda-universal.pth",
    DDA_SHADOW_CHECKPOINT_SHA256: checkpointSha256,
    DDA_SHADOW_MANIFEST_PATH: manifestPath,
    DDA_SHADOW_MANIFEST_SHA256: manifestSha256,
    DDA_SHADOW_DEVICE: "cuda:2",
  });

  assert.equal(config.ddaShadow.enabled, true);
  assert.equal(config.ddaShadow.candidateId, "universal-test-step128");
  assert.equal(config.ddaShadow.candidate.detectorVersion, "DDA-universal-universal-test-step128");
  assert.equal(config.ddaShadow.candidate.device, "cuda:2");
  assert.equal(config.ddaShadow.candidate.checkpointSha256, checkpointSha256);

  assert.throws(() => loadConfig({
    DDA_ENABLED: "true",
    DDA_SOURCE_DIR: "/opt/dda",
    DDA_CHECKPOINT_PATH: "/models/dda.pth",
    DDA_CHECKPOINT_SHA256: "a".repeat(64),
    DDA_DINOV2_HUB_DIR: "/models/dinov2",
    DDA_SHADOW_ENABLED: "true",
    DDA_SHADOW_CHECKPOINT_PATH: "/models/dda-universal.pth",
    DDA_SHADOW_CHECKPOINT_SHA256: checkpointSha256,
    DDA_SHADOW_MANIFEST_PATH: manifestPath,
    DDA_SHADOW_MANIFEST_SHA256: "d".repeat(64),
  }), /manifest digest mismatch/);
});

test("gates MIRROR behind complete artifacts and non-production mode", () => {
  assert.throws(() => loadConfig({ MIRROR_ENABLED: "true" }), /INVALID_CONFIGURATION:MIRROR/);
  const configured = {
    MIRROR_ENABLED: "true",
    MIRROR_SOURCE_DIR: "/opt/mirror",
    MIRROR_SOURCE_REVISION: "a".repeat(40),
    MIRROR_CHECKPOINT_PATH: "/models/mirror.pth",
    MIRROR_CHECKPOINT_SHA256: "b".repeat(64),
    MIRROR_MEMORY_BANK_PATH: "/models/memory.pth",
    MIRROR_MEMORY_BANK_SHA256: "c".repeat(64),
    MIRROR_BACKBONE_DIR: "/models/dinov3-hplus",
    MIRROR_BACKBONE_SHA256: "d".repeat(64),
    MIRROR_DEVICE: "cuda:1",
  };
  const config = loadConfig(configured);
  assert.equal(config.mirror.enabled, true);
  assert.equal(config.mirror.device, "cuda:1");
  assert.equal(config.mirror.useAmp, false);
  assert.throws(() => loadConfig({ ...configured, NODE_ENV: "production", AGENT_STORAGE_ENCRYPTION_KEY: "a".repeat(64) }), /cannot run in production/);
  assert.throws(() => loadConfig({ ...configured, MIRROR_USE_AMP: "true" }), /AMP is unsupported/);
});

test("requires complete immutable SAFE source and checkpoint configuration", () => {
  assert.throws(() => loadConfig({ SAFE_ENABLED: "true" }), /INVALID_CONFIGURATION:SAFE/);
  const config = loadConfig({
    SAFE_ENABLED: "true",
    SAFE_SOURCE_DIR: "/opt/safe",
    SAFE_SOURCE_REVISION: "a".repeat(40),
    SAFE_SOURCE_SHA256: "b".repeat(64),
    SAFE_CHECKPOINT_PATH: "/models/safe.pth",
    SAFE_CHECKPOINT_SHA256: "c".repeat(64),
    SAFE_DEVICE: "cuda:3",
  });
  assert.equal(config.safe.enabled, true);
  assert.equal(config.safe.device, "cuda:3");
  assert.equal(config.safe.sourceRevision, "a".repeat(40));
  assert.equal(config.safe.sourceSha256, "b".repeat(64));
  assert.equal(config.safe.checkpointSha256, "c".repeat(64));
});
