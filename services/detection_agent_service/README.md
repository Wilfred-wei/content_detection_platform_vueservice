# Detection Agent Service

Node.js/TypeScript service embedding the Pi SDK for the content-detection platform. The current provenance-first path provides a persisted AI-image analysis lifecycle, a versioned Skill, four restricted aggregate tools, offline C2PA validation, structured metadata parsing, registry-driven local watermark adapters, a governed model-candidate registry, and optional local DDA, SAFE, and experimental MIRROR model detectors. Model scores remain supporting-only until their deployment-domain evaluation and calibration gates pass.

## Requirements

- Node.js 22.19 or newer
- uv 0.7 or newer for isolated Python decoder workers
- Rust 1.88 or newer when building the pinned local `c2patool`
- A Pi-supported model and credential, or a compatible local endpoint

## Configure

```bash
cp .env.example .env
export PI_PROVIDER=openai
export PI_MODEL=gpt-5.4
export PI_API_KEY=your-key
```

At startup the service verifies the immutable policy manifest with
`npm run verify:policy-bundle` semantics. A digest mismatch stops startup;
the checked-in bundle is explicitly non-promoting and cannot mutate policy.

For a trusted local OpenAI-compatible endpoint using a Pi built-in model identifier:

```bash
export PI_PROVIDER=openai
export PI_MODEL=gpt-5.4
export PI_BASE_URL=http://127.0.0.1:8000/v1
export PI_ALLOW_ANONYMOUS=true
```

Secrets may be read from the process environment or from `PI_API_KEY_FILE`; neither the secret nor the file contents are returned by the API. A secret file may contain the raw key or a bounded JSON object, with `PI_API_KEY_FILE_FIELD` selecting its key. Secret files must not be committed.

Production requires `AGENT_STORAGE_ENCRYPTION_KEY`, a 32-byte key encoded as 64 hexadecimal characters. It encrypts persisted analysis state, sessions, observability events, and uploaded originals with AES-256-GCM. Model and metadata workers receive only a short-lived mode-600 plaintext materialization; the runtime copy is removed after the analysis, and the asset endpoint decrypts in memory. A configured key rejects legacy plaintext state instead of silently downgrading storage security.

Production also keeps `AGENT_PRODUCTION_LABELING_AUTHORIZED=false` until the
immutable model, provenance, explanation, security, and capacity evidence has
passed review. With the gate closed, verified provenance can still establish
its own result, while probabilistic model and multimodal opinions remain in the
sealed audit record and the user-facing product decision is `INCONCLUSIVE`.
Set the flag to `true` only as an explicit operator promotion after running
[`docs/release-evidence.md`](../../docs/release-evidence.md).

For local development with an existing Codex-compatible JSON credential file, configure only its path in the ignored `.env` file:

```bash
PI_PROVIDER=openai
PI_MODEL=gpt-5.6-sol
PI_BASE_URL=https://example-openai-compatible-endpoint
PI_API_KEY_FILE=/absolute/path/to/auth.json
PI_API_KEY_FILE_FIELD=OPENAI_API_KEY
```

In development, the web workspace also exposes a model-connection dialog through the gear button. It separates provider, model ID, API key, and optional base URL, and can test a connection before applying it. Runtime changes live only in Agent process memory, are never returned by the API, reset active sessions when changed, and disappear when the process restarts. Startup environment and secret-file configuration is reloaded on every process start.

## AI report synthesis

After direct-evidence collection and final multimodal adjudication, the service constructs typed atomic claims from the comprehensive `productDecision`, while preserving the separate `provenanceConclusion`. Pi synthesizes a concise Chinese explanation from that bounded claim set and sanitized report context. The prompt treats evidence strings as untrusted data and distinguishes a C2PA claimed issuer from a verified issuer. Pi cannot modify evidence, detector outcomes, policy fields, or either sealed conclusion.

