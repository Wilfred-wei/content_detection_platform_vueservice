import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import exifr from "exifr";

import { ANALYSIS_SCHEMA_VERSION, type EvidenceRecord } from "./analysis-types.js";

export type MetadataOutcome = "parsed" | "absent" | "unsupported" | "error";
export type AigcMetadataOutcome = "valid_authenticated" | "valid_unsigned" | "absent" | "invalid" | "conflict";
export type AigcLabel = "1" | "2" | "3";

export interface AigcMarker {
  Label: AigcLabel;
  ContentProducer: string;
  ProduceID: string;
  ReservedCode1: string;
  ContentPropagator: string;
  PropagateID: string;
  ReservedCode2: string;
}

export interface MetadataAuthenticationResult {
  signatureValidated: boolean;
  contentBindingValidated: boolean;
  issuerTrusted: boolean;
  issuer?: string;
  reason?: string;
}

export interface AigcMetadataAuthenticator {
  authenticate(marker: AigcMarker, assetPath: string): Promise<MetadataAuthenticationResult>;
}

export interface AigcMetadataInspection {
  outcome: AigcMetadataOutcome;
  markerCount: number;
  label?: AigcLabel;
  labelMeaning?: "confirmed" | "possible" | "suspected";
  contentProducer?: string;
  contentPropagator?: string;
  produceIdHash?: string;
  propagateIdHash?: string;
  reservedSecurityMaterialPresent?: boolean;
  authenticated: boolean;
  issuer?: string;
  violationCount: number;
  reason?: string;
}

export interface MetadataInspection {
  outcome: MetadataOutcome;
  segments: { exif: boolean; xmp: boolean; iptc: boolean };
  fieldCount: number;
  traversalTruncated: boolean;
  gpsExcluded: true;
  aigc: AigcMetadataInspection;
  reason?: string;
}

export interface MetadataInspector {
  inspect(assetPath: string, mimeType: string): Promise<MetadataInspection>;
}

interface CandidateState {
  markers: AigcMarker[];
  violationCount: number;
  nodesVisited: number;
  fieldCount: number;
  truncated: boolean;
}

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/tiff", "image/heic", "image/avif"]);
const MAX_TRAVERSAL_NODES = 2_048;
const MAX_DEPTH = 10;
const MAX_SECURITY_FIELD_LENGTH = 4_096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value) && !(value instanceof Date);
}

function cleanText(value: string, maxCharacters: number): string {
  return Array.from(value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .slice(0, maxCharacters)
    .join("");
}

function opaqueHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function decodeMarkerCandidate(value: unknown): { marker?: AigcMarker; violations: number; markerLike: boolean } {
  let decoded = value;
  let markerLike = isRecord(value) || (typeof value === "string" && value.trimStart().startsWith("{"));
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof decoded === "string") {
      const normalized = decodeXmlEntities(decoded);
      markerLike = markerLike || normalized.trimStart().startsWith("{");
      if (!markerLike || normalized.length > 32_768) return { violations: markerLike ? 1 : 0, markerLike };
      try {
        decoded = JSON.parse(normalized);
      } catch {
        return { violations: 1, markerLike: true };
      }
      continue;
    }
    if (isRecord(decoded) && "AIGC" in decoded) {
      decoded = decoded.AIGC;
      continue;
    }
    break;
  }
  if (!isRecord(decoded)) return { violations: 1, markerLike: true };

  const requiredFields = [
    "Label",
    "ContentProducer",
    "ProduceID",
    "ReservedCode1",
    "ContentPropagator",
    "PropagateID",
    "ReservedCode2",
  ] as const;
  markerLike = requiredFields.some((field) => field in decoded);
  if (!markerLike) return { violations: 0, markerLike: false };

  let violations = 0;
  for (const field of requiredFields) {
    if (typeof decoded[field] !== "string") violations += 1;
  }
  const label = decoded.Label;
  if (label !== "1" && label !== "2" && label !== "3") violations += 1;
  for (const field of ["ContentProducer", "ProduceID", "ContentPropagator", "PropagateID"] as const) {
    const fieldValue = decoded[field];
    if (typeof fieldValue === "string" && (codePointLength(fieldValue) === 0 || codePointLength(fieldValue) > 32)) violations += 1;
  }
  for (const field of ["ReservedCode1", "ReservedCode2"] as const) {
    const fieldValue = decoded[field];
    if (typeof fieldValue === "string" && codePointLength(fieldValue) > MAX_SECURITY_FIELD_LENGTH) violations += 1;
  }
  if (violations > 0) return { violations, markerLike: true };

  return {
    violations: 0,
    markerLike: true,
    marker: {
      Label: label as AigcLabel,
      ContentProducer: decoded.ContentProducer as string,
      ProduceID: decoded.ProduceID as string,
      ReservedCode1: decoded.ReservedCode1 as string,
      ContentPropagator: decoded.ContentPropagator as string,
      PropagateID: decoded.PropagateID as string,
      ReservedCode2: decoded.ReservedCode2 as string,
    },
  };
}

