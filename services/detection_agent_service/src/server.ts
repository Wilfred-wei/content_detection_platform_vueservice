import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { AgentConfig } from "./config.js";
import {
  applyRuntimeConfig,
  buildRuntimeConfig,
  publicRuntimeConfig,
  type RuntimeConfigInput,
} from "./config.js";
import { testPiConnection } from "./pi-engine.js";
import { loadProvenanceRegistry } from "./provenance-registry.js";
import { loadModelCandidateRegistry } from "./model-registry.js";
import { loadPolicyBundle, verifyPolicyBundle } from "./policy-bundle.js";
import { ACTIVE_EXPLANATION_PROMPT_BUNDLE } from "./explanation-prompts.js";
import { ACTIVE_FORENSIC_PROMPT_BUNDLE } from "./forensic-inspection-profiles.js";
import { assessReleaseReadiness } from "./release-readiness.js";
import type { AnalysisService } from "./analysis-service.js";
import type { AnalysisRun, AnalysisSubmission } from "./analysis-types.js";
import { NoopObservability, type Observability } from "./observability.js";
import { SessionStore } from "./session-store.js";

const MAX_JSON_BYTES = 64 * 1024;

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage, maximumBytes = MAX_JSON_BYTES): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function sessionRoute(pathname: string): { id: string; action?: "messages" | "cancel" } | undefined {
  const match = pathname.match(/^\/v1\/sessions\/([^/]+)(?:\/(messages|cancel))?$/);
  if (!match) return undefined;
  return { id: decodeURIComponent(match[1]), action: match[2] as "messages" | "cancel" | undefined };
}

function analysisRoute(pathname: string): { id: string; action?: "asset" | "evidence" | "report" | "retry" | "progress" | "cancel" | "export" } | undefined {
  const match = pathname.match(/^\/v1\/analyses\/([^/]+)(?:\/(asset|evidence|report|retry|progress|cancel|export))?$/);
  if (!match) return undefined;
  return { id: decodeURIComponent(match[1]), action: match[2] as "asset" | "evidence" | "report" | "retry" | "progress" | "cancel" | "export" | undefined };
}

function publicAnalysis(analysis: AnalysisRun): Omit<AnalysisRun, "asset" | "scope" | "leaseId" | "cancelRequested" | "idempotencyKey"> & { asset: Omit<AnalysisRun["asset"], "storedPath"> } {
  const { storedPath: _storedPath, ...asset } = analysis.asset;
  const { scope: _scope, leaseId: _leaseId, cancelRequested: _cancelRequested, idempotencyKey: _idempotencyKey, ...publicValue } = analysis;
  return { ...publicValue, asset };
}

function accessAnalysis(analyses: AnalysisService, id: string, scope: string): AnalysisRun {
  const analysis = analyses.get(id);
  if (analysis.scope && analysis.scope !== scope) throw new Error("ANALYSIS_NOT_FOUND");
  return analysis;
}

