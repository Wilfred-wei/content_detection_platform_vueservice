## ADDED Requirements

### Requirement: Store typed immutable evidence
The system SHALL record every result with producer version, subject asset or view, semantics, strength, payload version, timestamp, and artifact references.

#### Scenario: Evidence is consumed by a decision
- **WHEN** the policy engine evaluates an analysis
- **THEN** every input can be resolved to an immutable evidence record and exact producer configuration

### Requirement: Produce an authoritative three-way decision
The system SHALL produce exactly one of `AI_GENERATED`, `LIKELY_NON_AI`, or `INCONCLUSIVE` together with decision basis, confidence band, conflicts, evidence references, and policy version.

#### Scenario: Evidence is insufficient
- **WHEN** available evidence cannot meet either decision threshold or required detectors failed
- **THEN** the authoritative decision is `INCONCLUSIVE`

### Requirement: Apply deterministic evidence precedence
The system SHALL apply versioned deterministic rules in which verified AI provenance can establish `AI_GENERATED`, missing provenance is neutral, and model inference is used only when direct evidence does not settle the case.

#### Scenario: Verified AI provenance exists
- **WHEN** direct evidence satisfies short-circuit policy
- **THEN** the decision is `AI_GENERATED` with basis `VERIFIED_PROVENANCE` and model inference is omitted

#### Scenario: No watermark is detected
- **WHEN** all executed watermark detectors return `not_detected`
- **THEN** the policy assigns no negative AI evidence solely from those results

### Requirement: Surface evidence conflicts
The system SHALL detect policy-defined conflicts among provenance, metadata, and model evidence and SHALL preserve them in the decision record.

#### Scenario: Trusted provenance signals conflict
- **WHEN** two verified provenance records imply incompatible origins
- **THEN** the system returns `INCONCLUSIVE` unless a versioned conflict rule explicitly resolves the combination

### Requirement: Replay decisions by policy bundle
The system SHALL support reproducing a decision from stored evidence and the immutable policy bundle used by the original run.

#### Scenario: Historical report is audited
- **WHEN** an auditor requests replay of an analysis
- **THEN** the system can identify all evidence, thresholds, calibrations, and precedence rules that produced the decision

### Requirement: Apply idempotent evidence writes and atomic state transitions
The system SHALL use deterministic logical work identities, uniqueness constraints, and compare-and-swap state versions so queue retries and concurrent workers cannot duplicate authoritative evidence or overwrite newer states.

#### Scenario: A work item is delivered more than once
- **WHEN** two workers complete the same logical detector execution after a retry or lease loss
- **THEN** at most one authoritative evidence record is accepted and both attempts remain traceable in operational audit data

#### Scenario: Concurrent state transitions race
- **WHEN** two workers attempt incompatible transitions from the same analysis state version
- **THEN** only one compare-and-swap succeeds and the losing worker reloads the authoritative state without overwriting it

### Requirement: Seal terminal decisions and reports
The system SHALL make terminal decisions and published reports immutable for an analysis run and SHALL reject late authoritative writes.

#### Scenario: Detector finishes after decision sealing
- **WHEN** a timed-out detector later returns a result
- **THEN** the result cannot change the sealed decision or report and is retained only as policy-permitted operational audit data
