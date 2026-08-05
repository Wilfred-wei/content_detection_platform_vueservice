import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ANALYSIS_SCHEMA_VERSION, type EvidenceRecord } from "./analysis-types.js";

export type C2paOutcome =
  | "valid_trusted"
  | "valid_untrusted"
  | "invalid"
  | "absent"
  | "unsupported"
  | "unavailable"
  | "error";

export interface C2paInspection {
  outcome: C2paOutcome;
  validationState?: "Invalid" | "Valid" | "Trusted";
  issuer?: string;
  claimGenerator?: string;
  digitalSourceType?: string;
  aiOrigin?: boolean;
  embedded?: boolean;
  validationStatusCount: number;
  validationCodes?: string[];
  reason?: string;
}

export interface C2paInspector {
  inspect(assetPath: string, mimeType: string): Promise<C2paInspection>;
}

export interface LocalC2paInspectorOptions {
  executablePath?: string;
  settingsPath?: string;
  trustAnchorsPath?: string;
  trustedIssuerPatterns?: string[];
  timeoutMs?: number;
  maxBufferBytes?: number;
}

interface C2paAssertion {
  label: string;
  data?: { actions?: Array<{ digitalSourceType?: unknown; digital_source_type?: unknown }> };
}

interface C2paManifest {
  label?: string;
  claim_generator?: string;
  signature_info?: { issuer?: string; common_name?: string };
  assertions?: C2paAssertion[];
}

export interface C2paManifestStore {
  active_manifest?: string | null;
  manifests?: Record<string, C2paManifest>;
  validation_state?: "Invalid" | "Valid" | "Trusted" | null;
  validation_status?: Array<{ code?: string; explanation?: string; url?: string }>;
}

interface CommandResult {
  error: (Error & { code?: string | number | null; killed?: boolean }) | null;
  stdout: string;
  stderr: string;
}

const DEFAULT_EXECUTABLE_PATH = fileURLToPath(new URL("../.tools/c2patool/bin/c2patool", import.meta.url));
const DEFAULT_SETTINGS_PATH = fileURLToPath(new URL("../resources/c2pa-settings.v1.toml", import.meta.url));

const AI_SOURCE_TYPES = new Set([
  "http://c2pa.org/digitalsourcetype/trainedAlgorithmicData",
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
  "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia",
  "http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic",
]);

const NON_AI_SOURCE_TYPES = new Set([
  "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
  "http://cv.iptc.org/newscodes/digitalsourcetype/computationalCapture",
  "http://cv.iptc.org/newscodes/digitalsourcetype/negativeFilm",
  "http://cv.iptc.org/newscodes/digitalsourcetype/positiveFilm",
]);

function activeManifest(store: C2paManifestStore): C2paManifest | undefined {
  if (!store.active_manifest || !store.manifests) return undefined;
  return store.manifests[store.active_manifest];
}

function sourceType(manifest: C2paManifest | undefined): string | undefined {
  for (const assertion of manifest?.assertions || []) {
    if (!assertion.label.startsWith("c2pa.actions")) continue;
    for (const action of assertion.data?.actions || []) {
      const value = action.digitalSourceType ?? action.digital_source_type;
      if (typeof value === "string" && value) return value;
    }
  }
  return undefined;
}

