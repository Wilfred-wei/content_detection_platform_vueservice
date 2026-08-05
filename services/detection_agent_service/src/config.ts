import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { validateStorageEncryptionKey } from "./storage-crypto.js";
import type { DeviceResourceCapacity } from "./model-resource-scheduler.js";

const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  google: "GEMINI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  zai: "ZAI_API_KEY",
};

function apiKeyFromFile(path: string | undefined, field: string | undefined): string | undefined {
  if (!path?.trim()) return undefined;
  const normalizedPath = path.trim();
  let raw: string;
  try {
    const stat = statSync(normalizedPath);
    if (!stat.isFile() || stat.size > 64 * 1024) throw new Error("invalid secret file");
    raw = readFileSync(normalizedPath, "utf8").trim();
  } catch {
    throw new Error("INVALID_CONFIGURATION:PI_API_KEY_FILE is not a readable bounded file.");
  }
  if (!raw) throw new Error("INVALID_CONFIGURATION:PI_API_KEY_FILE is empty.");

  let value = raw;
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidate = parsed[field || "OPENAI_API_KEY"];
      if (typeof candidate !== "string") throw new Error("missing field");
      value = candidate.trim();
    } catch {
      throw new Error("INVALID_CONFIGURATION:PI_API_KEY_FILE does not contain the configured JSON field.");
    }
  }
  if (!value || value.length > 8_192) {
    throw new Error("INVALID_CONFIGURATION:PI_API_KEY_FILE contains an invalid key.");
  }
  return value;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalResourceInteger(value: string | undefined, field: string, maximum = 1_000_000): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error(`INVALID_CONFIGURATION:${field} must be a positive bounded integer.`);
  return parsed;
}

function scopeWeights(value: string | undefined): Readonly<Record<string, number>> {
  if (!value?.trim()) return Object.freeze({ anonymous: 1 });
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    const result: Record<string, number> = {};
    for (const [scope, weight] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(scope) || typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error("invalid");
      result[scope] = weight;
    }
    return Object.freeze(result);
  } catch {
    throw new Error("INVALID_CONFIGURATION:AGENT_ANALYSIS_SCOPE_WEIGHTS must be a JSON object of positive weights.");
  }
}

function modelDeviceCapacities(value: string | undefined): readonly DeviceResourceCapacity[] {
  if (!value?.trim()) return Object.freeze([]);
  if (value.length > 16_384) throw new Error("INVALID_CONFIGURATION:AGENT_MODEL_DEVICE_CAPACITIES is too long.");
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length > 32) throw new Error("invalid");
    const devices = new Set<string>();
    const result = parsed.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid");
      const raw = item as Record<string, unknown>;
      if (Object.keys(raw).some((key) => !["device", "memoryMb", "slots"].includes(key))) throw new Error("invalid");
      if (typeof raw.device !== "string" || !/^[a-zA-Z0-9._:/-]{1,80}$/.test(raw.device) || devices.has(raw.device)) throw new Error("invalid");
      if (raw.memoryMb !== null && (!Number.isInteger(raw.memoryMb) || (raw.memoryMb as number) < 1)) throw new Error("invalid");
      if (!Number.isInteger(raw.slots) || (raw.slots as number) < 1 || (raw.slots as number) > 128) throw new Error("invalid");
      devices.add(raw.device);
      return { device: raw.device, memoryMb: raw.memoryMb as number | null, slots: raw.slots as number };
    });
    return Object.freeze(result);
  } catch {
    throw new Error("INVALID_CONFIGURATION:AGENT_MODEL_DEVICE_CAPACITIES must be a JSON array of unique device capacities.");
  }
}

function booleanValue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export interface AgentConfig {
  host: string;
  port: number;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  allowAnonymous: boolean;
  authToken?: string;
  requireAuth: boolean;
  maxSessions: number;
  maxMessagesPerSession: number;
  providerReady: boolean;
  /** Production probabilistic labels require explicit operator promotion. */
  productionLabelingAuthorized: boolean;
  runtimeConfigEnabled: boolean;
  analysisDataDir: string;
  maxImageBytes: number;
  maxAnalysisConcurrency: number;
  maxAnalysisQueue: number;
  analysisLeaseMs: number;
  maxAnalysisAgeMs: number;
  analysisScopeWeights: Readonly<Record<string, number>>;
  modelDeviceCapacities: readonly DeviceResourceCapacity[];
  uploadRateLimitPerMinute: number;
  retentionMs: number;
  allowAssetDeletion: boolean;
  storageEncryptionKey?: string;
  dda: DdaConfig;
  ddaShadow: DdaShadowConfig;
  mirror: MirrorConfig;
  safe: SafeConfig;
  legacyAiDetection: LegacyAiDetectionConfig;
}

