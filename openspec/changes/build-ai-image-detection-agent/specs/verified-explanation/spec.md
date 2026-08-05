## ADDED Requirements

### Requirement: Build explanations from atomic evidence claims
The system SHALL construct atomic claims with claim type, materiality, and evidence references before rendering natural-language explanation text.

#### Scenario: Model-based decision is explained
- **WHEN** an analysis reaches a model-inference decision
- **THEN** every material explanation statement is derived from one or more stored evidence records

### Requirement: Use deterministic explanations for verified provenance
The system SHALL render verified-provenance decisions from controlled templates without requiring free-form multimodal generation.

#### Scenario: Watermark fast path completes
- **WHEN** a registered watermark establishes AI origin
- **THEN** the explanation identifies the verified scheme and validation status without introducing unrelated visual claims

### Requirement: Verify exact and logical claims
The system SHALL verify numeric, metadata, provenance, detector, and verdict claims against their authoritative structured records.

#### Scenario: Explanation changes a detector score
- **WHEN** rendered text contains a score or threshold that differs from its evidence record
- **THEN** verification marks the claim contradicted and blocks publication

#### Scenario: Explanation contradicts the decision
- **WHEN** explanation language implies a different class from the authoritative decision
- **THEN** verdict-consistency verification fails and blocks publication

### Requirement: Apply polarity-controlled visual verification
The system SHALL verify material visual claims using independent positive, semantic-inverse, paraphrased, and forced-choice questions, with optional crop repetition and an `unknown` outcome.

#### Scenario: Positive and inverse answers conflict logically
- **WHEN** a verifier gives answers that cannot both be true for a question pair
- **THEN** the claim is marked unverifiable rather than having its truth value inverted

#### Scenario: Visual claim is consistently grounded
- **WHEN** required question variants and image views satisfy the configured consistency policy
- **THEN** the claim may be marked supported with all verifier records attached

### Requirement: Prevent unsupported forensic claims
The system SHALL omit detector-specific forensic or localization assertions unless the corresponding detector produced evidence supporting them.

#### Scenario: Classifier score is high without localization
- **WHEN** no evidence identifies a specific anomalous region or artifact
- **THEN** the explanation does not invent visual defects, manipulated regions, or generator attribution

### Requirement: Fall back after failed verification
The system SHALL allow at most one explanation regeneration attempt and SHALL use a verified deterministic template or an explicit explanation-unavailable state after repeated failure.

#### Scenario: Regenerated explanation still fails
- **WHEN** a material claim remains contradicted or unverifiable after the retry
- **THEN** the system suppresses free-form text and publishes only the permitted fallback content