function errorResponse(error: unknown): { status: number; code: string; message: string } {
  const raw = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (raw === "SESSION_NOT_FOUND") return { status: 404, code: raw, message: "Conversation session not found." };
  if (raw === "SESSION_BUSY") return { status: 409, code: raw, message: "This conversation is already processing a message." };
  if (raw === "ANALYSIS_NOT_FOUND") return { status: 404, code: raw, message: "Analysis not found." };
  if (raw === "ASSET_DELETED") return { status: 410, code: raw, message: "The original asset has been deleted." };
  if (raw === "REPORT_NOT_READY") return { status: 409, code: raw, message: "Analysis report is not ready." };
  if (raw === "ANALYSIS_NOT_RETRYABLE") return { status: 409, code: raw, message: "This analysis cannot be retried." };
  if (raw === "ANALYSIS_NOT_CANCELLABLE") return { status: 409, code: raw, message: "This analysis is already terminal." };
  if (raw === "ANALYSIS_CANCELLED") return { status: 409, code: raw, message: "This analysis was cancelled." };
  if (raw === "ASSET_DELETE_WHILE_RUNNING") return { status: 409, code: raw, message: "Assets cannot be deleted while analysis is running." };
  if (raw === "ANALYSIS_QUEUE_OVERLOADED") return { status: 429, code: raw, message: "Analysis queue is full; retry later." };
  if (["ANALYSIS_QUEUE_CLOSED", "ANALYSIS_QUEUE_UNAVAILABLE"].includes(raw)) return { status: 503, code: raw, message: "Analysis queue is unavailable; retry later." };
  if (raw === "ANALYSIS_QUEUE_EXPIRED") return { status: 503, code: raw, message: "Analysis exceeded the maximum queue age." };
  if (raw === "RATE_LIMITED") return { status: 429, code: raw, message: "Too many requests; retry later." };
  if (raw === "UNAUTHORIZED") return { status: 401, code: raw, message: "Authentication is required." };
  if (raw === "FORBIDDEN") return { status: 403, code: raw, message: "The request is not authorized for this analysis." };
  if (["INVALID_FILENAME", "INVALID_IMAGE_TYPE", "INVALID_IMAGE_DATA", "INVALID_IDEMPOTENCY_KEY", "IMAGE_TYPE_MISMATCH"].includes(raw)) return { status: 400, code: raw, message: "Invalid image submission." };
  if (raw === "UNSUPPORTED_IMAGE") return { status: 415, code: raw, message: "Only PNG, JPEG, GIF, and WebP images are supported." };
  if (raw === "IMAGE_TOO_LARGE") return { status: 413, code: raw, message: "Image exceeds the configured upload limit." };
  if (raw === "PI_PROVIDER_NOT_CONFIGURED") return { status: 503, code: raw, message: "Pi model provider is not configured." };
  if (raw.startsWith("PI_MODEL_NOT_FOUND")) return { status: 503, code: "PI_MODEL_NOT_FOUND", message: raw };
  if (raw === "REQUEST_TOO_LARGE") return { status: 413, code: raw, message: "JSON request exceeds 64 KiB." };
  if (raw === "INVALID_JSON") return { status: 400, code: raw, message: "Request body must be valid JSON." };
  if (raw === "RUNTIME_CONFIG_DISABLED") return { status: 403, code: raw, message: "Runtime model configuration is disabled." };
  if (raw.startsWith("INVALID_CONFIGURATION:")) {
    return { status: 400, code: "INVALID_CONFIGURATION", message: raw.slice("INVALID_CONFIGURATION:".length) };
  }
  return { status: 502, code: "PI_REQUEST_FAILED", message: raw };
}

export interface AgentServerOptions {
  testConnection?: (candidate: AgentConfig) => Promise<void>;
  observability?: Observability;
}

class SlidingWindowLimiter {
  private readonly entries = new Map<string, number[]>();
  constructor(private readonly maximum: number, private readonly windowMs = 60_000) {}

  allow(key: string): boolean {
    const cutoff = Date.now() - this.windowMs;
    const current = (this.entries.get(key) || []).filter((timestamp) => timestamp > cutoff);
    if (current.length >= this.maximum) {
      this.entries.set(key, current);
      return false;
    }
    current.push(Date.now());
    this.entries.set(key, current);
    return true;
  }
}

