import type { AgentConfig } from "./config.js";
import type {
  ClaimRecord,
  DecisionRecord,
  ValidationCheck,
  ValidationOutcome,
} from "./analysis-types.js";
import type { EngineFactory } from "./pi-engine.js";
import {
  EXPLANATION_VERIFIER_QUESTION_TEMPLATES,
  EXPLANATION_VERIFIER_SHARED_TEMPLATE,
} from "./explanation-prompts.js";

const MAX_VERIFIER_ANSWER_LENGTH = 128;

export interface ExplanationVerificationInput {
  analysisId: string;
  decision: DecisionRecord;
  claims: ClaimRecord[];
  explanation: string;
}

export interface ExplanationVerificationResult {
  provider: string;
  model: string;
  checks: ValidationCheck[];
}

export interface ExplanationVerifier {
  verify(input: ExplanationVerificationInput): Promise<ExplanationVerificationResult>;
}

type Variant = "positive" | "inverse" | "paraphrase" | "forced_choice";

interface QuestionSpec {
  variant: Variant;
  method: ValidationCheck["method"];
  question: string;
  expected: "YES" | "NO" | "ALIGNED";
  prompt: string;
}

function verdictLabel(decision: DecisionRecord): string {
  if (decision.verdict === "AI_GENERATED") return "图像已由经过验证的来源证据判定为 AI 生成";
  if (decision.verdict === "LIKELY_NON_AI") return "图像被判定为较可能非 AI 生成";
  return "当前证据不足，无法确定图像是否由 AI 生成";
}

function boundedText(value: string, maximum: number): string {
  return Array.from(value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .slice(0, maximum)
    .join("");
}

function sharedPrompt(input: ExplanationVerificationInput): string {
  const context = JSON.stringify({
      authoritativeVerdict: input.decision.verdict,
      authoritativeMeaning: verdictLabel(input.decision),
      explanation: boundedText(input.explanation, 4_000),
      materialClaims: input.claims
        .filter((claim) => claim.materiality === "material")
        .map((claim) => ({ id: claim.id, statement: boundedText(claim.statement, 512) })),
    });
  return EXPLANATION_VERIFIER_SHARED_TEMPLATE.replace("{{VERIFICATION_CONTEXT}}", context);
}

export function buildPolarityQuestions(input: ExplanationVerificationInput): QuestionSpec[] {
  const context = sharedPrompt(input);
  return [
    {
      variant: "positive",
      method: "semantic_positive",
      question: "解释是否清楚表达了权威结论？",
      expected: "YES",
      prompt: EXPLANATION_VERIFIER_QUESTION_TEMPLATES.positive.replace("{{CONTEXT}}", context),
    },
    {
      variant: "inverse",
      method: "semantic_inverse",
      question: "解释是否表达了与权威结论不兼容的相反结论？",
      expected: "NO",
      prompt: EXPLANATION_VERIFIER_QUESTION_TEMPLATES.inverse.replace("{{CONTEXT}}", context),
    },
    {
      variant: "paraphrase",
      method: "semantic_paraphrase",
      question: "换一种表述后，解释是否仍与权威结论一致？",
      expected: "YES",
      prompt: EXPLANATION_VERIFIER_QUESTION_TEMPLATES.paraphrase
        .replace("{{CONTEXT}}", context)
        .replace("{{AUTHORITATIVE_MEANING}}", verdictLabel(input.decision)),
    },
    {
      variant: "forced_choice",
      method: "semantic_forced_choice",
      question: "强制选择：一致、矛盾还是无法判断？",
      expected: "ALIGNED",
      prompt: EXPLANATION_VERIFIER_QUESTION_TEMPLATES.forcedChoice.replace("{{CONTEXT}}", context),
    },
  ];
}

function parseAnswer(raw: string): "YES" | "NO" | "ALIGNED" | "CONTRADICTED" | "UNKNOWN" {
  const answer = boundedText(raw, MAX_VERIFIER_ANSWER_LENGTH).toUpperCase();
  const token = answer.match(/\b(ALIGNED|CONTRADICTED|UNKNOWN|YES|NO)\b/)?.[1];
  return (token as ReturnType<typeof parseAnswer> | undefined) || "UNKNOWN";
}

function outcome(answer: ReturnType<typeof parseAnswer>, expected: QuestionSpec["expected"]): ValidationOutcome {
  if (answer === "UNKNOWN") return "unverifiable";
  if (answer === expected) return "supported";
  return "contradicted";
}

async function ask(factory: EngineFactory, spec: QuestionSpec): Promise<ValidationCheck> {
  let engine: Awaited<ReturnType<EngineFactory>> | undefined;
  try {
    engine = await factory();
    const answer = parseAnswer(await engine.prompt(spec.prompt));
    const result = outcome(answer, spec.expected);
    return {
      id: `polarity_${spec.variant}`,
      passed: result === "supported",
      outcome: result,
      method: spec.method,
      detail: result === "supported"
        ? "独立语义问题的回答符合预期。"
        : result === "contradicted"
          ? "独立语义问题的回答与预期矛盾。"
          : "独立语义问题未得到可判定回答。",
      question: spec.question,
      answer,
    };
  } catch (error) {
    return {
      id: `polarity_${spec.variant}`,
      passed: false,
      outcome: "unverifiable",
      method: spec.method,
      detail: `语义复核调用不可用：${error instanceof Error ? error.message : "VERIFIER_FAILED"}`,
      question: spec.question,
      answer: "UNAVAILABLE",
    };
  } finally {
    engine?.dispose();
  }
}

export class PiExplanationVerifier implements ExplanationVerifier {
  constructor(
    private readonly config: AgentConfig,
    private readonly engineFactory: EngineFactory,
  ) {}

  async verify(input: ExplanationVerificationInput): Promise<ExplanationVerificationResult> {
    const checks = await Promise.all(buildPolarityQuestions(input).map((spec) => ask(this.engineFactory, spec)));
    return { provider: this.config.provider, model: this.config.model, checks };
  }
}

export const unavailableExplanationVerifier: ExplanationVerifier = {
  async verify(): Promise<ExplanationVerificationResult> {
    const checks: ValidationCheck[] = ([
      ["positive", "semantic_positive"],
      ["inverse", "semantic_inverse"],
      ["paraphrase", "semantic_paraphrase"],
      ["forced_choice", "semantic_forced_choice"],
    ] as const).map(([id, method]) => ({
      id: `polarity_${id}`,
      passed: false,
      outcome: "unverifiable",
      method,
      detail: "语义复核器尚未配置。",
      answer: "UNAVAILABLE",
    }));
    return { provider: "unavailable", model: "unavailable", checks };
  },
};
