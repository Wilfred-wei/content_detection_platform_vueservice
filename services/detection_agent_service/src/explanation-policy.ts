import {
  ANALYSIS_SCHEMA_VERSION,
  type ClaimRecord,
  type DecisionRecord,
  type EvidenceRecord,
  type ValidationCheck,
  type ValidationRecord,
  type Verdict,
} from "./analysis-types.js";

export interface ExplanationDraft {
  verdict: Verdict;
  evidenceRefs: string[];
  verifiedProvenanceSources: string[];
  metadataIndicatorRefs: string[];
  modelCoverage: DecisionRecord["modelCoverage"];
  conflicts: string[];
  limitations: string[];
  text: string;
}

const DIRECT_EVIDENCE_UNAVAILABLE = new Set([
  "detector_unavailable",
  "unsupported_format",
  "unavailable",
  "unsupported",
  "error",
]);

function equalArrays(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactCheck(id: string, passed: boolean, detail: string): ValidationCheck {
  return {
    id,
    passed,
    outcome: passed ? "supported" : "contradicted",
    method: "exact",
    detail,
  };
}

function verifiedProvenanceRecords(evidence: EvidenceRecord[]): EvidenceRecord[] {
  return evidence.filter((item) =>
    ["provenance", "watermark"].includes(item.category)
    && item.status === "verified_present"
    && item.strength === "strong"
    && item.facts.provenanceVerified === true,
  );
}

function verifiedProvenanceSources(evidence: EvidenceRecord[]): string[] {
  return verifiedProvenanceRecords(evidence).map((item) => item.source);
}

function metadataIndicatorRefs(evidence: EvidenceRecord[]): string[] {
  return evidence
    .filter((item) => item.category === "metadata" && ["detected", "possibly_present"].includes(item.status))
    .map((item) => item.id);
}

export function deriveLimitations(decision: DecisionRecord, evidence: EvidenceRecord[]): string[] {
  const limitations: string[] = [];
  const directEvidence = evidence.filter((item) => ["provenance", "watermark"].includes(item.category));

  if (directEvidence.length === 0 || directEvidence.some((item) => DIRECT_EVIDENCE_UNAVAILABLE.has(item.status))) {
    limitations.push("部分或全部水印与来源凭证检测器不可用，未检测不等于不存在。");
  }
  if (directEvidence.some((item) => item.status === "invalid")) {
    limitations.push("发现未通过校验的来源凭证，不能作为可信来源证据。");
  }
  if (decision.modelCoverage === "policy_disabled") {
    limitations.push("模型尚未完成选型，当前策略未调用模型服务。");
  }
  if (evidence.some((item) => item.category === "model" && item.source === "dda-dinov2-lora"
    && item.facts.calibrationStatus === "official_threshold_unverified_for_deployment")) {
    limitations.push("DDA 当前采用论文官方阈值，尚未完成本站部署域校准；分数仅作为支持性证据，不能单独证明图像来源。");
  }
  if (evidence.some((item) => item.category === "model" && item.source === "safe-wavelet-resnet"
    && item.facts.calibrationStatus === "official_threshold_unverified_for_deployment")) {
    limitations.push("SAFE 当前采用官方 0.5 边界，尚未完成本站部署域校准；已知部分图像域存在明显失效，分数仅作为支持性证据，不能单独证明图像来源。");
  }
  if (evidence.some((item) => item.category === "model" && item.facts.calibrationStatus === "experimental_threshold_unverified_for_deployment")) {
    limitations.push("MIRROR 当前为本机实验性检测：代码与权重许可尚未核实，发布阈值也未完成本站部署域校准；不得用于生产裁决。");
  }
  if (evidence.some((item) => item.category === "model" && ["detector_unavailable", "error", "unavailable"].includes(item.status))) {
    limitations.push("一个或多个模型本次未形成可用分数，不能把模型覆盖缺口解释为非 AI 证据。");
  }
  if (evidence.some((item) => item.category === "model" && item.facts.outOfDistribution === true)) {
    limitations.push("一个或多个模型将该输入标记为分布外；相关分数仅保留用于审计，不作为支持性裁决证据。");
  }
  if (evidence.some((item) => item.category === "metadata")) {
    limitations.push("元数据仅作为文件内指示，不能单独证明图像来源或真实性。");
  }
  const visualEvidence = evidence.filter((item) => item.category === "visual");
  if (visualEvidence.length === 0 || visualEvidence.every((item) => ["unavailable", "error"].includes(item.status))) {
    limitations.push("多模态视觉调查未形成可用观察，不能据此判断图像来源。");
  } else {
    limitations.push("通用多模态视觉观察尚未完成法证校准，仅作为支持性线索，不能单独决定图像来源。");
  }
  if (evidence.some((item) => item.category === "localization" && item.status === "detected")) {
    limitations.push("局部定位区域来自通过一致性门控的多模态线索，仅用于展示和复核，不能单独证明图像由 AI 生成或被篡改。");
  }
  const visibleMarkEvidence = evidence.filter((item) => item.category === "visual" && item.facts.visibleMark === true);
  if (visibleMarkEvidence.some((item) => item.status === "detected")) {
    limitations.push("可见 AI 标识只能证明图中存在该标识；标识可被复制、移除或伪造，不能验证厂商身份或图像来源。");
  } else if (visibleMarkEvidence.some((item) => item.status === "not_detected")) {
    limitations.push("未观察到明确的可见 AI 标识；标识可能被移除或从未添加，缺失不能作为非 AI 证据。");
  }
  if (decision.conflicts.length > 0) {
    limitations.push("综合证据中存在需要保留的冲突；冲突已在报告中单独列出，不会被静默平均或删除。");
  }
  return limitations;
}

function verdictStatement(verdict: Verdict): string {
  if (verdict === "AI_GENERATED") return "权威结论为 AI 生成。";
  if (verdict === "LIKELY_NON_AI") return "权威结论为较可能非 AI 生成。";
  return "权威结论为证据不足，当前无法确定是否由 AI 生成。";
}

export function createAtomicClaims(
  decision: DecisionRecord,
  evidence: EvidenceRecord[],
  limitations = deriveLimitations(decision, evidence),
  supportedVisualEvidenceRefs?: ReadonlySet<string>,
): ClaimRecord[] {
  const claims: ClaimRecord[] = [{
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: "claim:verdict",
    type: "verdict",
    materiality: "material",
    statement: verdictStatement(decision.verdict),
    evidenceRefs: [...decision.evidenceRefs],
    authoritativeValue: decision.verdict,
  }];

  for (const item of verifiedProvenanceRecords(evidence)) {
    claims.push({
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      id: `claim:provenance:${item.id}`,
      type: "provenance",
      materiality: "material",
      statement: `${item.source} 返回了已验证的 AI 来源证据。`,
      evidenceRefs: [item.id],
      authoritativeValue: "verified_present",
    });
  }

  const metadataRefs = metadataIndicatorRefs(evidence);
  if (metadataRefs.length > 0) {
    claims.push({
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      id: "claim:metadata-indicators",
      type: "metadata",
      materiality: "supporting",
      statement: `发现 ${metadataRefs.length} 项元数据指示，但这些指示不能单独证明图像来源。`,
      evidenceRefs: metadataRefs,
      authoritativeValue: String(metadataRefs.length),
    });
  }

  evidence
    .filter((item) => item.category === "visual"
      && item.status === "detected"
      && item.strength === "supporting"
      && (supportedVisualEvidenceRefs === undefined || supportedVisualEvidenceRefs.has(item.id)))
    .slice(0, 6)
    .forEach((item, index) => {
      claims.push({
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        id: `claim:visual:${index + 1}`,
        type: "visual",
        materiality: "supporting",
        statement: `${item.summary}该线索不能单独证明图像由 AI 生成。`,
        evidenceRefs: [item.id],
        authoritativeValue: "supporting_only",
      });
    });

  evidence
    .filter((item) => item.category === "model"
      && ["detected", "not_detected"].includes(item.status)
      && item.strength === "supporting"
      && item.facts.outOfDistribution !== true
      && typeof item.facts.score === "number"
      && typeof item.facts.threshold === "number")
    .forEach((item, index) => {
      const detectorName = item.source === "dda-dinov2-lora" ? "DDA"
        : item.source === "mirror-dinov3-hplus" ? "MIRROR"
          : item.source === "safe-wavelet-resnet" ? "SAFE" : item.source;
      const direction = item.status === "detected" ? "AI 生成" : "非 AI";
      claims.push({
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        id: `claim:model:${index + 1}`,
        type: "coverage",
        materiality: "supporting",
        statement: `${detectorName} 模型分数为 ${(item.facts.score as number).toFixed(4)}，发布阈值为 ${(item.facts.threshold as number).toFixed(4)}，支持${direction}方向；该阈值尚未完成本站部署校准，不能单独证明图像来源。`,
        evidenceRefs: [item.id],
        authoritativeValue: String(item.facts.predictedClass || "unknown"),
      });
    });

  evidence
    .filter((item) => item.category === "model" && item.source === "model-route-comparison")
    .forEach((item) => {
      claims.push({
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        id: `claim:model-comparison:${item.id}`,
        type: "coverage",
        materiality: "supporting",
        statement: item.summary,
        evidenceRefs: [item.id],
        authoritativeValue: String(item.facts.comparison || "unknown"),
      });
    });

  claims.push({
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: "claim:model-coverage",
    type: "coverage",
    materiality: "material",
    statement: decision.modelCoverage === "policy_disabled"
      ? "模型检测由当前策略禁用，本次没有调用模型服务。"
      : "本次决策包含已启用的模型检测覆盖。",
    evidenceRefs: evidence.filter((item) => item.category === "model").map((item) => item.id),
    authoritativeValue: decision.modelCoverage,
  });

  decision.conflicts.forEach((conflict, index) => {
    claims.push({
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      id: `claim:conflict:${index + 1}`,
      type: "conflict",
      materiality: "material",
      statement: conflict,
      evidenceRefs: [...decision.evidenceRefs],
      authoritativeValue: conflict,
    });
  });

  limitations.forEach((limitation, index) => {
    claims.push({
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      id: `claim:limitation:${index + 1}`,
      type: "limitation",
      materiality: "supporting",
      statement: limitation,
      evidenceRefs: [],
      authoritativeValue: limitation,
    });
  });
  return claims;
}

export function validateAtomicClaims(
  claims: ClaimRecord[],
  decision: DecisionRecord,
  evidence: EvidenceRecord[],
  supportedVisualEvidenceRefs?: ReadonlySet<string>,
): ValidationCheck[] {
  const expected = createAtomicClaims(decision, evidence, deriveLimitations(decision, evidence), supportedVisualEvidenceRefs);
  const knownEvidence = new Set(evidence.map((item) => item.id));
  const identifiers = new Set(claims.map((claim) => claim.id));
  return [
    exactCheck(
      "claim_identity_consistency",
      claims.length === expected.length && equalArrays(claims.map((item) => item.id), expected.map((item) => item.id)),
      "声明集合必须由当前决策和证据确定性构造。",
    ),
    exactCheck(
      "claim_value_consistency",
      JSON.stringify(claims) === JSON.stringify(expected),
      "声明类型、重要性、内容和权威值必须与结构化记录完全一致。",
    ),
    exactCheck(
      "claim_reference_consistency",
      claims.every((claim) => claim.evidenceRefs.every((ref) => knownEvidence.has(ref))),
      "每个声明只能引用当前分析中存在的证据。",
    ),
    exactCheck(
      "claim_identifier_uniqueness",
      identifiers.size === claims.length,
      "声明标识必须唯一。",
    ),
  ];
}

export function renderExplanationDraft(draft: Omit<ExplanationDraft, "text">): string {
  const provenance = draft.verifiedProvenanceSources.length > 0
    ? `已验证的来源证据：${draft.verifiedProvenanceSources.join("、")}。`
    : "未取得可直接证明 AI 来源的已验证强证据。";
  const metadata = draft.metadataIndicatorRefs.length > 0
    ? `发现 ${draft.metadataIndicatorRefs.length} 项元数据指示，但这些指示不作为来源证明。`
    : "未发现可用于说明来源的元数据指示。";
  const model = draft.modelCoverage === "policy_disabled"
    ? "模型检测由策略明确禁用，本次未调用模型服务。"
    : "本次决策包含已启用的模型检测覆盖。";
  const conflicts = draft.conflicts.length > 0
    ? "综合证据存在冲突，冲突已保留并纳入最终裁决。"
    : "";

  if (draft.verdict === "AI_GENERATED") {
    return `结论为 AI 生成。${conflicts}${provenance}${metadata}${model}`;
  }
  if (draft.verdict === "LIKELY_NON_AI") {
    return `结论为较可能非 AI 生成。${conflicts}${provenance}${metadata}${model}`;
  }
  if (draft.conflicts.length > 0) {
    return `结论为不确定。综合证据相互冲突。${provenance}${metadata}${model}`;
  }
  return `结论为不确定。${provenance}缺少直接证据保持中性，不会被解释为非 AI 生成。${metadata}${model}`;
}

export function createExplanationDraft(decision: DecisionRecord, evidence: EvidenceRecord[]): ExplanationDraft {
  const fields = {
    verdict: decision.verdict,
    evidenceRefs: [...decision.evidenceRefs],
    verifiedProvenanceSources: verifiedProvenanceSources(evidence),
    metadataIndicatorRefs: metadataIndicatorRefs(evidence),
    modelCoverage: decision.modelCoverage,
    conflicts: [...decision.conflicts],
    limitations: deriveLimitations(decision, evidence),
  };
  return { ...fields, text: renderExplanationDraft(fields) };
}

export function validateExplanationDraft(
  draft: ExplanationDraft,
  decision: DecisionRecord,
  evidence: EvidenceRecord[],
  validatedAt = new Date().toISOString(),
): ValidationRecord {
  const knownEvidence = new Set(evidence.map((item) => item.id));
  const expectedSources = verifiedProvenanceSources(evidence);
  const expectedMetadata = metadataIndicatorRefs(evidence);
  const expectedLimitations = deriveLimitations(decision, evidence);
  const { text: _text, ...renderFields } = draft;
  const checks = [
    exactCheck("verdict_consistency", draft.verdict === decision.verdict, "解释结论必须与决策记录完全一致。"),
    exactCheck(
      "evidence_reference_consistency",
      equalArrays(draft.evidenceRefs, decision.evidenceRefs) && draft.evidenceRefs.every((ref) => knownEvidence.has(ref)),
      "解释引用必须与决策引用顺序一致且全部存在。",
    ),
    exactCheck("provenance_consistency", equalArrays(draft.verifiedProvenanceSources, expectedSources), "解释中的已验证来源必须与强溯源证据完全一致。"),
    exactCheck("metadata_consistency", equalArrays(draft.metadataIndicatorRefs, expectedMetadata), "解释中的元数据指示必须与证据记录完全一致。"),
    exactCheck("model_coverage_consistency", draft.modelCoverage === decision.modelCoverage, "解释必须准确披露模型覆盖状态。"),
    exactCheck("conflict_consistency", equalArrays(draft.conflicts, decision.conflicts), "解释必须准确披露已验证证据冲突。"),
    exactCheck("limitations_consistency", equalArrays(draft.limitations, expectedLimitations), "解释限制项必须由实际检测覆盖确定。"),
    exactCheck("render_consistency", draft.text === renderExplanationDraft(renderFields), "展示文本必须由已校验的结构化字段确定性生成。"),
  ];

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    status: checks.every((check) => check.passed) ? "verified" : "failed",
    checks,
    attempts: 1,
    validatedAt,
  };
}

