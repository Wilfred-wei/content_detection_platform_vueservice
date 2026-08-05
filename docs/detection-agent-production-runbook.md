# Detection Agent Production Runbook

## Current operating mode

- The Agent is an independent service behind the Flask gateway. Browser code never calls model workers directly.
- C2PA, GB 45438 metadata, and registered local watermark workers run behind a bounded direct-evidence barrier. Invalid or untrusted credentials remain visible evidence and do not become trusted origin.
- DDA, MIRROR, SAFE, and the optional legacy `ai_detection_service` route are supporting signals. They do not override authenticated provenance or manufacture a negative result when unavailable.
- AI multimodal assessment is the product-level adjudicator only after structured evidence has been collected. Its prompt bundle and verification status are recorded in the report.

## Capacity defaults

The defaults are deliberately conservative and can be changed only by deployment configuration:

| Resource | Default | Alarm / action |
| --- | ---: | --- |
| analysis workers | 2 | sustained queue depth above 75%: stop new rollout |
| durable queue | 32 jobs | 429 overload: investigate before raising |
| lease | 5 min | lease recovery or duplicate delivery: inspect worker health |
| maximum queue age | 30 min | expired jobs are retryable but never silently dropped |
| upload limit | 10 MiB | reject before worker invocation |
| uploads per scope | 30/min | 429 and audit the caller |

GPU workers keep their own model-specific admission queues. MIRROR remains blocked in production unless its source, weights, license, and calibration gate are explicitly approved.

## Release gate

1. Run `npm run build` and `npm test` in `services/detection_agent_service`.
2. Run `npm run evaluate:release-evidence -- --dataset-manifest <manifest.json> --dataset-root <dataset-root> --model-report <report.json> --output <release-evidence.json>` and retain the report digest with the run.
3. If the unified report is blocked, inspect its per-check reasons. In particular, a research-only manifest, unknown generator roles, insufficient model calibration, pending watermark gates, or pending human review are release stops.
4. Run `npm run verify:dataset-manifest -- --root <dataset-root> --manifest <manifest.json>` on the exact source revision and retain its manifest SHA-256, split counts, generator-role counts, and rights policy.
5. Deploy the direct-evidence route and candidate model in shadow mode. Compare replayed decisions and error overlap; do not mutate the active policy automatically.
6. Promote an immutable config bundle with pinned worker source, dependency locks, checkpoint digests, registry version, and policy version only after the unified report and manual operational review pass.

## Recovery and rollback

- A restart reloads `analyses.json`, `queue.json`, assets, sessions, and the structured event log. Queued work is re-leased; an expired lease is executed at least once more.
- A terminal report is sealed. Late workers, lost leases, cancelled tasks, and stale state versions are rejected and cannot overwrite the report.
- For overload, leave the service running, drain the queue, and return 429 to callers. Do not increase concurrency until GPU memory and p95 latency are measured.
- To roll back a model, restore the previous immutable environment variables and checkpoint digests, restart the Agent, and keep the candidate manifest in shadow-only state. Never delete the evidence or audit log during rollback.

## Retention and deletion

Original bytes are stored separately from reports. Authorized deletion removes the byte asset and writes a tombstone while retaining the sealed decision and audit references. Automatic retention deletion uses `AGENT_ANALYSIS_RETENTION_MS`; it never deletes a running analysis.

In production, set `AGENT_STORAGE_ENCRYPTION_KEY` to a 32-byte hexadecimal key. State, sessions, events, and original assets are AES-256-GCM envelopes at rest. Detection workers receive only a short-lived mode-600 materialization; a configured key rejects plaintext state files and key mismatch fails startup.

## Useful endpoints

- `GET /health` for liveness and queue state
- `GET /v1/queue` for queue depth and recovered leases
- `GET /v1/metrics` for structured counters and recent non-secret events
- `GET /v1/models/runtime` for enabled model devices, process residency, per-model queue bounds, and the current microbatch limit
- `GET /v1/analyses/:id/progress?cursor=N` for monotonic reconnect
- `GET /v1/analyses/:id/export` for replayable machine-readable state
- `POST /v1/analyses/:id/cancel` for cooperative cancellation
- `DELETE /v1/analyses/:id/asset` when authorized by deployment policy

`/v1/metrics` also exposes model drift assessments from the versioned drift
policy. A missing baseline or an undersized window is explicitly
`shadowEvaluationRequired`; an alert never changes a threshold, model, or
policy automatically. Provision baselines only from an approved labelled
window and investigate the corresponding shadow replay before promotion.

Set `AGENT_AUTH_TOKEN` and `AGENT_REQUIRE_AUTH=true` before exposing the gateway to a public network. The gateway forwards the bearer token and trusted scope header to the Agent.
