## Context

The initial product detects whether an uploaded image was AI-generated. The team already owns multiple detection models, but their generalization domains, calibration, and error correlations differ. Production reliability therefore depends on combining direct provenance signals, staged model inference, explicit uncertainty, and verified explanations rather than choosing a single universal detector.

The service must run without commercial detection APIs. Pi provides the web-facing agent experience and invokes controlled backend tools, while deterministic services own evidence collection and final decisions. Localization is optional and conditionally triggered. False-news and deceptive-video detection are future capabilities and must not force image-specific fields into a shared top-level model.

The existing product is a monorepo containing a Vue frontend, a Flask gateway, and independently runnable Python detector services. The new agent belongs in that repository as `services/detection_agent_service`, but remains a separate Node.js/TypeScript process and container because the Pi SDK is its runtime and the detector workers have different dependencies and scaling characteristics. The completed bootstrap milestone validated Pi deployment and the product shell. The current walking skeleton additionally accepts an image, collects direct evidence, makes a deterministic decision, requires Pi to synthesize a bounded analysis from structured evidence, and publishes that synthesis in the web report. Model inference and synthesis revalidation remain separate later gates and are never presented as already executed.

## Goals / Non-Goals

**Goals:**

- Deliver an auditable online pipeline from original image intake to a verified report.
- End expensive analysis early when a trusted, scheme-specific provenance signal verifies AI origin.
- Route unresolved images through complementary local detectors and preserve disagreement instead of hiding it in an average.
- Produce a three-way decision with explicit basis, policy version, and evidence references.
- Generate explanations only from structured evidence and verify every material claim before publication.
- Expose the pipeline through a web UI and Pi custom tools without allowing the agent to override decisions.
- Integrate with the existing platform as a sibling service, gateway API, and dedicated frontend section without copying the platform or model weights.
- Produce a first-phase prototype that demonstrates a deployable Pi session and real web conversation while making unconfigured detection capabilities explicit.
- Define media-neutral asset, evidence, claim, and report envelopes for later news and video capabilities.
- Support bounded multi-user and intra-analysis concurrency without making results depend on task completion order.

**Non-Goals:**

- Detect false news, deceptive context, or manipulated video in the initial release.
- Identify a specific generator unless verified provenance or a separately validated attribution capability supports it.
- Guarantee that absence of a watermark or metadata means an image is not AI-generated.
- Run every registered model or watermark detector on every image.
- Make localization mandatory for every result.
- Use an LLM or VLM as the authoritative decision engine.
- Guarantee unbounded throughput or silently reduce required analysis quality under overload.

## Decisions

### 1. Use Pi as a restricted agent runtime above the detection control plane

`detection_agent_service` SHALL embed the official Pi SDK in a Node.js/TypeScript runtime. Pi provides session management, conversational explanation, event streaming, and controlled tool invocation. It SHALL call a single analysis workflow for normal user requests and SHALL NOT select evidence precedence, thresholds, or the final decision. The service exposes only domain tools such as `analyze_image`, `get_analysis_status`, `get_evidence`, and `get_report`; Pi's generic shell, read, write, and edit tools are disabled in production.

The prototype SHALL use the published `@earendil-works/pi-coding-agent` SDK through a pinned package version. A checked-out Pi source tree may be used for documentation and local debugging, but it is not copied into the platform service. The first milestone starts Pi with no generic coding tools and no image-detection tools; later domain tools are added behind the same allowlist. This keeps dependency updates explicit and prevents a vendored fork from drifting.

This keeps conversational behavior replaceable and prevents prompt variation from changing the detection policy. The rejected alternatives are allowing Pi to call arbitrary detectors and synthesize a verdict, or merely labeling a conventional Flask endpoint as an agent, because neither provides a controlled and reproducible agent runtime.

### 2. Use a staged online pipeline with an explicit state machine

The online workflow is:

```text
RECEIVED -> INGESTED -> DIRECT_EVIDENCE_SCAN -> DIRECT_EVIDENCE_BARRIER
  -> VERIFIED_PROVENANCE -> DECIDED -> TEMPLATE_REPORT
  -> UNRESOLVED -> PRIMARY_INFERENCE
       -> SUFFICIENT -> DECIDED
       -> NEEDS_ESCALATION -> COMPLEMENTARY_INFERENCE -> DECIDED
  -> EXPLANATION_BUILD -> EXPLANATION_VERIFY -> PUBLISHED
  -> FAILED or INCONCLUSIVE at any policy-defined terminal condition
```