export interface LegacyAiDetectionConfig {
  enabled: boolean;
  url?: string;
  token?: string;
  timeoutMs: number;
  threshold: number;
  modelVersion: string;
}

export interface DdaConfig {
  enabled: boolean;
  uvCommand: string;
  workerProjectDir: string;
  sourceDir: string;
  checkpointPath: string;
  checkpointSha256: string;
  dinov2HubDir: string;
  device: string;
  timeoutMs: number;
  startupTimeoutMs: number;
  maxQueue: number;
  detectorVersion: string;
  memoryReservationMb?: number;
  slotCount?: number;
  microbatchSize?: number;
  maxBatchDelayMs?: number;
}

export interface DdaShadowConfig {
  enabled: boolean;
  candidate: DdaConfig;
  candidateId: string;
  candidateStatus: string;
  candidateManifestPath: string;
  candidateManifestSha256: string;
  auditLogPath: string;
}

export interface MirrorConfig {
  enabled: boolean;
  uvCommand: string;
  workerProjectDir: string;
  sourceDir: string;
  sourceRevision: string;
  checkpointPath: string;
  checkpointSha256: string;
  memoryBankPath: string;
  memoryBankSha256: string;
  backboneDir: string;
  backboneSha256: string;
  device: string;
  useAmp: boolean;
  timeoutMs: number;
  startupTimeoutMs: number;
  maxQueue: number;
  memoryReservationMb?: number;
  slotCount?: number;
  microbatchSize?: number;
  maxBatchDelayMs?: number;
}

export interface SafeConfig {
  enabled: boolean;
  uvCommand: string;
  workerProjectDir: string;
  sourceDir: string;
  sourceRevision: string;
  sourceSha256: string;
  checkpointPath: string;
  checkpointSha256: string;
  device: string;
  timeoutMs: number;
  startupTimeoutMs: number;
  maxQueue: number;
  memoryReservationMb?: number;
  slotCount?: number;
  microbatchSize?: number;
  maxBatchDelayMs?: number;
}

export interface RuntimeConfigInput {
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
  baseUrl?: unknown;
  allowAnonymous?: unknown;
  clearApiKey?: unknown;
}