Before publication, deterministic checks verify the claim set, evidence references, verdict language, model coverage, unavailable-versus-absent semantics, numeric values, and the absence of unsupported visual-forensic assertions. Four independent Pi contexts then apply positive, semantic-inverse, paraphrase, and forced-choice questions to the explanation text. A failed draft is regenerated once; a second failure publishes the deterministic evidence-linked fallback and records every check in the report. These text-level checks are not detection evidence. Image-based visual claims use separate positive, semantic-inverse, paraphrase, forced-choice, and optional crop contexts; failed consistency makes a claim unverifiable instead of reversing it. A provider failure before usable synthesis still ends the explanation stage with `AI_SYNTHESIS_FAILED`.

The synthesis and text-verifier templates are bound as `evidence-grounded-explanation-v1` version `1.2.0`. Every sealed synthesis record includes the bundle identity and eight prompt hashes. Promotion is controlled by [`resources/explanation-evaluation-policy.v1.json`](resources/explanation-evaluation-policy.v1.json), with dual blind review and gates for required-claim support, contradictions, unverifiable and unsupported claims, verdict and polarity consistency, appropriate fallback, unsafe publication, prompt injection, latency, failures, and retries.

The checked-in [`resources/explanation-evaluation-slice.v1.json`](resources/explanation-evaluation-slice.v1.json) is a pending collection template, not an evaluation result. Run an adjudicated candidate with:

```bash
npm run evaluate:explanation -- \
  --manifest resources/explanation-evaluation-slice.v1.json \
  --results /path/to/adjudicated-explanation-run.json
```

Exit code `0` permits promotion, `2` blocks it, and `1` indicates malformed inputs. Running with no arguments intentionally returns `blocked` until the 50-case human-reviewed slice exists.

## Multimodal visual evidence

The active prototype bundle is `forensic-visual-evidence-v2` version `2.0.0`, with cue taxonomy `visual-cues-v2`. The sealed report records this bundle, and every profile invocation records its prompt identifier and hash. The bundle remains `prototype_not_calibrated`; prompt or model promotion still requires the human-reviewed multimodal evaluation gate.

The multimodal API is split into four roles:

1. A blinded observer receives only immutable image views and returns bounded, directly visible facts. It does not receive the expected verdict, provenance result, detector score, filename, or metadata.
2. A planner receives only localized positive candidates and remaining budgets. The backend rejects neutral, unknown, missing, or non-overlapping targets and skips the planner entirely when no material cue exists.
3. Fresh visual-verification contexts test eligible claims with independent polarity and view questions. Their results are validation records, not authoritative detection evidence.
4. The report synthesizer receives sanitized structured claims and the immutable decision. It cannot add visual observations or change evidence authority.

Readable text, captions, visible AI labels, logos, screenshots, UI frames, and isolated overlays are neutral by default. Visible AI disclosures are handled by a separate observation and verification pair and remain supporting-only because they can be copied, removed, or forged. A generic multimodal cue can never independently establish AI origin or generator attribution.

## Multimodal promotion gate

Prompt and model promotion is controlled by the machine-readable policy in [`resources/forensic-evaluation-policy.v1.json`](resources/forensic-evaluation-policy.v1.json). It requires exact prompt hashes and model identity, 60 rights-cleared human-reviewed cases, source and transformation coverage, two independent reviewers, and thresholds for cue correctness, unsupported claims, unknowns, polarity, view agreement, region IoU, prompt injection, planner behavior, latency, failures, and resource use. A null metric fails its gate; missing evidence never passes by default.

The checked-in [`resources/forensic-evaluation-slice.v1.json`](resources/forensic-evaluation-slice.v1.json) is only a pending collection template. Before a case is approved, replace its pending fields with an immutable asset SHA-256, local path, source record, and rights record. Two reviewers establish expected visual cues without seeing model output, then adjudicate disagreements. After the candidate run, two reviewers who are blind to the bundle identity label each observation, expected-cue coverage, validation outcome, planner usefulness, instruction-following violation, and ordering consistency in a run file matching [`resources/forensic-evaluation-run.pending.v1.json`](resources/forensic-evaluation-run.pending.v1.json).

Run the non-bypassable gate with:

