import { createHash } from "node:crypto";

export interface DdaReplaySourceRecord {
  benchmark: string;
  domain: string;
  label: 0 | 1;
  samplePath: string;
  split: string;
  suite: string;
}

export interface DdaReplaySelection extends DdaReplaySourceRecord {
  subgroup: string;
}

function boundedText(value: unknown, field: string, maximum = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`INVALID_DDA_REPLAY_MANIFEST:${field}`);
  }
  return value.trim();
}

export function parseDdaReplaySourceManifest(raw: string): DdaReplaySourceRecord[] {
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`INVALID_DDA_REPLAY_MANIFEST:json:${index + 1}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`INVALID_DDA_REPLAY_MANIFEST:record:${index + 1}`);
    }
    const record = value as Record<string, unknown>;
    if (record.label !== 0 && record.label !== 1) {
      throw new Error(`INVALID_DDA_REPLAY_MANIFEST:label:${index + 1}`);
    }
    const samplePath = boundedText(record.sample_path, `sample_path:${index + 1}`, 4_096);
    if (!samplePath.startsWith("/")) throw new Error(`INVALID_DDA_REPLAY_MANIFEST:absolute_path:${index + 1}`);
    return {
      benchmark: boundedText(record.benchmark, `benchmark:${index + 1}`),
      domain: boundedText(record.domain, `domain:${index + 1}`),
      label: record.label,
      samplePath,
      split: boundedText(record.split, `split:${index + 1}`),
      suite: boundedText(record.suite, `suite:${index + 1}`),
    };
  });
}

function rank(seed: number, material: string): string {
  return createHash("sha256").update(`${seed}:${material}`).digest("hex");
}

export function selectBalancedDdaReplay(
  records: readonly DdaReplaySourceRecord[],
  options: { seed: number; maxDomains: number; perClass: number },
): DdaReplaySelection[] {
  if (!Number.isSafeInteger(options.seed) || !Number.isSafeInteger(options.maxDomains)
    || options.maxDomains <= 0 || !Number.isSafeInteger(options.perClass) || options.perClass <= 0) {
    throw new Error("INVALID_DDA_REPLAY_SELECTION_OPTIONS");
  }
  const groups = new Map<string, { real: DdaReplaySourceRecord[]; fake: DdaReplaySourceRecord[] }>();
  for (const record of records) {
    const key = `${record.benchmark}/${record.domain}`;
    const group = groups.get(key) || { real: [], fake: [] };
    (record.label === 0 ? group.real : group.fake).push(record);
    groups.set(key, group);
  }
  const eligible = [...groups.entries()]
    .filter(([, group]) => group.real.length >= options.perClass && group.fake.length >= options.perClass)
    .sort(([left], [right]) => rank(options.seed, left).localeCompare(rank(options.seed, right)))
    .slice(0, options.maxDomains);
  if (eligible.length === 0) throw new Error("DDA_REPLAY_NO_BALANCED_DOMAINS");

  return eligible.flatMap(([subgroup, group]) => {
    const choose = (items: DdaReplaySourceRecord[]) => [...items]
      .sort((left, right) => rank(options.seed, left.samplePath).localeCompare(rank(options.seed, right.samplePath)))
      .slice(0, options.perClass)
      .map((record) => ({ ...record, subgroup }));
    return [...choose(group.real), ...choose(group.fake)];
  });
}

export function imageMimeType(path: string): "image/png" | "image/jpeg" | "image/webp" {
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg" || extension === "jfif") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  throw new Error(`DDA_REPLAY_UNSUPPORTED_EXTENSION:${extension || "none"}`);
}
