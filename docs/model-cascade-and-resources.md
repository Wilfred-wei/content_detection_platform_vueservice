# Model Cascade and Resource Admission

The runtime uses the immutable `resources/model-cascade-policy.v1.json` policy:

1. Run the registered DDA primary detector.
2. Escalate to SAFE, MIRROR, or the legacy adapter when the primary has no
   score, is provisional, is near its threshold, or reports an OOD diagnostic.
3. Preserve every detector result and disagreement. The checked-in fusion policy
   is `none_preserve_disagreement`: scores are never averaged and a majority
   vote never replaces the AI adjudicator or the deterministic provenance policy.

All currently registered model outputs are deployment-uncalibrated, so the
default policy intentionally escalates and keeps the current coverage. A
future calibrated adapter must explicitly report `deployment_calibrated`
before the near-boundary policy can reduce complementary work.

Each detector is also registered with a bounded model resource queue. The
scheduler reserves declared slots and memory at the device level, so two models
sharing one GPU cannot independently exceed the same device budget. Configure
capacities with `AGENT_MODEL_DEVICE_CAPACITIES`, for example
`[{"device":"cuda:0","memoryMb":16384,"slots":1}]`. A known memory budget
rejects a model whose reservation is unknown rather than guessing. The scheduler
now exposes a delayed `runBatched` path: compatible requests are coalesced up
to `microbatchSize`, admitted as one device reservation, and flushed at
`maxBatchDelayMs`. DDA, SAFE, and MIRROR workers accept a bounded `requests`
envelope and perform one model forward for supported items while their Node
adapters preserve per-request identities and typed failures. The checked-in
defaults keep all declarations at `1` until each worker is benchmarked on the
deployment GPU; raising a declaration without that benchmark is not a capacity
claim.

The service metrics include a model-drift snapshot. The checked-in policy
starts with no baselines, so current deployments report `no_baseline` and stay
shadow-only until an approved labelled production window is supplied.
