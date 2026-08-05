## ADDED Requirements

### Requirement: Register provenance detectors explicitly
The system SHALL maintain a versioned registry describing each detector's scheme, supported formats, required resources, result semantics, calibration, runtime class, and short-circuit eligibility.

#### Scenario: Detector is added
- **WHEN** an operator registers a new watermark detector
- **THEN** the detector cannot run until its positive, negative, unavailable, and error semantics and policy metadata are defined

### Requirement: Collect layered provenance signals
The system SHALL support collectors for C2PA, standard AIGC metadata, EXIF/XMP, visible marks, and pluggable invisible watermark schemes.

#### Scenario: Image enters direct evidence scan
- **WHEN** intake completes successfully
- **THEN** all enabled compatible low-cost provenance collectors run and produce typed evidence records

### Requirement: Short-circuit only on verified AI provenance
The system SHALL skip model inference only when a registered detector returns a scheme-specific `verified_present` result and the active policy permits that detector version to establish AI origin.

#### Scenario: Trusted watermark is verified
- **WHEN** message, key, error-correction, signature, or equivalent scheme validation succeeds above the calibrated threshold
- **THEN** the system records verified AI provenance and proceeds directly to decision and deterministic reporting

#### Scenario: Visible label is detected
- **WHEN** OCR or logo matching finds a visible AI label without a cryptographically or statistically verified scheme
- **THEN** the system records supporting evidence and continues to model detection

### Requirement: Preserve non-equivalent negative states
The system SHALL distinguish `not_detected`, `detector_unavailable`, `unsupported_format`, `error`, and `possibly_present` and SHALL NOT convert any of them into proof of non-AI origin.

#### Scenario: Closed vendor detector is unavailable
- **WHEN** an image may contain a vendor watermark for which no authorized local detector exists
- **THEN** the report states that the detector is unavailable rather than that the watermark is absent

### Requirement: Calibrate multi-view watermark searches
The system SHALL calibrate thresholds and false-positive rates for the complete set of transformations and crops used by a watermark detector.

#### Scenario: Detector scans multiple derived views
- **WHEN** the same scheme is tested across resized, color-converted, or cropped views
- **THEN** the final result uses a multi-view calibrated policy and retains every attempted view in the audit record

### Requirement: Isolate and pin open-source neural watermark decoders
The system SHALL run VideoSeal v1.0, PixelSeal, ChunkySeal, and the MIT `wam_mit` profile through an offline UV-managed worker contract with an exact source revision, checkpoint digest, bounded image input, timeout, GPU device policy, and scheme-specific payload width.

#### Scenario: Meta checkpoint is not provisioned
- **WHEN** an enabled Meta profile cannot verify its exact local checkpoint or source revision
- **THEN** it returns `detector_unavailable` without downloading code or weights during the analysis request

#### Scenario: Decoder returns bits without a trusted binding
- **WHEN** a Meta decoder finds a candidate watermark but the decoded payload is not bound to an approved origin claim
- **THEN** the decoded value is retained only as bounded diagnostics, the evidence result remains neutral, and it cannot short-circuit model detection

#### Scenario: Noncommercial Meta artifact is registered
- **WHEN** the WAM COCO checkpoint or Stable Signature artifact is evaluated for production execution
- **THEN** registry validation keeps it non-runnable regardless of technical compatibility

### Requirement: Bind classic open-source decoders to registered payloads
The system SHALL run DWT-DCT-SVD and RivaGAN only with an exact registered payload profile, pinned dependencies, offline runtime, bounded input, and typed result semantics.

#### Scenario: Classic decoder finds an unknown payload
- **WHEN** a classic decoder produces bits that do not meet the high-match threshold for its registered payload
- **THEN** the result remains neutral and does not imply either AI or non-AI origin

#### Scenario: Generator-coupled research watermark lacks deployment material
- **WHEN** a scheme such as Gaussian Shading lacks the matching registered diffusion model, scheduler, inversion configuration, or secret key
- **THEN** the scheme remains evaluation-only and is not scheduled as a generic upload detector

### Requirement: Coordinate concurrent strong-provenance collectors
The system SHALL wait at a bounded provenance completion barrier for every scheduled strong-provenance collector to complete, fail, or reach its recorded deadline before sealing an early-exit decision.

#### Scenario: Verified watermark arrives before another strong collector
- **WHEN** one collector returns `verified_present` while another scheduled strong-provenance collector is still running
- **THEN** the system stops unscheduled model work but waits for the remaining strong collector before checking conflicts and sealing the decision

#### Scenario: Strong collector reaches its deadline
- **WHEN** a scheduled strong-provenance collector does not finish within the barrier deadline
- **THEN** the system records its timeout and applies the versioned decision policy without waiting indefinitely