function hasAny(text: string, expressions: RegExp[]): boolean {
  return expressions.some((expression) => expression.test(text));
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？!?])/).map((sentence) => sentence.trim()).filter(Boolean);
}

function detectorAliases(record: EvidenceRecord): string[] {
  if (record.source === "dda-dinov2-lora") return ["DDA", record.source];
  if (record.source === "mirror-dinov3-hplus") return ["MIRROR", record.source];
  if (record.source === "safe-wavelet-resnet") return ["SAFE", record.source];
  return [record.source];
}

function detectorSentences(text: string, record: EvidenceRecord): string[] {
  const aliases = detectorAliases(record).map((alias) => alias.toLocaleLowerCase());
  return splitSentences(text).filter((sentence) => {
    const normalized = sentence.toLocaleLowerCase();
    return aliases.some((alias) => normalized.includes(alias));
  });
}

function labelledNumbers(text: string, label: "score" | "threshold"): number[] {
  const pattern = label === "score" ? "(?:分数|score)" : "(?:发布)?(?:阈值|threshold)";
  const expression = new RegExp(`${pattern}\\s*(?:为|是|=|:|：)?\\s*([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))`, "giu");
  return [...text.matchAll(expression)].map((match) => Number(match[1])).filter(Number.isFinite);
}