function collectAigcCandidates(value: unknown, state: CandidateState, depth = 0, parentKey = ""): void {
  if (depth > MAX_DEPTH || state.nodesVisited >= MAX_TRAVERSAL_NODES) {
    state.truncated = true;
    return;
  }
  state.nodesVisited += 1;
  if (Array.isArray(value)) {
    for (const item of value) collectAigcCandidates(item, state, depth + 1, parentKey);
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    state.fieldCount += 1;
    if (state.nodesVisited >= MAX_TRAVERSAL_NODES) {
      state.truncated = true;
      return;
    }
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (normalizedKey === "aigc" && parentKey.toLowerCase() !== "xmlns") {
      const candidate = decodeMarkerCandidate(child);
      if (candidate.marker) state.markers.push(candidate.marker);
      if (candidate.markerLike) state.violationCount += candidate.violations;
      continue;
    }
    collectAigcCandidates(child, state, depth + 1, key);
  }
}

function markerInspection(marker: AigcMarker, markerCount: number): AigcMetadataInspection {
  const labelMeanings: Record<AigcLabel, AigcMetadataInspection["labelMeaning"]> = {
    "1": "confirmed",
    "2": "possible",
    "3": "suspected",
  };
  return {
    outcome: "valid_unsigned",
    markerCount,
    label: marker.Label,
    labelMeaning: labelMeanings[marker.Label],
    contentProducer: cleanText(marker.ContentProducer, 32),
    contentPropagator: cleanText(marker.ContentPropagator, 32),
    produceIdHash: opaqueHash(marker.ProduceID),
    propagateIdHash: opaqueHash(marker.PropagateID),
    reservedSecurityMaterialPresent: Boolean(marker.ReservedCode1 || marker.ReservedCode2),
    authenticated: false,
    violationCount: 0,
    reason: "The standard metadata marker is unsigned or has no configured signature and content-binding validator.",
  };
}

export function inspectParsedMetadata(parsed: unknown): Omit<MetadataInspection, "outcome" | "reason"> {
  const state: CandidateState = { markers: [], violationCount: 0, nodesVisited: 0, fieldCount: 0, truncated: false };
  collectAigcCandidates(parsed, state);
  const root = isRecord(parsed) ? parsed : {};
  const nonXmpRoots = new Set(["ifd0", "ifd1", "exif", "gps", "interop", "iptc", "icc", "jfif", "ihdr"]);
  const segments = {
    exif: Boolean(root.ifd0 || root.exif),
    xmp: Boolean(root.xmp) || Object.keys(root).some((key) => !nonXmpRoots.has(key)),
    iptc: Boolean(root.iptc),
  };

  let aigc: AigcMetadataInspection;
  if (state.markers.length > 1) {
    const labels = new Set(state.markers.map((marker) => marker.Label));
    aigc = {
      outcome: "conflict",
      markerCount: state.markers.length,
      authenticated: false,
      violationCount: state.violationCount + 1,
      reason: labels.size > 1
        ? "Multiple AIGC metadata markers contain conflicting labels."
        : "Multiple AIGC metadata markers violate the single-marker requirement.",
    };
  } else if (state.markers.length === 1) {
    aigc = markerInspection(state.markers[0], 1);
  } else if (state.violationCount > 0) {
    aigc = {
      outcome: "invalid",
      markerCount: 0,
      authenticated: false,
      violationCount: state.violationCount,
      reason: "An AIGC metadata field was found but did not satisfy the required structure and field constraints.",
    };
  } else {
    aigc = { outcome: "absent", markerCount: 0, authenticated: false, violationCount: 0 };
  }

  return { segments, fieldCount: state.fieldCount, traversalTruncated: state.truncated, gpsExcluded: true, aigc };
}

