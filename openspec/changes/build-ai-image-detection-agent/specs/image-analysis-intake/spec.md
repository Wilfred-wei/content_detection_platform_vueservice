## ADDED Requirements

### Requirement: Preserve the submitted image
The system SHALL preserve the original submitted bytes before decoding or transformation and SHALL assign a content hash and immutable asset identifier.

#### Scenario: Valid image submission
- **WHEN** a user submits a supported image
- **THEN** the system stores the original bytes and records their hash before creating any derived view

### Requirement: Validate image inputs safely
The system SHALL determine the actual media type, enforce configured size and decode limits, and isolate untrusted parsing from the agent and decision services.

#### Scenario: Declared type differs from content
- **WHEN** the declared MIME type does not match the detected file structure
- **THEN** the system records the mismatch and either safely processes the detected supported type or rejects the asset according to policy

#### Scenario: Unsafe image payload
- **WHEN** an image exceeds resource limits, is malformed, or cannot be decoded safely
- **THEN** the system terminates analysis with a typed intake failure and runs no detector

### Requirement: Create traceable derived views
The system SHALL create immutable detector-specific views without modifying the original asset and SHALL record each transformation recipe and output hash.

#### Scenario: Detector requires normalized RGB input
- **WHEN** a detector requires a resized RGB image
- **THEN** the system creates a derived view and links all resulting evidence to that exact view and transformation recipe

### Requirement: Maintain media-neutral asset relationships
The system SHALL represent media kind and parent or derivation relationships without placing image-specific detector fields in the shared asset envelope.

#### Scenario: Future media type is introduced
- **WHEN** a video or article asset type is added later
- **THEN** it can reuse the asset envelope while keeping modality-specific details in versioned payloads

### Requirement: Isolate duplicate-content reuse
The system SHALL scope original-byte deduplication, result reuse, and in-flight work coalescing to configured authorization boundaries and SHALL NOT reveal cross-tenant cache or content matches.

#### Scenario: Equivalent request is repeated within an authorized scope
- **WHEN** two requests have the same asset hash, policy bundle, detector versions, preprocessing versions, and relevant options within a scope that permits reuse
- **THEN** the system may reuse storage or computation while preserving separate authorized analysis identities and audit records

#### Scenario: Different tenants submit the same bytes
- **WHEN** matching content hashes occur across tenants without an authorized shared scope
- **THEN** neither response reveals the other submission and no result is reused across the isolation boundary