function exactDisplayedNumber(value: number, authoritative: number): boolean {
  return value === authoritative || value === Number(authoritative.toFixed(4));
}

function modelClaimConsistency(text: string, evidence: EvidenceRecord[]): {
  scoreThreshold: boolean;
  detectorStatus: boolean;
} {
  let scoreThreshold = true;
  let detectorStatus = true;
  for (const record of evidence.filter((item) => item.category === "model" && item.source !== "model-route-comparison")) {
    const sentences = detectorSentences(text, record);
    if (sentences.length === 0) continue;
    const context = sentences.join(" ");
    const scores = labelledNumbers(context, "score");
    const thresholds = labelledNumbers(context, "threshold");
    const score = typeof record.facts.score === "number" ? record.facts.score : undefined;
    const threshold = typeof record.facts.threshold === "number" ? record.facts.threshold : undefined;

    if (scores.some((value) => score === undefined || !exactDisplayedNumber(value, score))) scoreThreshold = false;
    if (thresholds.some((value) => threshold === undefined || !exactDisplayedNumber(value, threshold))) scoreThreshold = false;

    const supportsAi = hasAny(context, [/(?:支持|倾向|判定为|判断为|检测为)\s*(?:AI|人工智能)\s*生成/iu]);
    const supportsNonAi = hasAny(context, [/(?:支持|倾向|判定为|判断为|检测为)\s*(?:非|不是|并非)\s*(?:AI|人工智能)\s*生成?/iu]);
    if (record.status === "detected") {
      if (supportsNonAi) detectorStatus = false;
    } else if (record.status === "not_detected") {
      if (supportsAi) detectorStatus = false;
    } else if (scores.length > 0 || thresholds.length > 0 || supportsAi || supportsNonAi) {
      detectorStatus = false;
    }
  }
  return { scoreThreshold, detectorStatus };
}