export interface PublicRuntimeConfig {
  provider: string;
  model: string;
  baseUrl?: string;
  allowAnonymous: boolean;
  providerReady: boolean;
  productionLabelingAuthorized: boolean;
  apiKeyConfigured: boolean;
  runtimeConfigEnabled: boolean;
  authRequired: boolean;
  queue: {
    maxConcurrency: number;
    maxQueue: number;
    leaseMs: number;
    maxAgeMs: number;
  };
  persistence: "filesystem";
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`INVALID_CONFIGURATION:${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new Error(`INVALID_CONFIGURATION:${field} is too long.`);
  }
  return normalized;
}

function optionalBaseUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = requiredText(value, "baseUrl", 2_048).replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("INVALID_CONFIGURATION:baseUrl must be a valid URL.");
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("INVALID_CONFIGURATION:baseUrl must use http or https.");
  }
  return normalized;
}

function optionalServiceUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().replace(/\/$/, "");
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new Error("INVALID_CONFIGURATION:AI_DETECTION_SERVICE_URL must be a valid URL."); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("INVALID_CONFIGURATION:AI_DETECTION_SERVICE_URL must use http or https.");
  return normalized;
}

function readDdaShadowManifest(
  path: string,
  expectedManifestSha256: string,
  expectedCheckpointSha256: string,
): { candidateId: string; status: string } {
  let raw: Buffer;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("invalid manifest file");
    raw = readFileSync(path);
  } catch {
    throw new Error("INVALID_CONFIGURATION:DDA shadow selection manifest is not a readable bounded file.");
  }
  const actualSha256 = createHash("sha256").update(raw).digest("hex");
  if (actualSha256 !== expectedManifestSha256) {
    throw new Error("INVALID_CONFIGURATION:DDA shadow selection manifest digest mismatch.");
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("INVALID_CONFIGURATION:DDA shadow selection manifest is not valid JSON.");
  }
  const checkpoint = manifest.checkpoint as Record<string, unknown> | undefined;
  const selection = manifest.selection as Record<string, unknown> | undefined;
  const candidateId = manifest.candidate_id;
  const status = manifest.status;
  if (typeof candidateId !== "string" || !/^[a-zA-Z0-9._-]{1,200}$/.test(candidateId)
    || typeof status !== "string" || !status.trim()
    || checkpoint?.sha256 !== expectedCheckpointSha256
    || selection?.production_swap_authorized !== false) {
    throw new Error("INVALID_CONFIGURATION:DDA shadow selection manifest does not identify the configured non-promoted candidate.");
  }
  return { candidateId, status: status.trim() };
}

export function buildRuntimeConfig(current: AgentConfig, input: RuntimeConfigInput): AgentConfig {
  const provider = requiredText(input.provider, "provider", 100);
  const model = requiredText(input.model, "model", 200);
  const baseUrl = optionalBaseUrl(input.baseUrl);
  const allowAnonymous = input.allowAnonymous === true;
  const clearApiKey = input.clearApiKey === true;

  let apiKey = clearApiKey ? undefined : current.apiKey;
  if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey !== "") {
    apiKey = requiredText(input.apiKey, "apiKey", 8_192);
  }
  if (allowAnonymous && !baseUrl) {
    throw new Error("INVALID_CONFIGURATION:anonymous access requires a custom baseUrl.");
  }

  return {
    ...current,
    provider,
    model,
    apiKey,
    baseUrl,
    allowAnonymous,
    providerReady: Boolean(apiKey || (baseUrl && allowAnonymous)),
  };
}

export function applyRuntimeConfig(target: AgentConfig, input: RuntimeConfigInput): AgentConfig {
  const next = buildRuntimeConfig(target, input);
  Object.assign(target, next);
  return target;
}

export function publicRuntimeConfig(config: AgentConfig): PublicRuntimeConfig {
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    allowAnonymous: config.allowAnonymous,
    providerReady: config.providerReady,
    productionLabelingAuthorized: config.productionLabelingAuthorized,
    apiKeyConfigured: Boolean(config.apiKey),
    runtimeConfigEnabled: config.runtimeConfigEnabled,
    authRequired: config.requireAuth,
    queue: {
      maxConcurrency: config.maxAnalysisConcurrency,
      maxQueue: config.maxAnalysisQueue,
      leaseMs: config.analysisLeaseMs,
      maxAgeMs: config.maxAnalysisAgeMs,
    },
    persistence: "filesystem",
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const provider = env.PI_PROVIDER?.trim() || "openai";
  const providerEnvName = PROVIDER_KEY_ENV[provider];
  const apiKey = env.PI_API_KEY?.trim()
    || (providerEnvName ? env[providerEnvName]?.trim() : undefined)
    || apiKeyFromFile(env.PI_API_KEY_FILE, env.PI_API_KEY_FILE_FIELD?.trim() || providerEnvName);
  const baseUrl = env.PI_BASE_URL?.trim() || undefined;
  const allowAnonymous = booleanValue(env.PI_ALLOW_ANONYMOUS);
  const analysisDataDir = env.AGENT_ANALYSIS_DATA_DIR?.trim() || ".data/analyses";
  const storageEncryptionKey = validateStorageEncryptionKey(env.AGENT_STORAGE_ENCRYPTION_KEY);
  const productionEnvironment = env.NODE_ENV?.trim().toLowerCase() === "production";
  if (productionEnvironment && !storageEncryptionKey) {
    throw new Error("INVALID_CONFIGURATION:AGENT_STORAGE_ENCRYPTION_KEY is required in production.");
  }
  const authToken = env.AGENT_AUTH_TOKEN?.trim() || undefined;
  const requireAuth = env.AGENT_REQUIRE_AUTH === undefined ? Boolean(authToken) : booleanValue(env.AGENT_REQUIRE_AUTH);
  if (authToken && (authToken.length < 16 || authToken.length > 8_192)) {
    throw new Error("INVALID_CONFIGURATION:AGENT_AUTH_TOKEN must be 16 to 8192 characters.");
  }
  if (requireAuth && !authToken) throw new Error("INVALID_CONFIGURATION:AGENT_REQUIRE_AUTH requires AGENT_AUTH_TOKEN.");
  const legacyAiDetectionUrl = optionalServiceUrl(env.AI_DETECTION_SERVICE_URL);
  const legacyAiDetectionEnabled = booleanValue(env.AI_DETECTION_SERVICE_ENABLED);
  if (legacyAiDetectionEnabled && !legacyAiDetectionUrl) {
    throw new Error("INVALID_CONFIGURATION:AI_DETECTION_SERVICE_ENABLED requires AI_DETECTION_SERVICE_URL.");
  }
  const legacyAiDetection: LegacyAiDetectionConfig = {
    enabled: legacyAiDetectionEnabled,
    url: legacyAiDetectionUrl,
    token: env.AI_DETECTION_SERVICE_TOKEN?.trim() || undefined,
    timeoutMs: positiveInteger(env.AI_DETECTION_SERVICE_TIMEOUT_MS, 30_000),
    threshold: Number.isFinite(Number(env.AI_DETECTION_SERVICE_THRESHOLD)) && Number(env.AI_DETECTION_SERVICE_THRESHOLD) >= 0 && Number(env.AI_DETECTION_SERVICE_THRESHOLD) <= 1
      ? Number(env.AI_DETECTION_SERVICE_THRESHOLD) : 0.5,
    modelVersion: env.AI_DETECTION_SERVICE_MODEL_VERSION?.trim() || "legacy-service-unknown",
  };

  const ddaEnabled = booleanValue(env.DDA_ENABLED);
  const ddaDetectorVersion = env.DDA_DETECTOR_VERSION?.trim() || "DDA-official-neurips2025";
  if (ddaDetectorVersion.length > 240) {
    throw new Error("INVALID_CONFIGURATION:DDA_DETECTOR_VERSION is too long.");
  }
  const dda: DdaConfig = {
    enabled: ddaEnabled,
    uvCommand: env.DDA_UV_COMMAND?.trim() || "uv",
    workerProjectDir: resolve(env.DDA_WORKER_PROJECT_DIR?.trim() || "workers/dda"),
    sourceDir: resolve(env.DDA_SOURCE_DIR?.trim() || "."),
    checkpointPath: resolve(env.DDA_CHECKPOINT_PATH?.trim() || "."),
    checkpointSha256: env.DDA_CHECKPOINT_SHA256?.trim().toLowerCase() || "",
    dinov2HubDir: resolve(env.DDA_DINOV2_HUB_DIR?.trim() || "."),
    device: env.DDA_DEVICE?.trim() || "cuda:0",
    timeoutMs: positiveInteger(env.DDA_TIMEOUT_MS, 30_000),
    startupTimeoutMs: positiveInteger(env.DDA_STARTUP_TIMEOUT_MS, 180_000),
    maxQueue: positiveInteger(env.DDA_MAX_QUEUE, 8),
    detectorVersion: ddaDetectorVersion,
    memoryReservationMb: optionalResourceInteger(env.DDA_MEMORY_RESERVATION_MB, "DDA_MEMORY_RESERVATION_MB"),
    slotCount: optionalResourceInteger(env.DDA_SLOT_COUNT, "DDA_SLOT_COUNT", 128),
    microbatchSize: optionalResourceInteger(env.DDA_MICROBATCH_SIZE, "DDA_MICROBATCH_SIZE", 32),
    maxBatchDelayMs: optionalResourceInteger(env.DDA_MAX_BATCH_DELAY_MS, "DDA_MAX_BATCH_DELAY_MS", 60_000),
  };
  if (dda.enabled && (!env.DDA_SOURCE_DIR?.trim() || !env.DDA_CHECKPOINT_PATH?.trim()
    || !/^[a-f0-9]{64}$/.test(dda.checkpointSha256) || !env.DDA_DINOV2_HUB_DIR?.trim())) {
    throw new Error("INVALID_CONFIGURATION:DDA requires source, checkpoint, checkpoint SHA-256, and DINOv2 hub paths.");
  }

  const ddaShadowEnabled = booleanValue(env.DDA_SHADOW_ENABLED);
  const ddaShadowCheckpointSha256 = env.DDA_SHADOW_CHECKPOINT_SHA256?.trim().toLowerCase() || "";
  const ddaShadowManifestSha256 = env.DDA_SHADOW_MANIFEST_SHA256?.trim().toLowerCase() || "";
  if (ddaShadowEnabled && (!dda.enabled
    || !env.DDA_SHADOW_CHECKPOINT_PATH?.trim() || !/^[a-f0-9]{64}$/.test(ddaShadowCheckpointSha256)
    || !env.DDA_SHADOW_MANIFEST_PATH?.trim() || !/^[a-f0-9]{64}$/.test(ddaShadowManifestSha256))) {
    throw new Error("INVALID_CONFIGURATION:DDA shadow requires the enabled baseline plus pinned candidate checkpoint and selection manifest artifacts.");
  }
  const ddaShadowManifestPath = resolve(env.DDA_SHADOW_MANIFEST_PATH?.trim() || ".");
  const ddaShadowIdentity = ddaShadowEnabled
    ? readDdaShadowManifest(ddaShadowManifestPath, ddaShadowManifestSha256, ddaShadowCheckpointSha256)
    : { candidateId: "disabled", status: "disabled" };
  const ddaShadow: DdaShadowConfig = {
    enabled: ddaShadowEnabled,
    candidate: {
      enabled: ddaShadowEnabled,
      uvCommand: env.DDA_SHADOW_UV_COMMAND?.trim() || dda.uvCommand,
      workerProjectDir: resolve(env.DDA_SHADOW_WORKER_PROJECT_DIR?.trim() || dda.workerProjectDir),
      sourceDir: resolve(env.DDA_SHADOW_SOURCE_DIR?.trim() || dda.sourceDir),
      checkpointPath: resolve(env.DDA_SHADOW_CHECKPOINT_PATH?.trim() || "."),
      checkpointSha256: ddaShadowCheckpointSha256,
      dinov2HubDir: resolve(env.DDA_SHADOW_DINOV2_HUB_DIR?.trim() || dda.dinov2HubDir),
      device: env.DDA_SHADOW_DEVICE?.trim() || "cuda:0",
      timeoutMs: positiveInteger(env.DDA_SHADOW_TIMEOUT_MS, dda.timeoutMs),
      startupTimeoutMs: positiveInteger(env.DDA_SHADOW_STARTUP_TIMEOUT_MS, dda.startupTimeoutMs),
      maxQueue: positiveInteger(env.DDA_SHADOW_MAX_QUEUE, dda.maxQueue),
      detectorVersion: `DDA-universal-${ddaShadowIdentity.candidateId}`,
      memoryReservationMb: optionalResourceInteger(env.DDA_SHADOW_MEMORY_RESERVATION_MB, "DDA_SHADOW_MEMORY_RESERVATION_MB") ?? dda.memoryReservationMb,
      slotCount: optionalResourceInteger(env.DDA_SHADOW_SLOT_COUNT, "DDA_SHADOW_SLOT_COUNT", 128) ?? dda.slotCount,
      microbatchSize: optionalResourceInteger(env.DDA_SHADOW_MICROBATCH_SIZE, "DDA_SHADOW_MICROBATCH_SIZE", 32) ?? dda.microbatchSize,
      maxBatchDelayMs: optionalResourceInteger(env.DDA_SHADOW_MAX_BATCH_DELAY_MS, "DDA_SHADOW_MAX_BATCH_DELAY_MS", 60_000) ?? dda.maxBatchDelayMs,
    },
    candidateId: ddaShadowIdentity.candidateId,
    candidateStatus: ddaShadowIdentity.status,
    candidateManifestPath: ddaShadowManifestPath,
    candidateManifestSha256: ddaShadowManifestSha256,
    auditLogPath: resolve(env.DDA_SHADOW_AUDIT_LOG_PATH?.trim()
      || resolve(analysisDataDir, "shadow", "dda-universal-v1.jsonl")),
  };

  const mirrorEnabled = booleanValue(env.MIRROR_ENABLED);
  const mirror: MirrorConfig = {
    enabled: mirrorEnabled,
    uvCommand: env.MIRROR_UV_COMMAND?.trim() || "uv",
    workerProjectDir: resolve(env.MIRROR_WORKER_PROJECT_DIR?.trim() || "workers/mirror"),
    sourceDir: resolve(env.MIRROR_SOURCE_DIR?.trim() || "."),
    sourceRevision: env.MIRROR_SOURCE_REVISION?.trim().toLowerCase() || "",
    checkpointPath: resolve(env.MIRROR_CHECKPOINT_PATH?.trim() || "."),
    checkpointSha256: env.MIRROR_CHECKPOINT_SHA256?.trim().toLowerCase() || "",
    memoryBankPath: resolve(env.MIRROR_MEMORY_BANK_PATH?.trim() || "."),
    memoryBankSha256: env.MIRROR_MEMORY_BANK_SHA256?.trim().toLowerCase() || "",
    backboneDir: resolve(env.MIRROR_BACKBONE_DIR?.trim() || "."),
    backboneSha256: env.MIRROR_BACKBONE_SHA256?.trim().toLowerCase() || "",
    device: env.MIRROR_DEVICE?.trim() || "cuda:0",
    useAmp: env.MIRROR_USE_AMP === undefined ? false : booleanValue(env.MIRROR_USE_AMP),
    timeoutMs: positiveInteger(env.MIRROR_TIMEOUT_MS, 60_000),
    startupTimeoutMs: positiveInteger(env.MIRROR_STARTUP_TIMEOUT_MS, 300_000),
    maxQueue: positiveInteger(env.MIRROR_MAX_QUEUE, 4),
    memoryReservationMb: optionalResourceInteger(env.MIRROR_MEMORY_RESERVATION_MB, "MIRROR_MEMORY_RESERVATION_MB"),
    slotCount: optionalResourceInteger(env.MIRROR_SLOT_COUNT, "MIRROR_SLOT_COUNT", 128),
    microbatchSize: optionalResourceInteger(env.MIRROR_MICROBATCH_SIZE, "MIRROR_MICROBATCH_SIZE", 32),
    maxBatchDelayMs: optionalResourceInteger(env.MIRROR_MAX_BATCH_DELAY_MS, "MIRROR_MAX_BATCH_DELAY_MS", 60_000),
  };
  if (mirror.enabled && env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error("INVALID_CONFIGURATION:MIRROR is experimental and cannot run in production mode.");
  }
  if (mirror.enabled && (!env.MIRROR_SOURCE_DIR?.trim()
    || !/^[a-f0-9]{40}$/.test(mirror.sourceRevision)
    || !env.MIRROR_CHECKPOINT_PATH?.trim() || !/^[a-f0-9]{64}$/.test(mirror.checkpointSha256)
    || !env.MIRROR_MEMORY_BANK_PATH?.trim() || !/^[a-f0-9]{64}$/.test(mirror.memoryBankSha256)
    || !env.MIRROR_BACKBONE_DIR?.trim() || !/^[a-f0-9]{64}$/.test(mirror.backboneSha256))) {
    throw new Error("INVALID_CONFIGURATION:MIRROR requires pinned source revision, checkpoint, memory bank, backbone, and SHA-256 digests.");
  }
  if (mirror.enabled && mirror.useAmp) {
    throw new Error("INVALID_CONFIGURATION:MIRROR AMP is unsupported by the pinned upstream attention mask implementation.");
  }

  const safeEnabled = booleanValue(env.SAFE_ENABLED);
  const safe: SafeConfig = {
    enabled: safeEnabled,
    uvCommand: env.SAFE_UV_COMMAND?.trim() || "uv",
    workerProjectDir: resolve(env.SAFE_WORKER_PROJECT_DIR?.trim() || "workers/safe"),
    sourceDir: resolve(env.SAFE_SOURCE_DIR?.trim() || "."),
    sourceRevision: env.SAFE_SOURCE_REVISION?.trim().toLowerCase() || "",
    sourceSha256: env.SAFE_SOURCE_SHA256?.trim().toLowerCase() || "",
    checkpointPath: resolve(env.SAFE_CHECKPOINT_PATH?.trim() || "."),
    checkpointSha256: env.SAFE_CHECKPOINT_SHA256?.trim().toLowerCase() || "",
    device: env.SAFE_DEVICE?.trim() || "cuda:0",
    timeoutMs: positiveInteger(env.SAFE_TIMEOUT_MS, 30_000),
    startupTimeoutMs: positiveInteger(env.SAFE_STARTUP_TIMEOUT_MS, 180_000),
    maxQueue: positiveInteger(env.SAFE_MAX_QUEUE, 8),
    memoryReservationMb: optionalResourceInteger(env.SAFE_MEMORY_RESERVATION_MB, "SAFE_MEMORY_RESERVATION_MB"),
    slotCount: optionalResourceInteger(env.SAFE_SLOT_COUNT, "SAFE_SLOT_COUNT", 128),
    microbatchSize: optionalResourceInteger(env.SAFE_MICROBATCH_SIZE, "SAFE_MICROBATCH_SIZE", 32),
    maxBatchDelayMs: optionalResourceInteger(env.SAFE_MAX_BATCH_DELAY_MS, "SAFE_MAX_BATCH_DELAY_MS", 60_000),
  };
  if (safe.enabled && (!env.SAFE_SOURCE_DIR?.trim()
    || !/^[a-f0-9]{40}$/.test(safe.sourceRevision)
    || !/^[a-f0-9]{64}$/.test(safe.sourceSha256)
    || !env.SAFE_CHECKPOINT_PATH?.trim()
    || !/^[a-f0-9]{64}$/.test(safe.checkpointSha256))) {
    throw new Error("INVALID_CONFIGURATION:SAFE requires pinned source revision, executed source digest, checkpoint, and checkpoint digest.");
  }

  return {
    host: env.AGENT_HOST?.trim() || "127.0.0.1",
    port: positiveInteger(env.AGENT_PORT, 8020),
    provider,
    model: env.PI_MODEL?.trim() || "gpt-5.4",
    apiKey: apiKey || undefined,
    baseUrl,
    allowAnonymous,
    authToken,
    requireAuth,
    maxSessions: positiveInteger(env.AGENT_MAX_SESSIONS, 50),
    maxMessagesPerSession: positiveInteger(env.AGENT_MAX_MESSAGES_PER_SESSION, 40),
    providerReady: Boolean(apiKey || (baseUrl && allowAnonymous)),
    productionLabelingAuthorized: !productionEnvironment || booleanValue(env.AGENT_PRODUCTION_LABELING_AUTHORIZED),
    runtimeConfigEnabled: env.AGENT_ALLOW_RUNTIME_CONFIG === undefined
      ? env.NODE_ENV !== "production"
      : booleanValue(env.AGENT_ALLOW_RUNTIME_CONFIG),
    analysisDataDir,
    maxImageBytes: positiveInteger(env.AGENT_MAX_IMAGE_BYTES, 10 * 1024 * 1024),
    maxAnalysisConcurrency: positiveInteger(env.AGENT_ANALYSIS_CONCURRENCY, 2),
    maxAnalysisQueue: positiveInteger(env.AGENT_ANALYSIS_QUEUE_MAX, 32),
    analysisLeaseMs: positiveInteger(env.AGENT_ANALYSIS_LEASE_MS, 5 * 60 * 1000),
    maxAnalysisAgeMs: positiveInteger(env.AGENT_ANALYSIS_MAX_AGE_MS, 30 * 60 * 1000),
    analysisScopeWeights: scopeWeights(env.AGENT_ANALYSIS_SCOPE_WEIGHTS),
    modelDeviceCapacities: modelDeviceCapacities(env.AGENT_MODEL_DEVICE_CAPACITIES),
    uploadRateLimitPerMinute: positiveInteger(env.AGENT_UPLOAD_RATE_LIMIT_PER_MINUTE, 30),
    retentionMs: positiveInteger(env.AGENT_ANALYSIS_RETENTION_MS, 7 * 24 * 60 * 60 * 1000),
    allowAssetDeletion: env.AGENT_ALLOW_ASSET_DELETION === undefined
      ? env.NODE_ENV !== "production"
      : booleanValue(env.AGENT_ALLOW_ASSET_DELETION),
    storageEncryptionKey,
    dda,
    ddaShadow,
    mirror,
    safe,
    legacyAiDetection,
  };
}