Direct evidence scanning is the fast path. Only `verified_present` signals from a registered detector whose trust policy permits short-circuiting can terminate model inference. Possible matches, visible labels, unsigned metadata, and detector errors remain evidence but do not terminate analysis.

The initial backend is a modular analysis control plane inside `detection_agent_service`, with durable jobs and evidence storage, while untrusted parsers and GPU detectors run in isolated workers. These are logical service boundaries, not a requirement to deploy every module as a separate network service. The platform gateway, Pi runtime, analysis control plane, and model workers remain separate runtime responsibilities even when their source lives in the same repository. This reduces initial distributed-system overhead while preserving independent scaling for model workers.

### 3. Preserve original bytes and use immutable, traceable derived views

The intake service stores the original object, computes a content hash, validates the actual media type, and creates immutable derived views for detector-specific preprocessing. Every evidence record references the original asset and, when applicable, the exact derived view and transformation recipe used.

This prevents forensic data loss and enables replay. Reusing a single normalized image for all tools was rejected because metadata, watermarks, and model preprocessing require different representations.

### 4. Represent all findings as typed evidence

The core envelope contains:

- `MediaAsset`: media kind, hashes, storage references, format facts, and parent/derivation relationships.
- `AnalysisRun`: tenant scope, lifecycle state, optimistic state version, policy bundle, tool versions, timestamps, cancellation state, and failure state.
- `WorkItem`: idempotency key, queue class, attempt, lease, deadline, resource request, and terminal status for one stage or detector execution.
- `EvidenceRecord`: evidence kind, producer, subject, result semantics, strength, confidence or statistical result, payload, and artifact references.
- `DecisionRecord`: `AI_GENERATED`, `LIKELY_NON_AI`, or `INCONCLUSIVE`; basis; confidence band; evidence references; conflicts; and policy version.
- `ClaimRecord`: atomic explanation claim, claim type, evidence references, and publication importance.
- `ValidationRecord`: supported, contradicted, or unverifiable result with validator details.

Media-specific details live in versioned evidence payloads. Future article and video analyzers can reuse the envelopes without sharing image detector fields.

### 5. Implement provenance and watermark detection through a registry

Each detector registration declares scheme, supported media and formats, runtime class, required key or model resources, positive and negative semantics, threshold and false-positive calibration, transformations allowed, version, and whether a verified result may short-circuit inference.

Initial registry families include C2PA validation, GB 45438-2025 AIGC metadata, EXIF/XMP extraction, Stability's SDXL invisible watermark, registered DWT-DCT-SVD and RivaGAN profiles, TrustMark, and the commercially usable Meta releases VideoSeal v1.0, PixelSeal, ChunkySeal, and the `wam_mit` Watermark Anything checkpoint. The WAM COCO checkpoint and Stable Signature remain excluded because their public terms are noncommercial. Closed vendor schemes such as image SynthID remain explicit unsupported adapters until an authorized local detector exists.

The classic DWT-DCT-SVD and RivaGAN profiles are not universal AI-origin detectors. They run only against explicit locally registered payloads. The RivaGAN ONNX artifacts are extracted from a digest-pinned MIT wheel during setup and are never fetched by an analysis request. Generator-coupled research methods such as Gaussian Shading remain evaluation adapters until a deployment owns and registers the exact diffusion model, scheduler, inversion settings, and secret key; MarkDiffusion is treated as an evaluation toolkit rather than a detector identity.

The Meta implementations share one versioned worker protocol and one UV-managed runtime but retain separate scheme registrations, checkpoint identities, payload widths, resource budgets, and evidence records. Official source revisions and model files are provisioned before startup, checked against immutable identifiers or SHA-256 digests, and used offline at request time. VideoSeal and WAM are the initial online profiles; PixelSeal and ChunkySeal are deployable profiles that remain disabled by the default online budget until persistent GPU residency and capacity tests are complete. The leading detector channel and unbound decoded bits remain diagnostics only; candidate evidence requires sufficient bit agreement with a reviewed payload binding. WAM also retains mask coverage statistics, while visual localization artifacts remain conditionally routed work in the later localization phase.

Multiple transformed views may improve watermark recall, but thresholds are calibrated for the complete multi-view procedure. The system does not report the maximum of uncorrected repeated tests.