function issuerAllowed(issuer: string | undefined, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  if (!issuer) return false;
  const normalized = issuer.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

export function normalizeC2paManifest(
  store: C2paManifestStore,
  embedded: boolean,
  trustedIssuerPatterns: string[] = [],
  trustEvaluated = store.validation_state === "Trusted",
): C2paInspection {
  const manifest = activeManifest(store);
  const issuer = manifest?.signature_info?.issuer || manifest?.signature_info?.common_name || undefined;
  const digitalSourceType = sourceType(manifest);
  const validationStatusCount = store.validation_status?.length || 0;
  const validationCodes = (store.validation_status || []).map((status) => status.code || "unknown");
  const nonTrustFailures = validationCodes.filter((code) => code !== "signingCredential.untrusted");
  const inferredState = store.validation_state
    || (nonTrustFailures.length > 0 ? "Invalid" : trustEvaluated ? "Trusted" : "Valid");
  const base = {
    validationState: inferredState,
    issuer,
    claimGenerator: manifest?.claim_generator || undefined,
    digitalSourceType,
    aiOrigin: digitalSourceType
      ? AI_SOURCE_TYPES.has(digitalSourceType) ? true : NON_AI_SOURCE_TYPES.has(digitalSourceType) ? false : undefined
      : undefined,
    embedded,
    validationStatusCount,
    validationCodes,
  };

  if (!manifest) {
    const hasManifestReference = Boolean(store.active_manifest) || Object.keys(store.manifests || {}).length > 0;
    return hasManifestReference
      ? { ...base, outcome: "invalid", reason: "The active C2PA manifest could not be resolved." }
      : { ...base, outcome: "absent" };
  }
  if (inferredState === "Invalid") {
    return { ...base, outcome: "invalid", reason: "C2PA manifest or content binding did not validate." };
  }
  if (inferredState === "Trusted" && issuerAllowed(issuer, trustedIssuerPatterns)) {
    return { ...base, outcome: "valid_trusted" };
  }
  return {
    ...base,
    outcome: "valid_untrusted",
    reason: inferredState === "Trusted"
      ? "The signer is outside the configured product issuer policy."
      : "The manifest is structurally valid but does not chain to the configured trust anchors.",
  };
}

function classifyCommandError(error: unknown, output = ""): C2paInspection {
  const message = [error instanceof Error ? error.message : String(error), output].filter(Boolean).join("\n");
  const normalized = message.toLowerCase();
  if (normalized.includes("no claim found") || normalized.includes("manifest not found") || normalized.includes("no c2pa")) {
    return { outcome: "absent", validationStatusCount: 0 };
  }
  if (normalized.includes("unsupported") || normalized.includes("unknown format")) {
    return { outcome: "unsupported", validationStatusCount: 0, reason: message };
  }
  const commandError = error as { code?: unknown; killed?: boolean } | undefined;
  if (commandError?.code === "ENOENT" || normalized.includes("no such file or directory")) {
    return { outcome: "unavailable", validationStatusCount: 0, reason: "The local C2PA runtime is unavailable." };
  }
  if (commandError?.killed || normalized.includes("timed out")) {
    return { outcome: "error", validationStatusCount: 0, reason: "Local C2PA validation exceeded its time limit." };
  }
  return { outcome: "error", validationStatusCount: 0, reason: message };
}

function runC2paCommand(
  executablePath: string,
  args: string[],
  timeoutMs: number,
  maxBufferBytes: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      executablePath,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: maxBufferBytes,
        windowsHide: true,
        env: { PATH: process.env.PATH || "/usr/bin:/bin", LANG: "C.UTF-8" },
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
  });
}

export class LocalC2paInspector implements C2paInspector {
  private readonly executablePath: string;
  private readonly settingsPath: string;
  private readonly trustAnchorsPath?: string;
  private readonly trustedIssuerPatterns: string[];
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;

  constructor(options: LocalC2paInspectorOptions = {}) {
    this.executablePath = options.executablePath || DEFAULT_EXECUTABLE_PATH;
    this.settingsPath = options.settingsPath || DEFAULT_SETTINGS_PATH;
    this.trustAnchorsPath = options.trustAnchorsPath;
    this.trustedIssuerPatterns = options.trustedIssuerPatterns || [];
    this.timeoutMs = options.timeoutMs || 10_000;
    this.maxBufferBytes = options.maxBufferBytes || 2 * 1024 * 1024;
  }