export class LocalMetadataInspector implements MetadataInspector {
  constructor(private readonly authenticator?: AigcMetadataAuthenticator) {}

  async inspect(assetPath: string, mimeType: string): Promise<MetadataInspection> {
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      return {
        outcome: "unsupported",
        segments: { exif: false, xmp: false, iptc: false },
        fieldCount: 0,
        traversalTruncated: false,
        gpsExcluded: true,
        aigc: { outcome: "absent", markerCount: 0, authenticated: false, violationCount: 0 },
        reason: `Metadata parsing is not supported for ${mimeType}.`,
      };
    }

    try {
      const bytes = await readFile(assetPath);
      const parseOptions = {
        tiff: true,
        ifd1: false,
        exif: true,
        gps: false,
        interop: false,
        makerNote: false,
        userComment: true,
        xmp: true,
        iptc: true,
        icc: false,
        jfif: false,
        ihdr: false,
        sanitize: true,
        mergeOutput: false,
        multiSegment: false,
        firstChunkSize: Math.min(bytes.length, 64 * 1024),
        chunkSize: 64 * 1024,
        chunkLimit: 8,
        silentErrors: false,
      } as Parameters<typeof exifr.parse>[1];
      const parsed: unknown = await exifr.parse(bytes, parseOptions);
      if (!parsed) {
        const empty = inspectParsedMetadata(undefined);
        return { ...empty, outcome: "absent" };
      }
      const inspected = inspectParsedMetadata(parsed);
      if (inspected.aigc.outcome === "valid_unsigned" && this.authenticator) {
        const state: CandidateState = { markers: [], violationCount: 0, nodesVisited: 0, fieldCount: 0, truncated: false };
        collectAigcCandidates(parsed, state);
        const marker = state.markers[0];
        const authentication = await this.authenticator.authenticate(marker, assetPath);
        const authenticated = authentication.signatureValidated
          && authentication.contentBindingValidated
          && authentication.issuerTrusted;
        inspected.aigc = {
          ...inspected.aigc,
          outcome: authenticated ? "valid_authenticated" : "valid_unsigned",
          authenticated,
          issuer: authentication.issuer ? cleanText(authentication.issuer, 128) : undefined,
          reason: authenticated ? undefined : authentication.reason || inspected.aigc.reason,
        };
      }
      const segmentPresent = Object.values(inspected.segments).some(Boolean);
      return { ...inspected, outcome: segmentPresent || inspected.aigc.outcome !== "absent" ? "parsed" : "absent" };
    } catch (error) {
      return {
        outcome: "error",
        segments: { exif: false, xmp: false, iptc: false },
        fieldCount: 0,
        traversalTruncated: false,
        gpsExcluded: true,
        aigc: { outcome: "absent", markerCount: 0, authenticated: false, violationCount: 0 },
        reason: error instanceof Error ? error.message : "Metadata parsing failed.",
      };
    }
  }
}