### 6. Use a cascade of complementary AI-image detectors

The detector registry describes each model's training domains, model family, signal family, preprocessing, runtime cost, calibration artifact, and supported output evidence. The default route runs one selected primary generalization detector. Complementary detectors are triggered when confidence is near a policy boundary, the sample is out of distribution, required robustness checks fail, or detectors disagree.

Complementary selection favors error diversity, such as different training data and spatial, frequency, or noise signal families. A versioned fusion policy consumes calibrated outputs and disagreement features. Model count is not used as a proxy for evidence independence.

Concrete model selection is deferred to an evaluation gate because the correct primary and complementary set depends on measured performance on the deployment distribution.

### 7. Make decisioning deterministic and permit abstention

The policy engine applies versioned precedence rules:

1. Verified AI provenance can establish `AI_GENERATED` and skip model inference.
2. Conflicting verified provenance produces an explicit conflict and normally `INCONCLUSIVE` pending policy handling.
3. Without verified provenance, calibrated model evidence and out-of-distribution status determine the decision.
4. Missing watermarks or metadata are neutral, not negative evidence.
5. Unsupported, failed, and not-detected states remain distinct.

The API exposes a three-way result even if a downstream UI later maps it to a binary workflow. Abstention is preferred to a forced low-quality classification.

### 8. Generate structured explanations and verify atomic claims

The explanation builder first creates atomic claims from the decision and evidence graph, then renders prose. Numeric, provenance, and tool claims are verified by exact comparison. Final-verdict claims are checked against the immutable decision. Visual claims are independently checked with controlled multimodal question families consisting of a positive question, semantic inverse, paraphrase, forced-choice form, and optional crop-level repetition.

Polarity checks run in independent contexts with randomized order and an `unknown` option. A polarity failure marks the claim unverifiable; it does not invert the fact. Detector-specific forensic claims cannot be verified by a generic VLM and require their originating tool or are omitted.

One regeneration attempt is allowed after verification failure. A second failure causes deterministic template fallback or an `INCONCLUSIVE` explanation state. Verified provenance short-circuits use deterministic templates and do not require free-form generation.

The walking-skeleton release intentionally precedes that fallback policy. It performs one required Pi synthesis after the authoritative decision; provider failure or empty output produces an explicit `AI_SYNTHESIS_FAILED` analysis failure. This gives the team one complete, observable chain before adding regeneration, fallback, and independent multimodal revalidation.

### 9. Keep localization conditional

Localization runs only when a detector supports reliable localization and the policy requests it, such as explanation verification, evidence conflict investigation, or an explicit user request. Localization artifacts are evidence overlays, not independent proof of AI generation.

### 10. Treat evaluation and operations as part of the product

Offline evaluation selects model routes and thresholds using generator-held-out, post-processing, and real-image domain splits. It measures operating-point metrics, calibration, abstention, subgroup performance, watermark robustness, explanation support, polarity consistency, and latency. Production monitoring tracks distributions and drift without silently changing a policy bundle.

All result-producing versions and configurations are immutable within an analysis run so any report can be replayed.

### 11. Bound and coordinate concurrent work explicitly

The system supports external concurrency across users and internal concurrency among collectors or complementary detectors. Both use durable at-least-once queues with idempotent consumers; exactly-once delivery is not assumed.

```text
Pi / Web -> API admission -> Analysis queue -> Workflow orchestrator
                                           |-> CPU parser queue
                                           |-> provenance queue
                                           |-> model-specific GPU queues
                                           `-> multimodal verifier queue
                                                        |
                                                 Evidence store
                                                        |
                                                  completion barrier