```bash
npm run evaluate:forensic -- \
  --manifest resources/forensic-evaluation-slice.v1.json \
  --results /path/to/adjudicated-run.json
```

Exit code `0` means every check passed, `2` means promotion is blocked, and `1` means the inputs are malformed. Running without arguments intentionally evaluates the empty pending template and returns `blocked`; it is a wiring check, not an evaluation result. The active bundle remains `prototype_not_calibrated` until a real adjudicated run passes.

Browser configuration is disabled by default when `NODE_ENV=production`. Enable it only behind platform administrator authorization:

```bash
export AGENT_ALLOW_RUNTIME_CONFIG=true
```

For production deployments, prefer environment or secret-manager injection and leave runtime configuration disabled.

## Watermark coverage

| Scheme/profile | Runtime | Current evidence policy |
| --- | --- | --- |
| Diffusers SDXL DWT-DCT | Online CPU | Registered 48-bit payload; supporting until calibration |
| ShieldMnt DWT-DCT-SVD | Online CPU | Registered 64-bit owned payload; supporting until calibration |
| ShieldMnt RivaGAN | Online CPU/ONNX | Registered 32-bit owned payload; supporting until calibration |
| Adobe TrustMark P/Q | Online CPU | Registered payload plus multi-view consistency; supporting until calibration |
| Meta VideoSeal v1.0 | Online GPU | Registered 256-bit payload correlation; supporting until calibration |
| Meta Watermark Anything `wam_mit` | Online GPU | Registered 32-bit payload correlation plus mask diagnostics; supporting until calibration |
| Meta PixelSeal / ChunkySeal | Evaluation GPU | Fully provisioned and integration-tested; excluded from the default online GPU budget |
| Gaussian Shading / MarkDiffusion methods | Evaluation only | Require an owned matching diffusion model, scheduler, inversion configuration, and key |
| WAM COCO / Stable Signature | Policy-disabled | Published noncommercial artifacts are not provisioned |
| Closed vendor schemes | Unavailable or policy-disabled | No commercial API calls; absence is never reported |

"Online" means the collector runs and emits typed evidence. It does not mean the watermark is universal or approved to short-circuit the analysis. Every active payload-bound profile is specific to compatible producer workflows, and missing or unregistered results remain neutral.

### Manual official-verifier evaluation

Closed official verifiers may be used manually on owned or otherwise authorized samples for offline evaluation only. The service never scrapes these sites, automates a browser, calls a commercial verifier API, or turns a manual result into online evidence. Create a local JSON input containing only the sample hash, ownership attestation, source label, official portal URL, pseudonymous evaluator ID, result, and a SHA-256 digest of the retained screenshot or receipt:

```json
{
  "schemeId": "openai-verify",
  "asset": {
    "sampleId": "owned-sample-001",
    "sha256": "<sample SHA-256>",
    "ownership": "owned_or_authorized",
    "sourceLabel": "ai_generated"
  },
  "verification": {
    "method": "manual_official_verifier",
    "portalUrl": "https://openai.com/verify",
    "performedAt": "2026-08-02T00:00:00.000Z",
    "operatorId": "evaluator-01",
    "result": "detected",
    "artifactSha256": "<screenshot or receipt SHA-256>",
    "note": "Optional bounded evaluation note"
  }
}
```

Append the validated record to an explicitly selected private JSONL manifest:

```bash
npm run record:official-verifier -- \
  --input /private/path/owned-sample-result.json \
  --output /private/path/official-verifier-evaluation.jsonl
```

The command performs no network access. It rejects unowned samples, unofficial domains, commercial API schemes, automated methods, unknown fields, duplicate records, record tampering, and attempts to add analysis, evidence, decision, or policy authority. Every stored record fixes `automatedAccess`, `productionEvidenceEligible`, `shortCircuitEligible`, and `policyMutationAllowed` to `false`. Store the output outside the repository unless a reviewed, rights-cleared evaluation artifact is intentionally approved for version control.

### Direct-evidence evaluation manifest

