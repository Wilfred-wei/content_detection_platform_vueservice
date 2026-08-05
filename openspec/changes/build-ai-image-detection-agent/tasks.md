## 1. Phase One - Deployable Pi Agent Service

- [x] 1.1 Add `services/detection_agent_service` with an independent Node.js/TypeScript package, configuration, health endpoint, and test command
- [x] 1.2 Pin the official Pi SDK and document provider, model, API-key, and optional local-endpoint configuration without committing credentials
- [x] 1.3 Create a restricted Pi session with no generic coding tools and no image-detection tools in the first milestone
- [x] 1.4 Implement isolated conversation sessions, message submission, assistant event capture, cancellation, and bounded in-memory retention for the prototype
- [x] 1.5 Expose versioned health, capability, session, message, and session-history APIs with typed ready, not-configured, busy, and failed responses
- [x] 1.6 Add a system policy that identifies the Agent's scope, reports unconfigured detection honestly, and prohibits invented scores, evidence, or decisions
- [x] 1.7 Add unit and API tests for configuration, session isolation, tool allowlisting, provider-not-configured behavior, message errors, and cancellation
- [x] 1.8 Add service startup documentation and a production build command suitable for an independent process or container

## 2. Phase One - Platform and Web Prototype

- [x] 2.1 Register the Agent service in Flask gateway configuration and proxy health, capability, session, message, history, and cancellation routes without changing existing detection routes
- [x] 2.2 Add a typed frontend Agent API client that communicates only through the platform gateway
- [x] 2.3 Add a dedicated `Detection Agent` sidebar entry and `/detection-agent/` route while retaining the existing AI-image page
- [x] 2.4 Build a responsive Pi conversation workspace with connection status, session reset, message history, composer, send, busy, retry, and error states
- [x] 2.5 Render backend-derived Pi events or message progress without fabricated percentages or hidden chain-of-thought content
- [x] 2.6 Display AI-image detection as explicitly not configured and provide no upload, score, evidence, or detection-result controls in this milestone
- [x] 2.7 Add gateway contract, frontend unit, and browser end-to-end tests for ready and not-configured states, successful chat, failure, retry, route navigation, and legacy-page preservation
- [x] 2.8 Run a local smoke demonstration from the web page through the gateway to the Pi service and record the provider configuration needed for real conversation

## 3. Phase Two - AI Image Detection Walking Skeleton

- [x] 3.1 Define versioned schemas for MediaAsset, AnalysisRun, EvidenceRecord, DecisionRecord, ValidationRecord, progress events, and Report
- [x] 3.2 Implement persisted analysis identities, idempotent submission, real lifecycle transitions, typed failures, status, cancellation, evidence, and report APIs
- [x] 3.3 Register restricted Pi domain tools for `analyze_image`, `get_analysis_status`, `get_evidence`, and `get_report`
- [x] 3.4 Implement an adapter for the existing `ai_detection_service` and normalize its prediction, score, model version, and optional heatmap as typed evidence
- [x] 3.4a Implement the local DDA route as a UV-managed resident worker with a strict versioned adapter, fixed live preprocessing, checkpoint digest, supporting-only evidence, AI-context inclusion, web score reporting, timeout/restart handling, and failure isolation
- [x] 3.5 Implement original-byte hashing, safe image facts, EXIF/XMP indicators, and explicit detected, not-detected, unavailable, unsupported, and error semantics
- [x] 3.6 Implement deterministic three-way prototype decisioning with missing-evidence neutrality and adapter-failure handling
- [x] 3.7 Implement evidence-linked deterministic explanations and exact checks for verdict, score, model, metadata, and evidence-reference consistency
- [x] 3.7a Require Pi-based AI comprehensive analysis after deterministic decisioning, constrain it to sanitized structured evidence, record provider/model identity, and fail explicitly when synthesis is unavailable
- [x] 3.8 Add Agent image endpoints and Flask gateway routes while preventing browser-to-model-worker calls
- [x] 3.9 Extend the Agent page with image selection, preview, submission, backend-derived progress, retry, and stable responsive states
- [x] 3.10 Render decision basis, confidence band, evidence groups, coverage, explanation validation status, limitations, and typed failures
- [x] 3.11 Add unit, contract, adapter integration, and browser end-to-end tests for the complete image-analysis walking skeleton
- [x] 3.12 Run a local upload-to-report smoke demonstration and document prototype limitations