function provenanceAuthorityConsistent(text: string, evidence: EvidenceRecord[]): boolean {
  const positiveAuthority = splitSentences(text).filter((sentence) => {
    const claimsAuthority = hasAny(sentence, [
      /(?:来源凭证|溯源凭证|签名|水印).{0,16}(?:验证通过|校验通过|有效可信)/u,
      /(?:已验证|已认证)的?(?:来源|凭证|签名|水印)/u,
      /(?:验证通过|校验通过).{0,16}(?:来源|凭证|签名|水印)/u,
    ]);
    const explicitlyNegated = hasAny(sentence, [/(?:未|没有|无|不能|无法).{0,12}(?:验证|认证|可信)/u]);
    return claimsAuthority && !explicitlyNegated;
  });
  if (positiveAuthority.length === 0) return true;

  const verified = verifiedProvenanceRecords(evidence);
  if (verified.length === 0) return false;
  const unverified = evidence.filter((item) =>
    ["provenance", "watermark"].includes(item.category) && !verified.includes(item),
  );
  return positiveAuthority.every((sentence) => !unverified.some((record) => {
    const identities = [record.source, record.facts.issuer, record.facts.claimedIssuer]
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    return identities.some((identity) => sentence.toLocaleLowerCase().includes(identity.toLocaleLowerCase()));
  }));
}

