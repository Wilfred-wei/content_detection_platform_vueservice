## ADDED Requirements

### Requirement: Evaluate deployment-relevant generalization
The system SHALL evaluate detector candidates on held-out generators, real-image domains, common post-processing, screenshots, and configured adversarial transformations before production promotion.

#### Scenario: Primary detector candidate is assessed
- **WHEN** a model is proposed for the primary route
- **THEN** evaluation reports operating-point performance, calibration, domain breakdowns, and error overlap with complementary candidates

### Requirement: Evaluate the complete decision policy
The system SHALL measure end-to-end false-positive rate, false-negative rate, calibration, abstention rate, coverage, latency, and route frequency for each immutable policy bundle.

#### Scenario: Policy thresholds change
- **WHEN** a new threshold or precedence rule is proposed
- **THEN** the complete policy is re-evaluated rather than inferring impact from one detector metric

### Requirement: Validate watermark robustness and early-exit safety
The system SHALL test each short-circuit-eligible watermark detector against unmarked controls and its declared transformation suite at the required false-positive operating point.

#### Scenario: Watermark detector is enabled for short-circuiting
- **WHEN** its registry policy changes to permit early exit
- **THEN** current robustness and false-positive acceptance criteria must pass for the exact detector and multi-view configuration

### Requirement: Evaluate explanation correctness
The system SHALL measure claim support, contradiction, unverifiability, verdict consistency, polarity consistency, and fallback rate using human-reviewed and synthetic control cases.

#### Scenario: Explanation verifier changes
- **WHEN** prompts, models, templates, or consistency rules are modified
- **THEN** the explanation evaluation suite runs before the verifier bundle can be promoted

### Requirement: Monitor production drift without silent policy changes
The system SHALL monitor input, route, score, disagreement, error, latency, and outcome distributions and SHALL require explicit version promotion for behavioral changes.

#### Scenario: Detector score distribution drifts
- **WHEN** monitoring crosses a configured drift threshold
- **THEN** the system alerts operators and starts evaluation or shadow analysis without automatically changing the active decision policy

### Requirement: Validate concurrency, capacity, and overload behavior
The system SHALL test multi-user admission, queue fairness, idempotent retries, provenance barriers, GPU saturation, cancellation, late results, and progress reconnection at the target capacity before release.

#### Scenario: Target concurrent load is applied
- **WHEN** the release candidate is tested at and above its declared concurrency target
- **THEN** queue age, stage latency, throughput, failure rate, GPU memory, fairness, and decision determinism are reported against acceptance thresholds

#### Scenario: System is deliberately overloaded
- **WHEN** demand exceeds configured queue or worker capacity
- **THEN** the system applies explicit queueing or rejection policy without silent detector omission, duplicate decisions, or cross-tenant leakage