## 4. Phase Three - Evaluation and Accuracy Baseline

- [ ] 4.1 Build a versioned dataset manifest covering real-image domains, owned AI generators, held-out generators, and licensing or provenance metadata
- [x] 4.2 Build reproducible transformations for resize, recompression, crop, screenshot, blur, color edits, overlays, and configured adversarial cases
- [x] 4.3 Implement metric reporting for fixed-FPR recall, false-positive rate, calibration, abstention, subgroup results, latency, and resource cost
- [x] 4.4 Register owned detector candidates with training domains, signal family, preprocessing, runtime cost, output schema, and calibration artifacts
- [x] 4.4a Register DDA provisionally with the official threshold and explicit unverified deployment calibration while leaving complete candidate evaluation and production promotion open
- [x] 4.4b Register MIRROR and REM as passive researched candidates and prevent MIRROR's unverified license or REM's unreleased artifacts from creating runnable adapters
- [ ] 4.5 Evaluate candidates, pairwise error overlap, out-of-distribution behavior, and transformation robustness
- [x] 4.6 Select and document the primary detector, complementary pool, escalation margins, fusion policy, and release acceptance thresholds (the current bundle is provisional and remains non-promotable until deployment calibration passes)
- [x] 4.7 Implement the staged primary and complementary detector cascade with calibrated evidence and preserved disagreement (uncalibrated routes escalate conservatively and preserve disagreement)
- [x] 4.8 Implement deterministic evidence precedence, conflict handling, policy replay, and golden tests for missing, conflicting, failed, and uncertain combinations
- [x] 4.9 Establish the production accuracy gate and block production labeling until the complete decision policy passes it (the current gate is intentionally closed)

## 5. Phase Four - Provenance and Watermark Expansion

- [x] 5.1 Implement the versioned provenance and watermark registry with scheme semantics, compatibility, resources, calibration, runtime class, and short-circuit eligibility
- [x] 5.2 Integrate C2PA validation and GB 45438-2025 AIGC metadata parsing with distinct valid, invalid, absent, unsupported, unavailable, and error outcomes
- [x] 5.3 Implement bounded multimodal visible-mark text/logo observation with supporting-only strength (the VLM task reads only legible visible disclosures and never treats them as verified provenance)
- [x] 5.4 Integrate and evaluate supported local Stability watermark detector versions (the pinned invisible-watermark-compatible worker and six offline tests pass; deployment calibration and release-gate approval remain separate)
- [x] 5.4a Integrate registered DWT-DCT-SVD and RivaGAN profiles with a pinned offline worker, exact payloads, digest-verified ONNX artifacts, and owned positive controls
- [x] 5.5 Integrate and evaluate TrustMark decoding, payload validation, and calibrated multi-view handling (P/Q rotation worker and seven offline tests pass; the official fixture remains supporting-only until multi-view calibration is approved)
- [x] 5.6 Integrate the selected Meta open-source watermark detectors and preserve WAM localization diagnostics for later conditional localization
- [x] 5.6a Pin commercial-use eligibility and exact official sources for VideoSeal v1.0, PixelSeal, ChunkySeal, and `wam_mit`, while prohibiting WAM COCO and Stable Signature artifacts
- [x] 5.6b Implement one UV-managed offline GPU worker protocol for all four approved Meta profiles with bounded inputs, verified pre-provisioned artifacts, typed outcomes, and serialized resource admission
- [x] 5.6c Add positive owned fixtures, unmarked controls, payload-binding checks, WAM mask diagnostics, and per-profile GPU smoke tests
- [x] 5.7 Add explicit unavailable adapters for closed vendor schemes so unsupported detection is never reported as absence
- [x] 5.8 Implement direct-evidence routing, the bounded strong-provenance completion barrier, conflict checks, and model cancellation
- [x] 5.9 Run unmarked-control, transformation-robustness, false-positive, completion-order, and early-exit acceptance tests for every short-circuit detector (the registry-derived contract matrix covers all 7 candidates x 9 scenarios; real worker observations and release calibration remain separately gated)