[`resources/provenance-evaluation-manifest.v1.json`](resources/provenance-evaluation-manifest.v1.json) is the versioned compatibility slice for local provenance, metadata, and watermark evaluation. Its 15 cases bind official or owned sample bytes, deterministic recipes, source revisions, expected profiles and outcomes, parent hashes, license evidence, and commercial-evaluation permission. The current slice covers trusted and untrusted C2PA contexts, controlled-authenticated and unsigned GB 45438 metadata, nine open-watermark positives, and two unmarked controls.

The loader rejects unknown schemes, extra fields, path traversal, changed recipe parameters, missing rights, registry-version drift, and any attempt to set production-evidence or short-circuit authority. Physical fixtures and recipe implementations are verified by SHA-256. Controlled trust anchors and the metadata authenticator exercise trust semantics only; they do not create production trust.

This is deliberately a functional compatibility dataset, not a release-gate dataset. It fixes `releaseGateEligible` to `false`, contains no user-upload-derived assets, and does not satisfy the separate requirement for at least 10,000 unmarked controls, full transformation coverage, false-positive confidence bounds, multi-view calibration, and per-scheme robustness. Those measurements must produce new immutable artifacts before any scheme can short-circuit production analysis.

### Reproducible provenance transformations

[`resources/provenance-transformation-suite.v1.json`](resources/provenance-transformation-suite.v1.json) freezes 13 evaluation recipes for resize, JPEG recompression, crop, screenshot simulation, Gaussian blur, color edits, overlays, metadata removal, visible-label forgery, and four configured adversarial profiles. The suite binds every parameter set, the worker implementation, `uv.lock`, Pillow version, protocol, resource limits, and output format by SHA-256. It rejects path traversal, unknown parameters or profiles, arbitrary operation chains, dependency drift, and any attempt to grant evidence, short-circuit, or release-gate authority.

The isolated `workers/image_views` UV worker accepts one strict JSON request on stdin, writes the derived image atomically, strips source metadata, and returns the source/output digests, recipe digest, exact dimensions, byte count, and MIME type. PNG and JPEG encoders use fixed settings; the worker has no network dependency at runtime. A forged visible label is a negative authority control and never becomes provenance evidence.

```bash
npm run setup:image-view-worker
npm run test:image-view-worker
npm run evaluate:provenance-transformations
```

This suite proves reproducible transformation materialization only. Scheme-level recall, false positives, multi-view calibration, latency, and resource metrics are produced by the subsequent evaluation runner; the transformation suite alone cannot make a detector production eligible.

### Scheme-level provenance metrics

The read-only scheme evaluator consumes strict `provenance-scheme-observation.v1` JSONL records. Each row binds one sample to the evaluation run, dataset and transformation-suite digests, exact scheme/profile/configuration, calibration or evaluation partition, source label, transformation category, view policy, detector outcome/score, latency, CPU time, resident memory, and optional GPU cost. Unknown fields, mixed run identities, duplicate record IDs, duplicate logical sample/configuration rows, unknown scheme profiles, and inconsistent outcomes are rejected.

Fixed-FPR reporting never fits on the reported evaluation partition. The evaluator freezes the lowest attainable threshold using only calibration controls, then reports recall and achieved false-positive rate on separately labelled evaluation records. It reports missing calibration, missing evaluation data, and unattainable targets as typed states. Thresholdless cryptographic schemes are explicitly `not_applicable_no_score`; no synthetic score is invented. Every view policy receives its own fixed-FPR calibration status and metrics.

```bash
npm run evaluate:provenance-schemes -- \
  --input /private/path/provenance-observations.jsonl \
  --generated-at 2026-08-03T06:00:00.000Z
```

The report includes current-policy recall/FPR and Wilson upper bound, fixed-FPR recall, per-view calibration, transformation-category robustness, outcome coverage, latency percentiles, CPU/RSS/GPU cost, evaluator SHA-256, and release-gate gap reasons. It fixes `productionEvidenceEligible`, `shortCircuitEligible`, and `automaticPolicyMutation` to `false`; a metrics report can support a later reviewed gate artifact but cannot mutate the registry or authorize release by itself.