```

Every work item uses an idempotency key derived from tenant scope, analysis, stage, detector and version, derived-view hash, and policy-approved attempt identity. Evidence storage enforces uniqueness for the logical execution. Retries may repeat computation but cannot create duplicate authoritative evidence.

Analysis state transitions use optimistic compare-and-swap on the expected state and `state_version`. Decisions and reports are sealed terminal records. A worker that loses its lease, finishes after cancellation, or returns after sealing may append an operational audit event but cannot change authoritative evidence, decision, or report state.

Direct provenance collectors may fan out concurrently, but the first positive result does not immediately publish a decision. A verified short-circuit signal stops unscheduled model work and enters a provenance completion barrier that waits for all scheduled strong-provenance collectors to complete or reach their recorded deadlines. The policy checks conflicts before sealing the decision. Supporting-only and expensive optional collectors do not hold this barrier unless the policy lists them as required.

After primary inference, escalation policy chooses the complete complementary detector set before fan-out. Decisioning waits for every scheduled detector to finish, fail, or time out. It does not depend on response order. Cancellation is best effort for active computation, and late results are discarded from the sealed decision.

GPU work is routed by model and compatible device class. Each worker declares model residency, available memory, supported batch shape, and concurrency slots. Admission reserves capacity before execution. Optional bounded micro-batching is permitted only within a configured maximum queue delay and must preserve per-request preprocessing and result identity. Models are not loaded independently for every request.

Admission applies per-user or tenant concurrent-run limits, global queue bounds, upload limits, weighted fairness, maximum queue age, and stage-specific resource budgets. Overload queues or rejects new work explicitly; it does not silently omit required detectors. If a required detector misses its deadline, normal degradation policy produces `INCONCLUSIVE` when the remaining evidence is insufficient.

Original object storage may deduplicate bytes by content hash. Result reuse or in-flight work coalescing is allowed only when tenant or authorized security scope, asset hash, policy bundle, detector versions, preprocessing versions, and relevant request options match. Cross-tenant reuse must not expose whether another tenant submitted the same content.

Progress is emitted from persisted state-transition events with monotonic sequence numbers. Pi and web clients may reconnect using a cursor and multiple clients may observe one run without starting duplicate analysis.

### 12. Co-locate source while preserving service and API boundaries

The agent SHALL be implemented at `services/detection_agent_service` in the existing content-detection platform repository. It has its own package manifest, configuration, health check, test commands, process, container, and deployment lifecycle. The existing `services/ai_detection_service` remains a model worker and is invoked through an adapter; its model code, environment, checkpoints, and output files are not duplicated into the agent.

The platform integration path is:

```text
Vue route /detection-agent/image
  -> Flask gateway /api/v1/agent/analyses
  -> detection_agent_service analysis API
  -> restricted Pi tools and deterministic workflow
  -> watermark / metadata collectors
  -> existing or future model-worker adapters
  -> evidence, decision, explanation verification, report