function metadataAuthorityConsistent(text: string): boolean {
  return splitSentences(text).every((sentence) => {
    if (!/(?:元数据|EXIF|XMP|IPTC|GB\s*45438)/iu.test(sentence)) return true;
    const claimsProof = /(?:证明|证实|确认|验证).{0,20}(?:AI|人工智能|生成|来源)/u.test(sentence)
      || /(?:AI|人工智能|生成|来源).{0,20}(?:已证明|已证实|已确认|已验证)/u.test(sentence);
    const bounded = /(?:不能|无法|不足以|不代表|仅.{0,8}(?:指示|线索|支持))/u.test(sentence);
    return !claimsProof || bounded;
  });
}

export function validateSynthesizedText(
  text: string,
  claims: ClaimRecord[],
  decision: DecisionRecord,
  evidence: EvidenceRecord[],
  supportedVisualEvidenceRefs?: ReadonlySet<string>,
): ValidationCheck[] {
  const normalized = text.normalize("NFC").replace(/\s+/g, " ").trim();
  const productVerdictScope = normalized
    .split(/(?<=[。！？!?])/)
    .filter((sentence) => !/(?:来源凭证|来源认证|溯源结论|可信来源)/.test(sentence)
      || /(?:产品|主|综合|检测)结论/.test(sentence))
    .join(" ");
  const inconclusiveLanguage = hasAny(productVerdictScope, [
    /(?:产品|主|综合|检测)?结论.{0,10}(?:证据不足|不确定|无法(?:确定|判断)|不能(?:确定|判断))/, 
    /(?:证据不足|无法(?:确定|判断)|不能(?:确定|判断)).{0,16}(?:图像|是否由|AI|人工智能)/,
    /inconclusive/i,
  ]);
  const aiGeneratedLanguage = hasAny(productVerdictScope, [/(?:结论|结果).{0,8}(?:为|是|属于).{0,4}(?:AI|人工智能)\s*生成/, /检测(?:判断)?为.{0,4}(?:AI|人工智能)\s*生成/]);
  const nonAiLanguage = hasAny(productVerdictScope, [/(?:结论|结果).{0,8}(?:为|是|属于).{0,4}(?:非|不是|并非).{0,2}(?:AI|人工智能)\s*生成/, /倾向.{0,4}(?:非|不是).{0,2}AI/]);
  const verdictPassed = decision.verdict === "INCONCLUSIVE"
    ? inconclusiveLanguage && !aiGeneratedLanguage && !nonAiLanguage
    : decision.verdict === "AI_GENERATED"
      ? aiGeneratedLanguage && !inconclusiveLanguage && !nonAiLanguage
      : nonAiLanguage && !inconclusiveLanguage && !aiGeneratedLanguage;

  const modelCoveragePassed = decision.modelCoverage !== "policy_disabled"
    || hasAny(normalized, [/未调用.{0,8}模型/, /模型.{0,10}(?:未启用|未使用|禁用|未调用)/, /尚未.{0,10}模型/]);
  const hasUnavailableEvidence = evidence.some((item) => DIRECT_EVIDENCE_UNAVAILABLE.has(item.status));
  const absenceOverclaim = hasUnavailableEvidence && hasAny(normalized, [/不存在.{0,6}(?:水印|来源凭证)/, /未发现任何.{0,6}(?:水印|来源凭证)/]);
  const hasVisualEvidence = evidence.some((item) => item.category === "localization" && ["detected", "verified_present"].includes(item.status))
    || evidence.some((item) => item.category === "visual"
      && ["detected", "verified_present"].includes(item.status)
      && (supportedVisualEvidenceRefs === undefined || supportedVisualEvidenceRefs.has(item.id)));
  const unsupportedVisualClaim = !hasVisualEvidence && hasAny(normalized, [
    /手指.{0,6}(?:异常|畸形)/,
    /光影.{0,6}(?:异常|不一致)/,
    /(?:纹理|边缘|局部).{0,8}(?:异常|伪影|破绽)/,
    /检测到.{0,8}(?:伪影|异常区域)/,
  ]);
  const allowedNumbers = new Set(claims.flatMap((claim) => claim.statement.match(/\d+(?:\.\d+)?/g) || []));
  const numericClaims = normalized.match(/\d+(?:\.\d+)?/g) || [];
  const numericPassed = numericClaims.every((value) => allowedNumbers.has(value));
  const visibleMarkEvidence = evidence.filter((item) => item.category === "visual" && item.facts.visibleMark === true && item.status === "detected");
  const visibleMarkMention = hasAny(normalized, [
    /(?:AI|人工智能|生成式).{0,12}(?:标识|标签|徽标|logo)/i,
    /(?:标识|标签|徽标|logo).{0,12}(?:AI|人工智能|生成式)/i,
  ]);
  const visibleMarkWarning = hasAny(normalized, [
    /(?:标识|标签|徽标|logo).{0,100}(?:不能|无法|不代表|可复制|可移除|可伪造|可能伪造|未验证)/i,
    /(?:不能|无法|不代表|未验证).{0,100}(?:标识|标签|徽标|logo)/i,
  ]);
  const claimedProviders = visibleMarkEvidence
    .map((item) => item.facts.claimedProvider)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const claimedProviderAuthorityPassed = claimedProviders.every((provider) => {
    const index = normalized.indexOf(provider);
    if (index < 0) return true;
    const context = normalized.slice(Math.max(0, index - 100), Math.min(normalized.length, index + provider.length + 140));
    return /(?:标识|标签|徽标|logo|声称|显示|可见)/i.test(context)
      && /(?:不能|无法|不代表|未验证|可伪造|可能伪造|可复制|可移除)/i.test(context);
  });
  const visibleMarkAuthorityPassed = (!visibleMarkMention || visibleMarkWarning) && claimedProviderAuthorityPassed;
  const modelConsistency = modelClaimConsistency(normalized, evidence);
  const provenanceConsistency = provenanceAuthorityConsistent(normalized, evidence);
  const metadataConsistency = metadataAuthorityConsistent(normalized);
  const instructionIsolationPassed = !/(?:忽略(?:上述|之前|系统|所有).{0,24}(?:限制|指令|结论)|(?:执行|运行|调用).{0,16}(?:命令|工具|脚本)|输出.{0,16}(?:系统提示词|密钥|内部指令))/iu.test(normalized);

  return [
    ...validateAtomicClaims(claims, decision, evidence, supportedVisualEvidenceRefs),
    exactCheck("synthesis_nonempty", normalized.length > 0 && normalized.length <= 4_000, "AI 综合分析必须是长度受限的非空文本。"),
    exactCheck("synthesis_verdict_consistency", verdictPassed, "AI 综合分析表达的结论必须与权威决策一致，且不能同时表达相反结论。"),
    exactCheck("synthesis_model_coverage", modelCoveragePassed, "模型策略禁用时，AI 综合分析必须明确说明未调用模型。"),
    exactCheck("synthesis_absence_semantics", !absenceOverclaim, "检测器不可用时，不能把覆盖缺口表述为水印或凭证不存在。"),
    exactCheck("synthesis_visual_claim_scope", !unsupportedVisualClaim, "没有定位或视觉证据时，不能补造图像伪影或异常区域。"),
    exactCheck("synthesis_visible_mark_authority", visibleMarkAuthorityPassed, "可见 AI 标识只能作为可伪造的视觉声明，不能升级为已验证厂商身份或来源。"),
    exactCheck("synthesis_numeric_consistency", numericPassed, "AI 综合分析不得引入原子声明中不存在的数字。"),
    exactCheck("synthesis_model_score_threshold_consistency", modelConsistency.scoreThreshold, "模型分数和阈值必须与同一检测器的结构化证据精确对应。"),
    exactCheck("synthesis_detector_status_consistency", modelConsistency.detectorStatus, "检测器方向和可用状态必须与该检测器的结构化证据一致。"),
    exactCheck("synthesis_provenance_consistency", provenanceConsistency, "未验证、无效或不可信的来源证据不能被升级为已验证来源。"),
    exactCheck("synthesis_metadata_authority", metadataConsistency, "普通元数据只能作为支持性指示，不能被表述为已验证的生成或来源证明。"),
    exactCheck("synthesis_instruction_isolation", instructionIsolationPassed, "解释输出不能执行或复述媒体/上下文中的指令。"),
  ];
}

export function buildVerifiedExplanation(
  decision: DecisionRecord,
  evidence: EvidenceRecord[],
  validatedAt = new Date().toISOString(),
): { explanation: string; validation: ValidationRecord; limitations: string[] } {
  const draft = createExplanationDraft(decision, evidence);
  const validation = validateExplanationDraft(draft, decision, evidence, validatedAt);
  if (validation.status === "verified") {
    return { explanation: draft.text, validation, limitations: draft.limitations };
  }

  return {
    explanation: "结论解释未通过一致性校验。请仅依据结构化决策与证据记录，并将当前结果视为不确定。",
    validation: { ...validation, status: "fallback", fallbackReason: "DETERMINISTIC_EXACT_VALIDATION_FAILED" },
    limitations: [...draft.limitations, "解释文本未通过一致性校验，已切换为保守说明。"],
  };
}

export function deterministicFallbackExplanation(decision: DecisionRecord, evidence: EvidenceRecord[]): string {
  return createExplanationDraft(decision, evidence).text;
}