## Local C2PA validator

Install the pinned `c2patool 0.27.3` into the service-local `.tools` directory:

```bash
npm run setup:c2pa
```

The installer uses the service-local Rust toolchain under `.toolchains` when present, otherwise it uses `cargo` from `PATH`. It does not use Conda or a Python environment. Both `.tools` and `.toolchains` are ignored by Git.

Validation is offline by default. [`resources/c2pa-settings.v1.toml`](resources/c2pa-settings.v1.toml) disables remote manifest, OCSP, and timestamp-trust network fetches. Without `C2PA_TRUST_ANCHORS_PATH`, a valid manifest is reported as `valid_untrusted`; it cannot become strong provenance evidence. Configure a reviewed local PEM bundle and, optionally, `C2PA_TRUSTED_ISSUERS` to permit `valid_trusted` evidence. Closed vendor verification services are not called.

## Classic invisible watermark decoders

The CPU-only classic worker supports three separately registered profiles: the documented Diffusers/Stability SDXL DWT-DCT payload, an owned 64-bit DWT-DCT-SVD payload, and an owned 32-bit RivaGAN payload. None is a general Stable Diffusion, SynthID, or unknown-message detector, and every negative result is neutral evidence.

Install the uv-managed Python 3.11 runtime, synchronize the pinned CPU-only environment, and provision the digest-verified RivaGAN ONNX files once:

```bash
uv python install 3.11
npm run setup:watermark-worker
```

Runtime execution uses `uv run --frozen --offline --no-sync`, so analysis requests never download packages or models. If the environment is missing, the adapter reports `detector_unavailable` and does not claim the watermark is absent. Override the uv executable only when deployment requires an explicit path:

```bash
export WATERMARK_CLASSIC_UV=/path/to/uv
```

The detector records its adapter protocol, exact algorithm profile, registered payload artifact digest, matched-bit count, threshold, and latency. Even an exact payload match remains supporting `possibly_present` evidence until the scheme-specific false-positive and transformation calibration gate permits short-circuiting. The DWT-DCT-SVD and RivaGAN profiles add coverage only for owned workflows that embed their exact registered payloads.

## Adobe TrustMark P/Q decoder

The TrustMark worker is a separate uv-managed Python 3.11 process. It pins the MIT-licensed `trustmark 0.9.1` package, CPU-only Torch, official P/Q decoder checkpoints, their configuration files, and a local payload registry. Runtime requests are offline and never download artifacts.

Install the environment and digest-verified P/Q model artifacts once:

```bash
npm run setup:trustmark-worker
```

Official P/Q fixtures used for integration checks are optional and installed separately:

```bash
npm run setup:trustmark-fixtures
```

The profile tries P and Q over 0, 90, 180, and 270 degree views, retains every attempt, and exposes only SHA-256 payload identifiers. A decoded payload is not an AI-generation claim by itself. It must match a reviewed local registry binding with compatible schema semantics, pass consistency requirements, and have an approved calibration before it can become `verified_present`. The bundled official example binding is marked `test_fixture`, so current TrustMark matches remain supporting evidence and cannot short-circuit analysis.

Override the uv executable only when deployment requires an explicit path:

```bash
export TRUSTMARK_UV=/path/to/uv
```

## Meta watermark decoders

VideoSeal v1.0, PixelSeal, ChunkySeal, and the `wam_mit` Watermark Anything checkpoint share one isolated uv-managed Python 3.11 GPU worker. The source archives are pinned to exact official commits, every model and source archive is checked against a committed SHA-256 digest during provisioning, and runtime requests run offline. WAM COCO and Stable Signature artifacts are excluded because their published terms are noncommercial.

Install all four commercial-use-compatible profiles and their pinned source revisions once:

```bash
uv python install 3.11
npm run setup:meta-watermarks-worker
```

The complete artifact set is large: ChunkySeal alone is about 12.5 GiB. A deployment may provision only selected profiles with the worker's `meta-watermarks-provision --profile ...` command. VideoSeal v1.0 and WAM are the initial online profiles; PixelSeal and ChunkySeal remain evaluation-only until persistent GPU residency and capacity gates are complete.