```

The browser SHALL not call model workers directly for the new Agent workflow. The Flask gateway owns platform-facing request forwarding and later authentication propagation; the Agent API owns analysis identities, lifecycle, evidence, and reports. Services do not share mutable database tables.

The frontend SHALL add one first-class navigation item named "Detection Agent". The completed bootstrap milestone provided a Pi conversation workspace with connection and provider status, session creation, backend-derived message progress, retry, and stable failure states. The current image workflow adds image selection and preview, analysis progress, three-way decisions, evidence summaries, AI comprehensive analysis, explicit verification status, and limitations without changing the top-level route. Disabled model detection, revalidation, and localization remain visible as disabled or skipped states rather than hidden capabilities.

The existing AI-image page remains available during the prototype so rollback is a route/configuration change. After the Agent path meets functional and quality gates, the legacy page may redirect to or be retired in favor of the Agent workflow.

### 13. Integrate DDA as a provisional resident model route

The first concrete model adapter is the locally available DDA DINOv2-L/14 LoRA detector. It runs in a separate UV-managed Python 3.11 worker through a strict versioned JSONL protocol. The worker stays resident and admits one inference at a time, while Node owns deadlines, response validation, restart, and typed degradation. It validates the configured checkpoint SHA-256 before serving and uses only configured local source, DINOv2 cache, and weights.

Live inference uses deterministic 336 by 336 resize plus CLIP normalization and never uses label-dependent evaluation preprocessing. DDA runs after the direct-evidence barrier and before multimodal assessment, unless verified strong provenance short-circuits it. Its score, official 0.5 threshold, direction, version, preprocessing, checkpoint, device, latency, and unverified deployment-calibration state enter evidence, bounded AI context, atomic claims, and the web report.

Until the production evaluation tasks pass, DDA is supporting-only. Positive and negative scores cannot independently change the provenance-first decision from `INCONCLUSIVE`; a negative score cannot prove authenticity. Worker failure does not fail the complete analysis.

### 14. Govern MIRROR and REM as passive model candidates

The model registry records paper, release, training-domain, signal, preprocessing, runtime, output, artifact, license, calibration, and production-eligibility facts without loading model code. Only code-owned adapter identifiers can execute. MIRROR's official DINOv3-H+ inference code and Phase 1/Phase 2 weights exist, but the project and checkpoint licenses were not stated as of 2026-07-30, so it remains evaluation-only and commercially blocked. REM's official repository has not released inference code or a checkpoint, so it remains unavailable. Neither candidate enters inference, fusion, AI context, or report evidence until its missing release, licensing, digest, capacity, evaluation, and calibration gates pass.

## Risks / Trade-offs

- **[Closed vendor watermarks cannot be detected locally]** -> Keep explicit unavailable adapters, rely on locally verifiable provenance and open detectors, and never reinterpret unavailable as absent.
- **[Early-exit watermark false positives have high impact]** -> Restrict short-circuiting to calibrated, scheme-specific verified results with payload or cryptographic validation and regression tests.
- **[Detector ensemble gives correlated confidence]** -> Select complementary models by measured error overlap and preserve disagreement features instead of simple voting.
- **[New generators and post-processing cause drift]** -> Maintain generator-held-out evaluations, transformation suites, shadow deployments, and versioned policy promotion.
- **[VLM explanations hallucinate or mishandle negation]** -> Build claims from evidence, use exact validators first, apply independent polarity-controlled visual checks, and fall back to templates.
- **[Three-way decisions may be less convenient than binary output]** -> Keep the authoritative three-way result and let downstream products define explicit, auditable mappings.
- **[Original media can contain sensitive data or hostile payloads]** -> Isolate parsers and model workers, limit resource use, sanitize rendered metadata, encrypt storage, and apply retention controls.
- **[Many detectors increase cost and latency]** -> Use the direct-evidence fast path and conditional cascade, with per-route budgets and timeouts.
- **[A fast watermark result races with another provenance collector]** -> Stop model scheduling but wait at a bounded strong-provenance barrier before sealing the decision.
- **[Queue retries or worker lease loss duplicate results]** -> Use at-least-once delivery, deterministic idempotency keys, evidence uniqueness constraints, and optimistic state transitions.
- **[GPU saturation causes memory failures or unfair queues]** -> Use model-aware admission, memory and slot reservations, bounded micro-batching, tenant quotas, and weighted fair scheduling.
- **[Cancellation or timeout produces late writes]** -> Seal terminal records and reject late authoritative writes while retaining operational audit events.
- **[Content-hash reuse leaks cross-tenant activity]** -> Scope computation reuse to authorized isolation boundaries and never expose cache or coalescing hits.

## Migration Plan

1. Add the independently runnable Node.js/TypeScript Agent service, embed the pinned Pi SDK with no generic or detection tools, expose session and chat APIs, and deploy the dedicated Vue Agent section through the Flask gateway.
2. Verify real Pi conversation, provider-not-configured behavior, session isolation, error handling, and browser rendering while the existing detection pages remain unchanged.
3. Add the versioned analysis contract, adapt the existing AI-image detector, and implement a minimal direct-evidence, three-way decision, explanation, and report path without fabricated evidence.
4. Establish the deployment evaluation corpus, benchmark owned detector candidates, and promote calibrated primary and complementary routes only after the accuracy gate passes.
5. Expand watermark coverage, structured explanation generation, deterministic validators, polarity-controlled visual verification, and conditional localization.
6. Add production queueing, capacity controls, security, audit, drift monitoring, concurrent load, overload, cancellation, shadow, and replay tests before production promotion.

Rollback is performed by pinning the previous policy bundle and detector registry versions. Stored runs remain readable because evidence and report payloads are versioned.

## Open Questions

- Which deployment datasets and generators define the first release acceptance gate?
- What false-positive target is required for verified-watermark early exit and model-based `AI_GENERATED` decisions?
- Which owned models qualify as primary and complementary after error-overlap evaluation?
- What asset retention period and deletion policy are required for production?
- Which open watermark detectors are mandatory for the first release versus staged additions?
- Which local VLMs will serve as visual claim verifiers, and what polarity-consistency threshold is acceptable?
- Which Pi model/provider configuration will be used for development and deployment, and how will credentials be supplied without coupling them to platform user sessions?
- What are the initial per-tenant concurrency limits, queue-age SLOs, and overload response policy?
- What GPU inventory, model-residency plan, and maximum micro-batch delay define the first capacity target?
- Is cross-request result reuse allowed within a tenant, or only original-byte deduplication?
