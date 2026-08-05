import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";

import type { AnalysisRun } from "./analysis-types.js";
import { decodeStoragePayload, encodeStoragePayload, type StorageProtector } from "./storage-crypto.js";

interface PersistedState {
  analyses: AnalysisRun[];
  idempotency: Record<string, string>;
}

export class AnalysisStore {
  private readonly filePath: string;
  private readonly assetDir: string;
  private readonly analyses = new Map<string, AnalysisRun>();
  private readonly idempotency = new Map<string, string>();

  constructor(dataDir: string, private readonly protector?: StorageProtector) {
    const root = resolve(dataDir);
    this.dataDir = root;
    this.filePath = join(root, "analyses.json");
    this.assetDir = join(root, "assets");
    mkdirSync(this.assetDir, { recursive: true });
    this.load();
  }

  private readonly dataDir: string;

  get rootDir(): string { return this.dataDir; }

  assetPath(assetId: string): string {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(assetId)) throw new Error("INVALID_ASSET_ID");
    return join(this.assetDir, `${assetId}.bin`);
  }

  writeAsset(assetId: string, bytes: Buffer): string {
    const path = this.assetPath(assetId);
    const encoded = encodeStoragePayload(bytes, this.protector, `asset:${assetId}`);
    writeFileSync(path, encoded, { flag: "wx", mode: 0o600 });
    return path;
  }

  readAsset(assetId: string): Buffer {
    const path = this.assetPath(assetId);
    return decodeStoragePayload(readFileSync(path), this.protector, `asset:${assetId}`);
  }

  materializeAsset(assetId: string): { path: string; cleanup: () => void } {
    const encryptedPath = this.assetPath(assetId);
    if (!this.protector) return { path: encryptedPath, cleanup: () => {} };
    const runtimeDir = join(this.assetDir, "runtime");
    mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
    const path = join(runtimeDir, `${assetId}-${randomUUID()}.bin`);
    writeFileSync(path, this.readAsset(assetId), { flag: "wx", mode: 0o600 });
    return {
      path,
      cleanup: () => {
        try { unlinkSync(path); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      },
    };
  }

  findByIdempotencyKey(key: string): AnalysisRun | undefined {
    const id = this.idempotency.get(key);
    return id ? this.get(id) : undefined;
  }

  get(id: string): AnalysisRun | undefined {
    const analysis = this.analyses.get(id);
    return analysis ? structuredClone(analysis) : undefined;
  }

  list(): AnalysisRun[] {
    return [...this.analyses.values()].map((analysis) => structuredClone(analysis));
  }

  save(analysis: AnalysisRun): void {
    if (!analysis.id || !Number.isInteger(analysis.stateVersion) || analysis.stateVersion < 1) {
      throw new Error("INVALID_ANALYSIS_STATE_VERSION");
    }
    const evidenceIds = new Set<string>();
    for (const evidence of analysis.evidence) {
      if (!evidence.id || evidenceIds.has(evidence.id)) throw new Error("EVIDENCE_ID_CONFLICT");
      evidenceIds.add(evidence.id);
    }
    for (const [index, event] of analysis.progressEvents.entries()) {
      if (event.sequence !== index + 1 || event.analysisId !== analysis.id) throw new Error("PROGRESS_SEQUENCE_CONFLICT");
    }
    const previous = this.analyses.get(analysis.id);
    if (previous) {
      if (previous.report?.sealed && !analysis.report?.sealed) throw new Error("ANALYSIS_TERMINAL_SEALED");
      if (analysis.stateVersion <= previous.stateVersion) throw new Error("STATE_VERSION_CONFLICT");
    }
    this.analyses.set(analysis.id, structuredClone(analysis));
    this.idempotency.set(analysis.idempotencyKey, analysis.id);
    this.persist();
  }

  deleteAsset(assetId: string): boolean {
    const path = this.assetPath(assetId);
    const derivedDir = join(this.assetDir, "views");
    try {
      for (const name of readdirSync(derivedDir)) {
        if (name.startsWith(`${assetId}-`)) {
          try { unlinkSync(join(derivedDir, name)); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      unlinkSync(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private load(): void {
    try {
      const bytes = decodeStoragePayload(readFileSync(this.filePath), this.protector, "analyses-state");
      const parsed = JSON.parse(bytes.toString("utf8")) as PersistedState;
      for (const analysis of parsed.analyses || []) this.analyses.set(analysis.id, analysis);
      for (const [key, id] of Object.entries(parsed.idempotency || {})) this.idempotency.set(key, id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    const state: PersistedState = {
      analyses: [...this.analyses.values()],
      idempotency: Object.fromEntries(this.idempotency),
    };
    const bytes = encodeStoragePayload(Buffer.from(JSON.stringify(state, null, 2), "utf8"), this.protector, "analyses-state");
    writeFileSync(temporary, bytes, { mode: 0o600 });
    renameSync(temporary, this.filePath);
  }
}