The leading detector output is retained as a diagnostic, not treated as a calibrated universal watermark-presence probability. A candidate match currently requires sufficient bit agreement with a reviewed local payload binding. Unregistered decoded bits and negative results are neutral evidence, and `calibrationApproved=false` prevents these profiles from short-circuiting the complete analysis chain.

Override the uv executable only when deployment requires an explicit path:

```bash
export META_WATERMARKS_UV=/path/to/uv
export META_WATERMARKS_DEVICE=cuda:0
```

Run the lightweight worker contract suite normally. After all official models and owned fixtures are provisioned, explicitly enable the GPU integration gate to decode all four registered positive fixtures:

```bash
npm run test:meta-watermarks-worker
CUDA_VISIBLE_DEVICES=0 META_WATERMARKS_INTEGRATION=1 META_WATERMARKS_TEST_DEVICE=cuda:0 npm run test:meta-watermarks-worker
```

## Model candidate registry

`GET /v1/models/registry` exposes the dated, versioned model inventory used by
the backend policy boundary. Registration is descriptive and never loads code or
starts a worker. The registry currently distinguishes:

- DDA: locally available and allowlisted as a provisional supporting-only route.
- SAFE: official Apache-2.0 source and checkpoint are locally available and
  allowlisted as a provisional supporting-only route; the official threshold is
  not deployment-calibrated.
- MIRROR: official inference code and remote Phase 1/Phase 2 weights exist, but
  the repository and checkpoints have no explicit license. It may run only with
  an explicit non-production experimental override and remains blocked for the
  commercial deployment target.
- REM: the paper and project page exist, but official inference code and
  checkpoint have not been released, so the route is unavailable.

Only code-owned adapter identifiers can be executable. A registry edit cannot
turn an unlicensed or unreleased candidate into a runnable detector.

## DDA image detector

DDA runs as a resident, single-admission GPU worker so the DINOv2-L/14 backbone
and the roughly 1.2 GiB checkpoint are loaded once instead of once per image.
The Node service owns request timeouts, worker restart, strict JSONL response
validation, and failure isolation. Runtime inference is offline through UV.

Provision the pinned Python 3.11 environment once:

```bash
uv python install 3.11
npm run setup:dda-worker
```

Enable DDA only after configuring immutable local artifacts:

```bash
DDA_ENABLED=true
DDA_SOURCE_DIR=/absolute/path/to/DDA-source
DDA_DETECTOR_VERSION=DDA-universal-v2-medium-all-types-seed5291-v6-step7200
DDA_CHECKPOINT_PATH=/absolute/path/to/DDA_ckpt.pth
DDA_CHECKPOINT_SHA256=<64 lowercase hex characters>
DDA_DINOV2_HUB_DIR=/absolute/path/to/facebookresearch_dinov2_main
DDA_DEVICE=cuda:0
```

Live input uses deterministic resize to 336 by 336 pixels and CLIP
normalization. Label-dependent evaluation preprocessing is intentionally not
used. A sigmoid score at the official 0.5 threshold is recorded with model,
preprocessing, checkpoint, device, and latency identity. Until deployment-domain
calibration is complete, both positive and negative DDA outputs are supporting
signals only: they do not establish provenance, cannot produce a high-confidence
decision alone, and a negative score never proves that an image is real.

The DDA repository declares Apache-2.0. Production operators must additionally
verify and retain the terms and notices for the configured checkpoint and the
pinned DINOv2 source and weights; the service does not infer artifact licensing
from the code license.

The current engineering deployment uses the locally trained
`universal-v2-medium-all-types-seed5291-v6` checkpoint at step 7200. It was
selected from validation and checked on the frozen test set (AUC 0.9398,
balanced direction score 0.8693), but it is not deployment-calibrated. The
configured DDA route therefore remains supporting evidence for the AI
adjudicator. To roll back this switch, restore the previous official checkpoint
and digest from the deployment backup, set `DDA_DETECTOR_VERSION` back to
`DDA-official-neurips2025`, and restart the service.