export function metadataInspectionToEvidence(
  analysisId: string,
  inspection: MetadataInspection,
  createdAt = new Date().toISOString(),
): EvidenceRecord[] {
  const parserStatus: Record<MetadataOutcome, EvidenceRecord["status"]> = {
    parsed: "detected",
    absent: "not_detected",
    unsupported: "unsupported_format",
    error: "error",
  };
  const parserSummary: Record<MetadataOutcome, string> = {
    parsed: "已离线解析受支持的 EXIF、XMP 和 IPTC 元数据；敏感或高风险字段未输出。",
    absent: "未发现可解析的 EXIF、XMP 或 IPTC 元数据；缺失元数据不代表非 AI 生成。",
    unsupported: "当前安全元数据解析器不支持该图像格式。",
    error: "元数据解析失败，不能将其解释为元数据不存在。",
  };
  const parserEvidence: EvidenceRecord = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: randomUUID(),
    analysisId,
    category: "metadata",
    source: "exifr-safe-parser",
    status: parserStatus[inspection.outcome],
    strength: inspection.outcome === "parsed" ? "informational" : "none",
    summary: parserSummary[inspection.outcome],
    facts: {
      exifPresent: inspection.segments.exif,
      xmpPresent: inspection.segments.xmp,
      iptcPresent: inspection.segments.iptc,
      fieldCount: inspection.fieldCount,
      traversalTruncated: inspection.traversalTruncated,
      gpsExcluded: inspection.gpsExcluded,
    },
    createdAt,
  };

  const aigc = inspection.aigc;
  const aigcStatus: Record<AigcMetadataOutcome, EvidenceRecord["status"]> = {
    valid_authenticated: "verified_present",
    valid_unsigned: "detected",
    absent: inspection.outcome === "unsupported" ? "unsupported_format" : inspection.outcome === "error" ? "error" : "not_detected",
    invalid: "error",
    conflict: "error",
  };
  const aigcSummary: Record<AigcMetadataOutcome, string> = {
    valid_authenticated: "发现符合 GB 45438-2025 字段约束的 AIGC 元数据，且签名、内容绑定和签发者信任均已验证。",
    valid_unsigned: "发现符合 GB 45438-2025 字段约束的 AIGC 元数据，但未通过签名与内容绑定验证，仅作为辅助证据。",
    absent: inspection.outcome === "unsupported"
      ? "该格式未执行 GB 45438-2025 AIGC 元数据解析。"
      : inspection.outcome === "error"
        ? "解析错误导致本次无法核对 GB 45438-2025 AIGC 元数据。"
        : "未发现 GB 45438-2025 AIGC 元数据；该结果不代表图像不是 AI 生成。",
    invalid: "发现 AIGC 元数据字段，但结构或字段约束无效，不能作为来源证明。",
    conflict: "发现重复或冲突的 AIGC 元数据字段，不能作为来源证明。",
  };
  const aigcEvidence: EvidenceRecord = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: randomUUID(),
    analysisId,
    category: "metadata",
    source: "gb-45438-2025",
    status: aigcStatus[aigc.outcome],
    strength: aigc.outcome === "valid_authenticated" ? "strong" : aigc.outcome === "valid_unsigned" ? "supporting" : "none",
    summary: aigcSummary[aigc.outcome],
    facts: {
      standard: "GB 45438-2025",
      markerCount: aigc.markerCount,
      authenticated: aigc.authenticated,
      violationCount: aigc.violationCount,
      conflict: aigc.outcome === "conflict",
      ...(aigc.label ? { label: aigc.label } : {}),
      ...(aigc.labelMeaning ? { labelMeaning: aigc.labelMeaning } : {}),
      ...(aigc.contentProducer ? { contentProducer: aigc.contentProducer } : {}),
      ...(aigc.contentPropagator ? { contentPropagator: aigc.contentPropagator } : {}),
      ...(aigc.produceIdHash ? { produceIdSha256: aigc.produceIdHash } : {}),
      ...(aigc.propagateIdHash ? { propagateIdSha256: aigc.propagateIdHash } : {}),
      ...(typeof aigc.reservedSecurityMaterialPresent === "boolean"
        ? { reservedSecurityMaterialPresent: aigc.reservedSecurityMaterialPresent }
        : {}),
      ...(aigc.issuer ? { issuer: aigc.issuer } : {}),
    },
    createdAt,
  };
  return [parserEvidence, aigcEvidence];
}
