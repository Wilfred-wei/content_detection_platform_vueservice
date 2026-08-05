import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { EngineFactory, ConversationEngine } from "./pi-engine.js";
import type { ChatMessage, ConversationSession } from "./types.js";
import { decodeStoragePayload, encodeStoragePayload, type StorageProtector } from "./storage-crypto.js";

interface StoredSession extends ConversationSession {
  engine?: ConversationEngine;
}

export class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly filePath?: string;

  constructor(
    private readonly engineFactory: EngineFactory,
    private readonly maxSessions: number,
    private readonly maxMessages: number,
    dataDir?: string,
    private readonly protector?: StorageProtector,
  ) {
    if (dataDir) {
      const root = resolve(dataDir);
      mkdirSync(root, { recursive: true });
      this.filePath = join(root, "sessions.json");
      this.load();
    }
  }

  create(): ConversationSession {
    this.evictOldestIfNeeded();
    const now = new Date().toISOString();
    const session: StoredSession = {
      id: randomUUID(),
      status: "idle",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.sessions.set(session.id, session);
    this.persist();
    return this.publicSession(session);
  }

  get(id: string): ConversationSession | undefined {
    const session = this.sessions.get(id);
    return session ? this.publicSession(session) : undefined;
  }

  async send(id: string, content: string): Promise<ConversationSession> {
    const session = this.sessions.get(id);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status === "busy") throw new Error("SESSION_BUSY");

    session.status = "busy";
    session.error = undefined;
    this.append(session, "user", content);

    try {
      session.engine ??= await this.engineFactory();
      const response = await session.engine.prompt(content);
      this.append(session, "assistant", response || "No response was produced.");
      session.status = "idle";
    } catch (error) {
      session.status = "failed";
      session.error = error instanceof Error ? error.message : "PI_REQUEST_FAILED";
      throw error;
    } finally {
      session.updatedAt = new Date().toISOString();
      this.persist();
    }

    return this.publicSession(session);
  }

  async cancel(id: string): Promise<ConversationSession> {
    const session = this.sessions.get(id);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status === "busy" && session.engine) await session.engine.abort();
    session.status = "idle";
    session.error = undefined;
    session.updatedAt = new Date().toISOString();
    this.persist();
    return this.publicSession(session);
  }

  close(reset = false): void {
    for (const session of this.sessions.values()) session.engine?.dispose();
    this.sessions.clear();
    if (reset && this.filePath) {
      try { unlinkSync(this.filePath); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  private append(session: StoredSession, role: ChatMessage["role"], content: string): void {
    session.messages.push({ id: randomUUID(), role, content, createdAt: new Date().toISOString() });
    if (session.messages.length > this.maxMessages) {
      session.messages.splice(0, session.messages.length - this.maxMessages);
    }
    session.updatedAt = new Date().toISOString();
  }

  private evictOldestIfNeeded(): void {
    if (this.sessions.size < this.maxSessions) return;
    const oldest = this.sessions.values().next().value as StoredSession | undefined;
    if (!oldest) return;
    oldest.engine?.dispose();
    this.sessions.delete(oldest.id);
    this.persist();
  }

  private publicSession(session: StoredSession): ConversationSession {
    const { engine: _engine, ...publicValue } = session;
    return { ...publicValue, messages: [...publicValue.messages] };
  }

  private load(): void {
    if (!this.filePath) return;
    try {
      const bytes = decodeStoragePayload(readFileSync(this.filePath), this.protector, "sessions-state");
      const parsed = JSON.parse(bytes.toString("utf8")) as { sessions?: ConversationSession[] };
      for (const session of parsed.sessions || []) {
        if (!session || typeof session.id !== "string" || !Array.isArray(session.messages)) continue;
        this.sessions.set(session.id, {
          id: session.id,
          status: session.status === "failed" ? "failed" : "idle",
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messages: session.messages.slice(-this.maxMessages),
          ...(session.error ? { error: session.error } : {}),
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    const bytes = encodeStoragePayload(
      Buffer.from(JSON.stringify({ schemaVersion: "1.0.0", sessions: [...this.sessions.values()].map((session) => this.publicSession(session)) }, null, 2), "utf8"),
      this.protector,
      "sessions-state",
    );
    writeFileSync(temporary, bytes, { mode: 0o600 });
    renameSync(temporary, this.filePath);
  }
}