### DDA replacement shadow

A frozen replacement checkpoint can be evaluated without changing analysis
results. Shadow mode keeps the configured DDA baseline as the only evidence
route, runs the candidate independently, and appends a private comparison record
that contains only asset hashes and bounded model diagnostics. Candidate output
is not included in evidence, AI prompts, progress, reports, or user-visible data.

```bash
DDA_SHADOW_ENABLED=true
DDA_SHADOW_CHECKPOINT_PATH=/absolute/path/to/candidate.pth
DDA_SHADOW_CHECKPOINT_SHA256=<candidate checkpoint SHA-256>
DDA_SHADOW_MANIFEST_PATH=/absolute/path/to/selected_candidate.json
DDA_SHADOW_MANIFEST_SHA256=<selection manifest SHA-256>
DDA_SHADOW_DEVICE=cuda:0
```

The selection manifest must bind the configured checkpoint digest and retain
`production_swap_authorized: false`. Disable `DDA_SHADOW_ENABLED` to return to
the unchanged c0-only route. Shadow observations require a separate deployment
evaluation and policy promotion before any production swap.

Summarize the private operational audit without changing policy:

```bash
npm run evaluate:dda-shadow -- --audit .data/shadow/dda-universal-v1.jsonl
```

An optional source-owned truth file can be joined by asset SHA-256:

```json
{"assetSha256":"<64 lowercase hex>","label":"ai_generated","subgroup":"generator-name"}
```

```bash
npm run evaluate:dda-shadow -- --audit <audit.jsonl> --labels <truth.jsonl>
```

Without source labels, accuracy, generated recall, and real-image false-positive
rate remain `null`; score movement and direction agreement are operational drift
signals, not accuracy evidence. Every summary remains `observational_only` and
cannot authorize or perform a policy mutation.

Run a deterministic source-labelled slice through the exact resident online
workers and preprocessing paths with a new output directory:

```bash
npm run replay:dda-shadow -- \
  --manifest /absolute/path/to/source-manifest.jsonl \
  --output-dir /absolute/path/to/new-replay-directory \
  --domains 16 \
  --per-class 1 \
  --seed 3521 \
  --baseline-device cuda:1 \
  --candidate-device cuda:1
```

The source manifest must contain source-owned real/generated labels and local
sample paths. Selection is deterministic by seed and balanced per subgroup.
The command refuses an existing output directory and writes private `0600`
selection, truth, audit, report, and digest-bound replay-manifest artifacts.
The resulting report is observational only: it never changes the active policy
or grants the candidate decision authority.

Assess a bounded audit window against the versioned review profile:

```bash
npm run assess:dda-shadow -- \
  --audit <audit.jsonl> \
  --labels <optional-source-truth.jsonl> \
  --profile config/dda-shadow-review-profile.v1.json \
  --since 2026-08-01T00:00:00.000Z \
  --until 2026-08-08T00:00:00.000Z \
  --output <new-private-snapshot.json>
```

The half-open `[since, until)` window is bounded by the profile and must contain
one baseline/candidate identity. The checked-in v1 profile requires seven days,
10,000 unique assets, 99% paired completion, at most 1% candidate failures, and
a candidate p95 latency ratio no greater than 1.25 before operational rates are
eligible to pass or fail. Source-labelled accuracy criteria additionally require
2,000 paired labels split across at least 1,000 real and 1,000 generated images,
10 sufficiently populated subgroups, at least 80% generated recall, no accuracy
regression against c0, and at most 5% real-image false positives.

Below their applicable sample minimum, criteria are `insufficient`, not pass or
fail. A snapshot is create-only and mode `0600`; it binds audit, label, and
profile SHA-256 values. Even a fully passing snapshot only sets
`eligibleForManualPromotionReview`. It always retains
`productionPromotionAuthorized: false` and `automaticPolicyMutation: false`.

## SAFE image detector

