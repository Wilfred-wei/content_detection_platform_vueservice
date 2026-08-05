## Why

AI-generated image detection cannot be made production-ready by exposing a single classifier score. The product needs a layered, auditable detection agent that can short-circuit on verified provenance, route uncertain samples through complementary detectors, produce evidence-grounded explanations, and reject explanations that cannot be verified.

## What Changes

- Introduce a secure image intake pipeline that preserves original bytes and creates traceable detector-specific views.
- Introduce a registry-based provenance and watermark detection layer covering signed provenance, standard metadata, visible marks, and pluggable vendor or open-source invisible watermark detectors.
- Introduce a staged detector orchestration layer with a primary detector, conditionally triggered complementary detectors, out-of-distribution handling, and normalized evidence outputs.
- Introduce bounded concurrent execution with durable queues, tenant-aware backpressure, idempotent work, provenance and detector completion barriers, and GPU-aware scheduling.
- Introduce a deterministic evidence and decision layer that supports verified-provenance short-circuiting, conflict handling, calibrated inference, and an explicit inconclusive outcome.
- Introduce structured, evidence-grounded explanation generation instead of unconstrained narrative generation.
- Introduce explanation verification using exact evidence checks, verdict consistency checks, and polarity-controlled multimodal checks for visual claims.
- Introduce user-facing reports, machine-readable results, replayable audit records, and offline quality evaluation.
- Add `detection_agent_service` as an independently runnable sibling service inside the existing content-detection platform repository instead of creating or copying a second platform repository.
- Preserve the completed Pi SDK conversational bootstrap milestone, and deliver the current walking skeleton as a real upload-to-report chain: direct-evidence collection, deterministic decisioning, required Pi-based AI synthesis, and a sealed web report. Model detection and synthesis revalidation remain explicitly marked when they are not yet enabled.
- Keep the initial release scoped to AI-generated image detection while defining media-neutral evidence envelopes that can later support false-news and deceptive-video capabilities.

## Capabilities

### New Capabilities

- `image-analysis-intake`: Preserve, validate, identify, hash, derive traceable image inputs, and safely reuse tenant-scoped work for downstream analysis.
- `provenance-watermark-detection`: Collect direct and supporting source signals from C2PA, AIGC metadata, visible marks, and registered invisible watermark detectors.
- `detector-orchestration`: Route bounded concurrent work through primary and complementary AI-image detectors based on confidence, disagreement, out-of-distribution signals, and resource availability.
- `evidence-decisioning`: Normalize evidence, apply precedence and conflict policies, seal decisions after completion barriers, short-circuit on verified provenance, and produce calibrated three-way decisions.
- `verified-explanation`: Build explanations from structured evidence and verify numeric, logical, visual, polarity, and verdict consistency before publication.
- `detection-reporting`: Expose concurrent analysis submission, resumable progress, concise web reports, machine-readable results, evidence references, and replayable audit records through the agent interface.
- `detection-quality-evaluation`: Evaluate detector generalization, watermark robustness, calibration, disagreement, explanation correctness, production drift, concurrency, and capacity limits.

### Modified Capabilities

None.

## Impact

- Adds `services/detection_agent_service` to the existing platform monorepo as a Node.js/TypeScript service built on the Pi SDK, with its own runtime, API, configuration, tests, and deployment boundary.
- Adds a dedicated "Detection Agent" frontend section and platform-gateway routes for Pi sessions and chat; the browser calls the gateway rather than the Pi process directly.
- Reuses the existing Python AI-image detection service through a versioned adapter in the prototype instead of copying model code or weights into the agent.
- Adds a web-facing AI image detection workflow orchestrated through restricted Pi custom tools.
- Adds backend services for intake, provenance scanning, detector execution, decision policy, explanation construction and verification, reporting, and evaluation.
- Adds registries for watermark detectors and AI-image detector implementations without requiring commercial detection APIs.
- Adds durable schemas for assets, evidence, claims, decisions, reports, detector versions, and audit events.
- Introduces compute and storage requirements for local image models, multimodal verification, original asset retention, and evaluation datasets.
- Introduces durable queueing, concurrency control, tenant quotas, GPU admission and batching, idempotency storage, and capacity monitoring requirements.
- Establishes extension points for future news and video analysis without requiring those modalities in the initial implementation.