function bearerToken(request: IncomingMessage): string | undefined {
  const value = request.headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requestScope(request: IncomingMessage, config: AgentConfig): string {
  const token = bearerToken(request);
  if (config.authToken && token && constantTimeEqual(token, config.authToken)) {
    return `token:${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
  }
  const header = request.headers["x-agent-scope"];
  return typeof header === "string" && /^[a-zA-Z0-9._:-]{1,80}$/.test(header) ? header : "anonymous";
}

export function createAgentServer(config: AgentConfig, sessions: SessionStore, analyses: AnalysisService, options: AgentServerOptions = {}): Server {
  const verifyConnection = options.testConnection || ((candidate) => testPiConnection(candidate, analyses));
  const observability = options.observability || new NoopObservability();
  const provenanceRegistry = loadProvenanceRegistry();
  const modelRegistry = loadModelCandidateRegistry();
  const policyBundle = loadPolicyBundle();
  const policyBundleVerification = verifyPolicyBundle(policyBundle);
  const uploadLimiter = new SlidingWindowLimiter(config.uploadRateLimitPerMinute);
  return createServer(async (request, response) => {
    const method = request.method || "GET";
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const requestStartedAt = Date.now();
    let requestOutcome = "ok";

    try {
      if (config.requireAuth && url.pathname !== "/health") {
        const token = bearerToken(request);
        if (!config.authToken || !token || !constantTimeEqual(token, config.authToken)) throw new Error("UNAUTHORIZED");
      }
      const scope = requestScope(request, config);
      if (method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          success: true,
          data: {
            service: "detection-agent-service",
            status: "healthy",
            state: config.providerReady ? "ready" : "not_configured",
            pi: { provider: config.provider, model: config.model, providerReady: config.providerReady },
            configuration: { runtimeEnabled: config.runtimeConfigEnabled },
            analysis: { frameworkReady: true, maxImageBytes: config.maxImageBytes },
            queue: analyses.queueStats(),
          },
        });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/config") {
        sendJson(response, 200, { success: true, data: publicRuntimeConfig(config) });
        return;
      }

      if (method === "POST" && url.pathname === "/v1/config/test") {
        if (!config.runtimeConfigEnabled) throw new Error("RUNTIME_CONFIG_DISABLED");
        const candidate = buildRuntimeConfig(config, await readJson(request) as RuntimeConfigInput);
        const startedAt = Date.now();
        await verifyConnection(candidate);
        sendJson(response, 200, {
          success: true,
          data: { ok: true, latencyMs: Date.now() - startedAt, configuration: publicRuntimeConfig(candidate) },
        });
        return;
      }

      if (method === "PUT" && url.pathname === "/v1/config") {
        if (!config.runtimeConfigEnabled) throw new Error("RUNTIME_CONFIG_DISABLED");
        applyRuntimeConfig(config, await readJson(request) as RuntimeConfigInput);
        sessions.close(true);
        sendJson(response, 200, {
          success: true,
          data: { ...publicRuntimeConfig(config), sessionsReset: true },
        });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/capabilities") {
        const eligibility = provenanceRegistry.schemes.reduce<Record<string, number>>((counts, scheme) => {
          counts[scheme.runtimeEligibility] = (counts[scheme.runtimeEligibility] || 0) + 1;
          return counts;
        }, {});
        const modelEligibility = modelRegistry.candidates.reduce<Record<string, number>>((counts, candidate) => {
          counts[candidate.runtimeEligibility] = (counts[candidate.runtimeEligibility] || 0) + 1;
          return counts;
        }, {});
        sendJson(response, 200, {
          success: true,
          data: {
            conversation: { status: config.providerReady ? "ready" : "not_configured" },
            capabilities: [
              {
                id: "ai_image_detection",
                status: "framework_ready",
                detectorCoverage: config.dda.enabled ? "partial" : "direct_evidence_only",
                modelPolicy: config.dda.enabled ? "enabled" : "disabled",
                modelRegistry: { version: modelRegistry.registryVersion, researchedAt: modelRegistry.researchedAt, eligibility: modelEligibility },
                provenanceRegistry: { version: provenanceRegistry.registryVersion, researchedAt: provenanceRegistry.researchedAt, eligibility },
              },
              { id: "news_verification", status: "not_configured" },
              { id: "video_forensics", status: "not_configured" },
            ],
          },
        });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/provenance/registry") {
        sendJson(response, 200, { success: true, data: provenanceRegistry });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/models/registry") {
        sendJson(response, 200, { success: true, data: modelRegistry });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/models/runtime") {
        sendJson(response, 200, {
          success: true,
          data: {
            generatedAt: new Date().toISOString(),
            models: analyses.modelRuntime(),
            devices: analyses.modelResourceDeviceStats(),
            resources: analyses.modelResourceStats(),
            note: "当前实现已按模型执行有界槽位和声明显存准入；未配置显存容量时不会假定可用显存，实际微批仍由 worker 能力决定。",
          },
        });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/release/readiness") {
        const deviceStats = analyses.modelResourceDeviceStats();
        sendJson(response, 200, {
          success: true,
          data: assessReleaseReadiness({
            policyBundle,
            policyBundleVerified: policyBundleVerification.valid,
            requireAuth: config.requireAuth,
            storageEncryptionConfigured: Boolean(config.storageEncryptionKey),
            productionLabelingAuthorized: config.productionLabelingAuthorized,
            modelRegistry,
            provenanceRegistry,
            modelRuntime: analyses.modelRuntime(),
            modelDeviceCapacityCount: deviceStats.filter((device) => device.memoryMb !== null || device.slots !== null).length,
            explanationEvaluationStatus: ACTIVE_EXPLANATION_PROMPT_BUNDLE.evaluationStatus,
            forensicEvaluationStatus: ACTIVE_FORENSIC_PROMPT_BUNDLE.evaluationStatus,
          }),
        });
        return;
      }

      if (method === "POST" && url.pathname === "/v1/analyses") {
        if (!uploadLimiter.allow(scope)) throw new Error("RATE_LIMITED");
        const body = await readJson(request, Math.ceil(config.maxImageBytes * 1.5) + 64 * 1024);
        const result = analyses.submit({ ...(body as unknown as AnalysisSubmission), scope });
        sendJson(response, result.reused ? 200 : 202, { success: true, data: { ...publicAnalysis(result.analysis), reused: result.reused } });
        return;
      }

      const analysis = analysisRoute(url.pathname);
      if (analysis && method === "GET" && !analysis.action) {
        sendJson(response, 200, { success: true, data: publicAnalysis(accessAnalysis(analyses, analysis.id, scope)) });
        return;
      }
      if (analysis && method === "GET" && analysis.action === "evidence") {
        accessAnalysis(analyses, analysis.id, scope);
        sendJson(response, 200, { success: true, data: { analysisId: analysis.id, evidence: analyses.evidence(analysis.id) } });
        return;
      }
      if (analysis && method === "GET" && analysis.action === "report") {
        accessAnalysis(analyses, analysis.id, scope);
        sendJson(response, 200, { success: true, data: analyses.report(analysis.id) });
        return;
      }
      if (analysis && method === "GET" && analysis.action === "progress") {
        accessAnalysis(analyses, analysis.id, scope);
        const cursor = Number.parseInt(url.searchParams.get("cursor") || "0", 10);
        sendJson(response, 200, { success: true, data: analyses.getProgress(analysis.id, Number.isFinite(cursor) ? cursor : 0) });
        return;
      }
      if (analysis && method === "GET" && analysis.action === "export") {
        const current = accessAnalysis(analyses, analysis.id, scope);
        sendJson(response, 200, {
          success: true,
          data: { analysisId: current.id, state: current.state, report: current.report || null, evidence: current.evidence, progress: current.progressEvents },
        });
        return;
      }
      if (analysis && method === "GET" && analysis.action === "asset") {
        accessAnalysis(analyses, analysis.id, scope);
        const asset = analyses.asset(analysis.id);
        response.writeHead(200, {
          "content-type": asset.mimeType,
          "content-length": asset.sizeBytes,
          "cache-control": "private, max-age=3600",
          "content-disposition": "inline",
          "x-content-type-options": "nosniff",
        });
        response.end(analyses.assetBytes(analysis.id));
        return;
      }
      if (analysis && method === "POST" && analysis.action === "retry") {
        accessAnalysis(analyses, analysis.id, scope);
        sendJson(response, 202, { success: true, data: publicAnalysis(analyses.retry(analysis.id)) });
        return;
      }
      if (analysis && method === "POST" && analysis.action === "cancel") {
        accessAnalysis(analyses, analysis.id, scope);
        sendJson(response, 200, { success: true, data: publicAnalysis(analyses.cancel(analysis.id)) });
        return;
      }
      if (analysis && method === "DELETE" && analysis.action === "asset") {
        if (!config.allowAssetDeletion) throw new Error("FORBIDDEN");
        accessAnalysis(analyses, analysis.id, scope);
        sendJson(response, 200, { success: true, data: publicAnalysis(analyses.deleteAsset(analysis.id)) });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/queue") {
        sendJson(response, 200, { success: true, data: analyses.queueStats() });
        return;
      }
      if (method === "GET" && url.pathname === "/v1/metrics") {
        sendJson(response, 200, {
          success: true,
          data: { service: "detection-agent-service", generatedAt: new Date().toISOString(), ...analyses.metrics() },
        });
        return;
      }

      if (method === "POST" && url.pathname === "/v1/sessions") {
        sendJson(response, 201, { success: true, data: sessions.create() });
        return;
      }

      const route = sessionRoute(url.pathname);
      if (route && method === "GET" && !route.action) {
        const session = sessions.get(route.id);
        if (!session) throw new Error("SESSION_NOT_FOUND");
        sendJson(response, 200, { success: true, data: session });
        return;
      }

      if (route && method === "GET" && route.action === "messages") {
        const session = sessions.get(route.id);
        if (!session) throw new Error("SESSION_NOT_FOUND");
        sendJson(response, 200, { success: true, data: { sessionId: session.id, messages: session.messages } });
        return;
      }

      if (route && method === "POST" && route.action === "messages") {
        const body = await readJson(request);
        const content = typeof body.content === "string" ? body.content.trim() : "";
        if (!content || content.length > 8_000) {
          sendJson(response, 400, { error: { code: "INVALID_MESSAGE", message: "Message must contain 1 to 8000 characters." } });
          return;
        }
        sendJson(response, 200, { success: true, data: await sessions.send(route.id, content) });
        return;
      }

      if (route && method === "POST" && route.action === "cancel") {
        sendJson(response, 200, { success: true, data: await sessions.cancel(route.id) });
        return;
      }

      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
    } catch (error) {
      const failure = errorResponse(error);
      requestOutcome = failure.code;
      sendJson(response, failure.status, { error: { code: failure.code, message: failure.message } });
    } finally {
      observability.record({
        timestamp: new Date().toISOString(),
        type: "route.request",
        durationMs: Date.now() - requestStartedAt,
        code: requestOutcome,
        details: { method, path: url.pathname },
      });
    }
  });
}