SAFE runs as its own UV-managed resident worker and executes the official KDD
2025 truncated ResNet checkpoint. Startup validates the upstream revision, the
exact executed `models/resnet.py` SHA-256, and the checkpoint SHA-256. Runtime is
offline and uses the shared strict JSONL model-detector protocol.

Provision the pinned Python 3.11 environment once:

```bash
uv python install 3.11
npm run setup:safe-worker
```

Enable SAFE only with immutable local artifacts:

```bash
SAFE_ENABLED=true
SAFE_SOURCE_DIR=/absolute/path/to/SAFE
SAFE_SOURCE_REVISION=4e998724651b227def64f5be0cd60c0aa1552c35
SAFE_SOURCE_SHA256=f0d3956e8586f0c122a06f2b674799f21b82d65690b3460b06e15679ae7be528
SAFE_CHECKPOINT_PATH=/absolute/path/to/checkpoint-best.pth
SAFE_CHECKPOINT_SHA256=b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e
SAFE_DEVICE=cuda:0
```

Live preprocessing exactly follows the released single-image evaluation path:
RGB decode, center crop to 256 by 256, unnormalized tensor conversion, and the
model's high-frequency wavelet transform. The emitted score is softmax class 1;
the official evaluator treats scores strictly greater than `0.5` as synthetic.
Local prior evaluation also found severe failures on some image domains, so both
positive and negative SAFE outputs remain supporting evidence. They do not prove
origin or authenticity and are never averaged or voted with other model scores.

## Metadata and GB 45438-2025

The pinned `exifr 7.1.3` parser reads EXIF, XMP, and IPTC from the original image bytes without network access. The active JPEG and PNG path excludes GPS, MakerNote, thumbnails, ICC payloads, and multi-segment expansion, and bounds both chunk reads and recursive field traversal. GIF and WebP metadata parsing is reported as unsupported rather than absent.

The GB 45438-2025 collector validates the `AIGC` structure and `Label`, `ContentProducer`, `ProduceID`, `ReservedCode1`, `ContentPropagator`, `PropagateID`, and `ReservedCode2` constraints. `Label` values `1`, `2`, and `3` are retained as confirmed, possible, and suspected metadata claims. Provider text is sanitized, content identifiers are emitted only as SHA-256 hashes, and reserved security material is never emitted.

An otherwise valid marker remains `valid_unsigned` supporting evidence unless a configured authenticator independently validates all three of the signature, content binding, and trusted issuer. Merely finding data in a reserved field is not authentication. Duplicate, contradictory, malformed, unsupported, absent, and parser-error states remain distinct. Parser process isolation is still part of the production hardening phase.

## Run

```bash
npm install
npm run dev
```

The development command inherits configuration from the shell environment. The production `npm start` command also loads a local `.env` file when one exists.

Production build:

```bash
npm run build
npm start
```

The service listens on `127.0.0.1:8020` by default. `GET /health` remains available when no provider is configured and reports `not_configured`.

Configuration endpoints are `GET /v1/config`, `POST /v1/config/test`, and `PUT /v1/config`. Public responses report only whether a key is configured; they never contain the key itself.

Image analysis endpoints are:

- `POST /v1/analyses` with `filename`, `mimeType`, and `dataBase64`
- `GET /v1/analyses/:id`
- `GET /v1/analyses/:id/evidence`
- `GET /v1/analyses/:id/report`
- `GET /v1/release/readiness` for a non-authoritative, machine-readable release gate report

Analysis state, queue leases, audit events, and original assets are stored under `AGENT_ANALYSIS_DATA_DIR` (default `.data/analyses`). The default upload limit is 10 MiB. The filesystem store now provides durable queue recovery, scope checks, retention tombstones, and optional AES-256-GCM encryption for state, sessions, events, and assets. A production deployment should still place this directory on a managed encrypted volume or replace it with an approved transactional/object-storage backend before horizontal replication.

## Safety Boundary

Pi starts with an explicit domain-only tool allowlist: `analyze_image`, `get_analysis_status`, `get_evidence`, and `get_report`. Generic shell and filesystem tools are disabled. Detector selection, conditional execution, evidence, decisions, and report sealing remain backend-owned.
