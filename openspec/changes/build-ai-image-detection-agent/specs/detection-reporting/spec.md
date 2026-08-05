## ADDED Requirements

### Requirement: Provide a controlled agent workflow
The system SHALL embed Pi as the agent runtime, expose image analysis through domain-specific tools only, and SHALL NOT permit the agent to override decisions, evidence, or policy fields.

#### Scenario: User asks Pi to analyze an image
- **WHEN** Pi receives a supported image analysis request
- **THEN** it invokes the analysis workflow and presents backend-owned progress and results

#### Scenario: Pi runtime starts in production mode
- **WHEN** the Agent service creates a production Pi session
- **THEN** only approved analysis-domain tools are available and generic shell, filesystem read, write, and edit tools are unavailable

### Requirement: Integrate as an independent service in the platform repository
The system SHALL implement the Agent as an independently runnable service in the existing platform repository and SHALL reuse detector services through versioned adapters without copying their model code or weights.

#### Scenario: Prototype invokes the existing image detector
- **WHEN** an unresolved image reaches model inference in the prototype
- **THEN** the Agent invokes the configured AI-image service adapter and converts its response into typed evidence linked to the analysis

#### Scenario: Agent service is unavailable
- **WHEN** the platform gateway cannot reach the Agent service
- **THEN** the new Agent workflow reports a typed service-unavailable error and the legacy AI-image route remains unaffected

### Requirement: Route browser requests through the platform gateway
The system SHALL expose versioned Agent analysis endpoints through the platform gateway, and the dedicated Agent web workflow SHALL NOT call model workers directly.

#### Scenario: Web user submits an image
- **WHEN** the dedicated Agent page submits a supported image
- **THEN** the request travels through the platform gateway to one Agent analysis identity without a browser request to the AI-image model service

#### Scenario: Web client requests a report
- **WHEN** the web client retrieves status, evidence, or a report
- **THEN** it uses the Agent analysis API and receives backend-owned records for the same analysis identity

### Requirement: Provide a dedicated Agent web section
The system SHALL provide a first-class platform navigation entry for the Detection Agent, beginning with a Pi conversation shell and later adding the AI-image workflow, and SHALL keep unimplemented capabilities out of the active controls.

#### Scenario: User opens the Agent section
- **WHEN** a user selects the Detection Agent navigation item
- **THEN** the current prototype opens the Pi workspace and AI-image upload workflow, while every disabled stage remains explicitly labeled

#### Scenario: Analysis completes in the prototype
- **WHEN** the prototype analysis reaches a terminal result
- **THEN** the page displays the authoritative three-way decision, decision basis, evidence summaries, explanation verification status, limitations, and retry action without presenting unsupported future capabilities

### Requirement: Preserve the completed Pi bootstrap boundary
The completed bootstrap milestone SHALL remain testable as a Pi session and conversation boundary that does not fabricate image detection when analysis tools are unavailable.

#### Scenario: Pi conversation is used independently
- **WHEN** the dedicated Agent page connects to a healthy Agent service
- **THEN** it allows the user to create a Pi session and exchange messages through the platform gateway without requiring an image analysis

#### Scenario: An installation disables image analysis
- **WHEN** no image-analysis domain tool is registered and the user asks the Agent to detect an image
- **THEN** the Agent states that image detection is not configured and produces no decision, score, evidence, or simulated progress

#### Scenario: Pi model provider is missing
- **WHEN** the Agent service has no valid model-provider credentials or local endpoint
- **THEN** health and chat APIs return a typed not-configured state and the web page presents configuration status without crashing

### Requirement: Stream stable analysis progress
The system SHALL expose persisted coarse lifecycle states without exposing internal reasoning, fabricating progress, or allowing progress updates to alter the run.

#### Scenario: Complementary inference is triggered
- **WHEN** an analysis escalates beyond the primary detector
- **THEN** the web UI reports an additional-analysis state while preserving stable layout and analysis identity

#### Scenario: A stage has not started
- **WHEN** the backend has not emitted a state transition for a planned stage
- **THEN** the web UI does not display that stage as running or complete based on a timer or simulated percentage

### Requirement: Publish a concise evidence-linked report
The system SHALL report the authoritative decision, confidence band, decision basis, verified explanation or fallback, material conflicts, limitations, and referenced evidence summaries.

#### Scenario: Result is inconclusive
- **WHEN** decisioning returns `INCONCLUSIVE`
- **THEN** the report clearly states that evidence is insufficient or conflicting and does not map the result to authentic or human-created

#### Scenario: Walking skeleton requires AI synthesis
- **WHEN** direct-evidence collection and deterministic decisioning complete in the current prototype
- **THEN** Pi synthesizes a bounded Chinese analysis from the immutable decision and sanitized structured evidence before the report is sealed

#### Scenario: Required synthesis is unavailable
- **WHEN** the configured Pi provider fails or returns an empty synthesis in the current prototype
- **THEN** the analysis ends with typed `AI_SYNTHESIS_FAILED` status and does not silently publish invented or fallback prose

### Requirement: Expose machine-readable results
The system SHALL provide a versioned structured result containing analysis state, decision, evidence references, claim validations, detector coverage, and errors.

#### Scenario: Downstream system retrieves a result
- **WHEN** an authorized client requests a completed analysis
- **THEN** it receives the same authoritative data used to render the web report

### Requirement: Maintain replayable audit records
The system SHALL record state transitions, tool and model versions, configuration hashes, retries, timeouts, policy bundle, and report version under one analysis identifier.

#### Scenario: Published report is investigated
- **WHEN** an operator audits a user-visible report
- **THEN** the operator can trace it to the original asset, all evidence, validation events, and the exact decision policy

### Requirement: Make analysis submission idempotent
The system SHALL accept a client idempotency key for analysis submission and SHALL return the same authorized analysis identity for safe retries of an equivalent request.

#### Scenario: Client retries after an unknown response
- **WHEN** the same authorized client repeats an equivalent submission with the same idempotency key
- **THEN** the API returns the existing analysis identity and does not schedule a duplicate run

### Requirement: Resume progress streams without duplicate analysis
The system SHALL persist monotonic progress events and SHALL allow authorized clients to reconnect from a cursor or retrieve the current state without starting new work.

#### Scenario: Web client reconnects
- **WHEN** a progress connection drops and reconnects with its last event cursor
- **THEN** the client receives subsequent events or the current terminal state for the same analysis identity

#### Scenario: Multiple clients observe one run
- **WHEN** Pi and a web page subscribe to the same authorized analysis
- **THEN** both observe backend-owned events without creating additional detector tasks
