import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve, sep } from "node:path";

export interface PolicyBundleEntry { path: string; sha256: string }
export interface PolicyBundle {
  schemaVersion: "policy-bundle.v1";
  bundleId: string;
  policyVersion: string;
  createdAt: string;
  productionSwapAuthorized: false;
  automaticPolicyMutation: false;
  entries: PolicyBundleEntry[];
  rollback: { previousBundleId: string | null; procedure: string };
}

const SERVICE_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const BUNDLE_PATH = resolve(SERVICE_ROOT, "resources/policy-bundle.v1.json");

function text(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`INVALID_POLICY_BUNDLE:${field}`);
  return value.trim();
}

function digest(value: unknown, field: string): string {
  const normalized = text(value, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`INVALID_POLICY_BUNDLE:${field}`);
  return normalized;
}

export function parsePolicyBundle(value: unknown): PolicyBundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_POLICY_BUNDLE:root");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== "policy-bundle.v1" || raw.productionSwapAuthorized !== false || raw.automaticPolicyMutation !== false) throw new Error("INVALID_POLICY_BUNDLE:authority");
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) throw new Error("INVALID_POLICY_BUNDLE:entries");
  const paths = new Set<string>();
  const entries = raw.entries.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`INVALID_POLICY_BUNDLE:entry:${index}`);
    const entry = item as Record<string, unknown>;
    const path = text(entry.path, `path:${index}`, 500).replace(/\\/g, "/");
    if (path.startsWith("/") || path.split("/").includes("..") || !path.startsWith("resources/")) throw new Error(`INVALID_POLICY_BUNDLE:path:${index}`);
    if (paths.has(path)) throw new Error(`INVALID_POLICY_BUNDLE:duplicate:${path}`);
    paths.add(path);
    return { path, sha256: digest(entry.sha256, `sha256:${index}`) };
  });
  const rollback = raw.rollback;
  if (!rollback || typeof rollback !== "object" || Array.isArray(rollback)) throw new Error("INVALID_POLICY_BUNDLE:rollback");
  const rollbackRecord = rollback as Record<string, unknown>;
  return {
    schemaVersion: "policy-bundle.v1",
    bundleId: text(raw.bundleId, "bundleId"),
    policyVersion: text(raw.policyVersion, "policyVersion"),
    createdAt: text(raw.createdAt, "createdAt"),
    productionSwapAuthorized: false,
    automaticPolicyMutation: false,
    entries,
    rollback: { previousBundleId: rollbackRecord.previousBundleId === null ? null : text(rollbackRecord.previousBundleId, "previousBundleId"), procedure: text(rollbackRecord.procedure, "rollbackProcedure", 2_000) },
  };
}

export function loadPolicyBundle(): PolicyBundle {
  return parsePolicyBundle(JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as unknown);
}

export function verifyPolicyBundle(bundle: PolicyBundle = loadPolicyBundle()): { valid: true; bundleId: string; verifiedEntries: number } {
  for (const entry of bundle.entries) {
    const path = resolve(SERVICE_ROOT, entry.path);
    if (path !== SERVICE_ROOT && !path.startsWith(`${SERVICE_ROOT}${sep}`)) throw new Error(`INVALID_POLICY_BUNDLE:path_escape:${entry.path}`);
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actual !== entry.sha256) throw new Error(`POLICY_BUNDLE_DIGEST_MISMATCH:${entry.path}`);
  }
  return { valid: true, bundleId: bundle.bundleId, verifiedEntries: bundle.entries.length };
}

export function policyBundlePath(): string { return BUNDLE_PATH; }