  async inspect(assetPath: string, _mimeType: string): Promise<C2paInspection> {
    if (!existsSync(this.settingsPath)) {
      return {
        outcome: "error",
        validationStatusCount: 0,
        reason: "The required offline C2PA settings file is missing.",
      };
    }
    if (this.trustAnchorsPath && !existsSync(this.trustAnchorsPath)) {
      return {
        outcome: "error",
        validationStatusCount: 0,
        reason: "The configured C2PA trust-anchor bundle is missing.",
      };
    }
    const args = [assetPath, "--settings", this.settingsPath];
    if (this.trustAnchorsPath) args.push("trust", `--trust_anchors=${this.trustAnchorsPath}`);
    const result = await runC2paCommand(this.executablePath, args, this.timeoutMs, this.maxBufferBytes);
    const output = result.stdout.trim();
    try {
      if (output) {
        const store = JSON.parse(output) as C2paManifestStore;
        return normalizeC2paManifest(
          store,
          true,
          this.trustedIssuerPatterns,
          Boolean(this.trustAnchorsPath),
        );
      }
      if (result.error) return classifyCommandError(result.error, result.stderr);
      return { outcome: "absent", validationStatusCount: 0 };
    } catch (error) {
      return classifyCommandError(error, [result.stderr, result.stdout].filter(Boolean).join("\n"));
    }
  }
}

export function c2paInspectionToEvidence(
  analysisId: string,
  inspection: C2paInspection,
  createdAt = new Date().toISOString(),
): EvidenceRecord {
  const statusByOutcome: Record<C2paOutcome, EvidenceRecord["status"]> = {
    valid_trusted: "verified_present",
    valid_untrusted: "detected",
    invalid: "invalid",
    absent: "not_detected",
    unsupported: "unsupported_format",
    unavailable: "detector_unavailable",
    error: "error",
  };
  const summaryByOutcome: Record<C2paOutcome, string> = {
    valid_trusted: inspection.aiOrigin === true
      ? "C2PA 签名、内容绑定和信任链有效，并明确声明算法生成来源。"
      : "C2PA 签名、内容绑定和信任链有效，但未声明算法生成来源。",
    valid_untrusted: "发现有效 C2PA manifest，但签发者未通过当前信任策略，不能作为强来源证据。",
    invalid: "已发现 C2PA 来源凭证，但凭证校验未通过，不能作为可信来源证据。",
    absent: "未发现 C2PA manifest；该结果不代表图像不是 AI 生成。",
    unsupported: "当前 C2PA 运行时不支持该媒体格式。",
    unavailable: "本地 C2PA 运行时不可用，本次未执行验证。",
    error: "C2PA 验证发生错误，不能将其解释为未发现凭证。",
  };

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: randomUUID(),
    analysisId,
    category: "provenance",
    source: "c2pa",
    status: statusByOutcome[inspection.outcome],
    strength: inspection.outcome === "valid_trusted" ? "strong" : inspection.outcome === "valid_untrusted" ? "supporting" : "none",
    summary: summaryByOutcome[inspection.outcome],
    facts: {
      c2paOutcome: inspection.outcome,
      provenanceVerified: inspection.outcome === "valid_trusted",
      ...(typeof inspection.aiOrigin === "boolean" ? { aiOrigin: inspection.aiOrigin } : {}),
      ...(inspection.validationState ? { validationState: inspection.validationState } : {}),
      ...(inspection.issuer ? { issuer: inspection.issuer } : {}),
      ...(inspection.claimGenerator ? { claimGenerator: inspection.claimGenerator } : {}),
      ...(inspection.digitalSourceType ? { digitalSourceType: inspection.digitalSourceType } : {}),
      ...(typeof inspection.embedded === "boolean" ? { embedded: inspection.embedded } : {}),
      validationStatusCount: inspection.validationStatusCount,
      ...(inspection.validationCodes?.length ? { validationCodes: inspection.validationCodes.join(",") } : {}),
      remoteManifestFetch: false,
    },
    createdAt,
  };
}

export function createConfiguredC2paInspector(env: NodeJS.ProcessEnv = process.env): LocalC2paInspector {
  return new LocalC2paInspector({
    executablePath: env.C2PATOOL_PATH?.trim() || undefined,
    settingsPath: env.C2PA_SETTINGS_PATH?.trim() || undefined,
    trustAnchorsPath: env.C2PA_TRUST_ANCHORS_PATH?.trim() || undefined,
    trustedIssuerPatterns: (env.C2PA_TRUSTED_ISSUERS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  });
}
