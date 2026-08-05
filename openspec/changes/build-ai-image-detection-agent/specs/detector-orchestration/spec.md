## ADDED Requirements

### Requirement: Describe detector operating domains
The system SHALL register each AI-image detector with its model version, training-domain summary, signal family, preprocessing contract, runtime cost, calibration artifact, and output schema.

#### Scenario: Model version is promoted
- **WHEN** a new detector version becomes eligible for production
- **THEN** it receives a distinct immutable registration and calibration reference

#### Scenario: External candidate is catalogued
- **WHEN** an external paper, repository, or checkpoint is registered before integration
- **THEN** release, artifact, license, preprocessing, runtime, output, calibration, and production-eligibility facts are recorded without making the entry executable

#### Scenario: Candidate is unlicensed or unreleased
- **WHEN** required inference assets or explicit commercial-compatible terms are absent
- **THEN** the candidate remains unavailable or evaluation-only and registry data cannot start an adapter

### Requirement: Bound provisional DDA inference before production promotion
The system MAY run an explicitly configured local DDA detector before deployment-domain calibration only as supporting evidence. It SHALL record immutable source, checkpoint digest, DINOv2 cache, preprocessing, threshold, device, version, latency, and calibration status, and SHALL NOT allow the provisional score to independently establish `AI_GENERATED`, `LIKELY_NON_AI`, high confidence, provenance, or authenticity.

#### Scenario: Provisional DDA produces a score
- **WHEN** direct evidence has not settled the analysis and the operator has enabled a complete local DDA configuration
- **THEN** the system records the score and direction with `official_threshold_unverified_for_deployment`, supplies bounded facts to AI analysis, and retains `INCONCLUSIVE` unless stronger evidence settles the run

#### Scenario: Provisional DDA returns below threshold
- **WHEN** the score is below the official threshold before deployment calibration passes
- **THEN** the result supports only the non-AI direction and is not described as proof that the image is real or authentic

### Requirement: Run a staged detector cascade
The system SHALL run a policy-selected primary detector first and SHALL invoke complementary detectors only when escalation conditions are met.

#### Scenario: Primary result is sufficient
- **WHEN** the primary result is calibrated, in distribution, outside escalation margins, and free of required robustness failures
- **THEN** the system sends its evidence to decisioning without running unnecessary complementary detectors

#### Scenario: Primary result requires escalation
- **WHEN** the primary result is near a decision boundary, out of distribution, unstable, or conflicts with existing evidence
- **THEN** the system runs policy-selected complementary detectors within the analysis budget

### Requirement: Preserve detector disagreement
The system SHALL retain individual calibrated outputs and disagreement features and SHALL NOT replace them with an unqualified majority vote.

#### Scenario: Complementary detectors disagree
- **WHEN** detector outputs materially conflict under the active policy
- **THEN** the orchestrator emits disagreement evidence for decisioning and does not declare a winner

### Requirement: Isolate detector failures
The system SHALL apply timeouts and typed failure handling per detector so that one unavailable model does not fabricate a result or corrupt completed evidence.

#### Scenario: Complementary detector times out
- **WHEN** a complementary detector exceeds its runtime budget
- **THEN** the system records a timeout, continues according to degradation policy, and excludes the missing output from confidence calculations

#### Scenario: Resident DDA worker fails
- **WHEN** DDA initialization, response validation, inference, or its deadline fails
- **THEN** the system records typed unavailable or error evidence and continues without fabricating a score

### Requirement: Trigger localization conditionally
The system SHALL run localization only when explicitly requested by policy or user intent and only with a detector that declares supported localization semantics.

#### Scenario: Explanation requires a visual region
- **WHEN** a material explanation claim requires local evidence and a compatible localizer is available
- **THEN** the orchestrator produces a linked localization artifact for verification

### Requirement: Bound and fairly schedule detector work
The system SHALL enforce per-scope concurrent-run limits, bounded stage queues, maximum queue age, weighted fairness, worker resource limits, and explicit overload outcomes.

#### Scenario: Analysis admission exceeds configured capacity
- **WHEN** a tenant or global queue limit is reached
- **THEN** the system queues or rejects the request according to policy and does not silently omit required detectors

#### Scenario: Multiple tenants are queued
- **WHEN** concurrent demand exceeds immediately available workers
- **THEN** scheduling applies the configured fairness policy so one tenant cannot monopolize all capacity

### Requirement: Make complementary inference order-independent
The system SHALL determine the scheduled complementary detector set before fan-out and SHALL wait until each scheduled detector completes, fails, or times out before decisioning.

#### Scenario: Complementary detectors finish in different orders
- **WHEN** the same immutable analysis inputs are executed with different detector completion orders
- **THEN** the decision inputs contain the same terminal detector set and statuses

### Requirement: Admit GPU work by declared capacity
The system SHALL route GPU tasks by model and compatible device class and SHALL reserve declared memory and concurrency slots before execution.

#### Scenario: Insufficient GPU capacity is available
- **WHEN** no compatible worker can reserve the required memory and slot within the queue-age budget
- **THEN** the task remains queued or reaches an explicit timeout and is not started in an unsafe partial state

#### Scenario: Requests are micro-batched
- **WHEN** compatible requests are combined into a bounded batch
- **THEN** maximum batch delay is enforced and every output remains linked to its own preprocessing, evidence, and analysis identity

### Requirement: Handle cancellation and late worker results
The system SHALL stop scheduling new work after cancellation and SHALL prevent results that arrive after cancellation or terminal sealing from altering authoritative analysis state.

#### Scenario: GPU result arrives after cancellation
- **WHEN** an active GPU operation cannot be interrupted and completes after the run is cancelled
- **THEN** the system may record an operational event but does not attach the result as authoritative decision evidence
