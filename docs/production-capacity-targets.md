# Production Capacity Targets

These are release targets for the first single-service deployment profile. They are acceptance targets, not claims about the current stopped local service.

| Area | Target | Measurement boundary |
| --- | ---: | --- |
| Per-tenant active analyses | 2 | Active leases for one scope; reject or queue above the configured bound |
| Global analysis concurrency | 2 by default | `AGENT_ANALYSIS_CONCURRENCY`; raise only after a GPU benchmark |
| Maximum queued age | 30 minutes | `AGENT_ANALYSIS_MAX_AGE_MS`; expired jobs get a typed terminal outcome |
| Queue capacity | 32 by default | `AGENT_ANALYSIS_QUEUE_MAX`; overload returns `ANALYSIS_QUEUE_OVERLOADED` |
| End-to-end p95 latency | <= 120 seconds | Upload acceptance through sealed report, excluding client transfer time |
| Worker timeout | <= 60 seconds per detector call | Detector-specific timeout; startup is measured separately |
| GPU saturation | <= 85% sustained | Device-level observation window; no automatic policy change on alert |
| Error rate | <= 2% terminal typed failures | Excludes rejected overload and client cancellation |

The queue and resource scheduler already enforce bounded concurrency, queue age, leases, scope weighting, memory/slot admission, and typed overload. The p95, saturation, and error targets require a deployment benchmark with the actual GPU, provider, watermark profiles, and model checkpoint. A passing unit or smoke test cannot substitute for that benchmark.

## Required release measurements

1. Run the concurrent-load and overload suite with the target scope weights and worker configuration.
2. Run failure injection for duplicate delivery, lease loss, cancellation, timeout, worker crash, and late completion.
3. Record p50/p95 stage and end-to-end timings from encrypted observability output, plus GPU memory and utilization from the deployment host.
4. Attach the immutable measurement artifact to the release-evidence report; never mutate policy automatically from an alert.
