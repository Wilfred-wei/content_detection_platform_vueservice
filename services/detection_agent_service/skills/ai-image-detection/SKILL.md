---
name: ai-image-detection
description: Operate and explain existing AI-generated-image analyses through restricted aggregate domain tools.
version: 1.2.0
---

# AI Image Detection

Use this skill when the user asks to inspect progress, evidence, or the sealed result of an AI-image analysis created in the web workspace.

## Workflow

1. Require the immutable analysis ID produced by the web upload API. If it is missing, direct the user to submit the image in the Detection Agent workspace; never claim to inspect an image from chat, a filename, filesystem path, pasted URL, or conversation attachment.
2. Call `analyze_image` once to obtain the backend-owned state and decision snapshot. Use `get_analysis_status` when the run is non-terminal or when the user asks about progress.
3. Call `get_report` only after completion. Treat `productDecision` as the sealed AI-generation judgment and `provenanceConclusion` as the separate source-credential conclusion.
4. Call `get_evidence` only for requested detail, conflict clarification, detector coverage, or evidence-source questions. Do not use it to search for a preferred answer.
5. Answer in the user's language and distinguish the comprehensive product decision, source provenance, supporting observations, detector conflicts, and unavailable coverage.

## Decision Language

- Preserve `productDecision` values `AI_GENERATED`, `LIKELY_NON_AI`, and `INCONCLUSIVE` exactly. `INCONCLUSIVE` means evidence is insufficient or conflicting; it does not mean authentic, human-created, or probably non-AI.
- Specialist detector results are high-value evidence for the backend multimodal adjudicator. Preserve their individual directions and limitations; never average raw cross-model scores, count votes, or give one detector an automatic veto.
- Present only the sealed confidence band unless the report explicitly supplies a deployment-calibrated probability. Never convert an internal model confidence into a percentage.
- A verified provenance or watermark result may establish source provenance only when the sealed report says so. Missing or invalid provenance does not override `productDecision`. Metadata, generic multimodal cues, localization, and visible AI labels remain supporting-only unless the report explicitly records a promoted detector authority.
- A visible AI label can be copied, removed, or forged. State only that the label was observed and independently checked; never authenticate the claimed provider or generator from the label.
- `not_detected`, `detector_unavailable`, `unsupported_format`, `error`, and `policy_disabled` are different states. Never collapse them into “not present.”

## Boundaries

- Do not use the conversational model's own visual impression as detection evidence and do not ask it to reclassify the image outside the backend workflow.
- Do not select, skip, repeat, or reorder individual detectors; change thresholds, prompts, views, models, providers, evidence strength, policy, or decisions; or request a more favorable rerun.
- Never invent scores, watermarks, metadata, provenance, visual defects, locations, progress, or model coverage.
- News verification and video forensics are separate future capabilities. Do not present them as active AI-image tools.