## 6. Phase Four - Explanation Verification and Conditional Localization

- [x] 6.1 Implement atomic claim construction with evidence references, claim types, and materiality constraints before prose rendering
- [x] 6.2 Implement prose rendering restricted to structured claims and deterministic templates for provenance, inconclusive, and fallback outcomes
- [x] 6.3 Implement exact validators for scores, thresholds, metadata, provenance, detector status, evidence references, and final-verdict consistency
- [x] 6.4 Implement independent positive, semantic-inverse, paraphrase, forced-choice, and optional crop questions for eligible visual claims
- [x] 6.5 Implement polarity and view-consistency evaluation with supported, contradicted, and unverifiable outcomes
- [x] 6.6 Enforce one regeneration attempt followed by deterministic fallback and add adversarial explanation regression cases
- [x] 6.7 Add conditional localization routing and enforce that localization artifacts cannot independently establish the decision
- [ ] 6.8 Build a human-reviewed explanation evaluation set and establish publication acceptance thresholds

## 7. Phase Five - Durable Concurrency and Operations

- [x] 7.1 Implement durable at-least-once work queues, leases, deterministic idempotency keys, evidence uniqueness, and optimistic state-version transitions
- [x] 7.2 Implement bounded per-scope admission, queue limits, maximum queue age, weighted fairness, explicit overload outcomes, and cancellation
- [x] 7.3 Implement order-independent collector and complementary-detector fan-out with completion, failure, and timeout barriers
- [x] 7.4 Implement model-specific GPU queues, model residency, device compatibility, memory and slot admission, and bounded micro-batching (DDA, SAFE, and MIRROR workers now support bounded batch envelopes; keep runtime defaults at microbatch 1 until deployment-GPU benchmarks pass)
- [x] 7.5 Seal terminal decisions and reports and reject lease-lost, cancelled, timed-out, and late authoritative writes
- [x] 7.6 Implement immutable original and derived-view storage, retention, authorized deletion, audit-safe tombstones, and tenant-isolated reuse
- [x] 7.7 Add authorization, upload throttling, parser isolation, resource limits, secret handling, encryption, and metadata output sanitization
- [x] 7.8 Add structured observability for queue, worker, GPU, stage, route, detector, decision, explanation, and fallback behavior
- [x] 7.9 Implement persisted monotonic progress events, cursor reconnect, multi-client observation, machine-readable export, and replayable audit views

## 8. Phase Five - Production Release Gates

- [x] 8.1 Define capacity targets for per-tenant concurrency, queue age, throughput, GPU saturation, and end-to-end latency
- [x] 8.2 Run concurrent load and overload tests covering fairness, backpressure, batching, provenance barriers, and decision determinism
- [x] 8.3 Run failure-injection tests for duplicate delivery, lease loss, retries, cancellation, late results, reconnect, and worker crashes
- [ ] 8.4 Run full policy evaluation, explanation evaluation, security, replay, retention, deletion, and cross-tenant isolation tests
- [x] 8.5 Add production drift monitors without automatic policy mutation and define investigation and shadow-evaluation triggers
- [ ] 8.6 Deploy direct-evidence and model routes in shadow mode and compare replayed outcomes with the acceptance gates
- [ ] 8.7 Promote an immutable initial policy bundle, document capacity alarms and rollback, and publish the operational runbook
- [ ] 8.8 Migrate the legacy AI-image page only after Agent functional, accuracy, capacity, and rollback gates pass
