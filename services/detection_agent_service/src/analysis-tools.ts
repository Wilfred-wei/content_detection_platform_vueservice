import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";

import { AnalysisService } from "./analysis-service.js";

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value };
}

export function createAnalysisTools(analyses: AnalysisService): ToolDefinition[] {
  const analysisId = Type.String({ description: "Immutable analysis identifier created by the web upload API." });
  return [
    defineTool({
      name: "analyze_image",
      label: "Analyze image",
      description: "Read the current result for an uploaded AI-image analysis. Detector selection and policy are backend-owned.",
      parameters: Type.Object({ analysisId }),
      executionMode: "parallel",
      async execute(_callId, params) {
        const analysis = analyses.get(params.analysisId);
        return textResult({ analysisId: analysis.id, state: analysis.state, stages: analysis.stages, decision: analysis.decision });
      },
    }),
    defineTool({
      name: "get_analysis_status",
      label: "Get analysis status",
      description: "Get authoritative lifecycle stages for an existing analysis.",
      parameters: Type.Object({ analysisId }),
      executionMode: "parallel",
      async execute(_callId, params) {
        const analysis = analyses.get(params.analysisId);
        return textResult({ analysisId: analysis.id, state: analysis.state, stateVersion: analysis.stateVersion, stages: analysis.stages, error: analysis.error });
      },
    }),
    defineTool({
      name: "get_evidence",
      label: "Get evidence",
      description: "Get immutable typed evidence produced by the backend analysis policy.",
      parameters: Type.Object({ analysisId }),
      executionMode: "parallel",
      async execute(_callId, params) { return textResult({ analysisId: params.analysisId, evidence: analyses.evidence(params.analysisId) }); },
    }),
    defineTool({
      name: "get_report",
      label: "Get sealed report",
      description: "Get the sealed report for a completed analysis. Never use this tool to alter evidence or decisions.",
      parameters: Type.Object({ analysisId }),
      executionMode: "parallel",
      async execute(_callId, params) { return textResult(analyses.report(params.analysisId)); },
    }),
  ];
}
