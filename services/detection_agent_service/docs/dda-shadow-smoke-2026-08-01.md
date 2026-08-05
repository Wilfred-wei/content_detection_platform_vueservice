# DDA universal candidate shadow smoke - 2026-08-01

## Scope

- Active evidence route: official DDA c0 checkpoint
  `b27a31d39374803ddeff02bfabb2be76e190b04300490cddfafb24f683f37e3e`.
- Shadow candidate: `universal_allv_g2_r025_w100_seed5291_v1_step128`, checkpoint
  `c115caaa33d200d6b014f056acb973a369cceeaa139b27b1bd8a9a7dd6f86352`.
- Candidate selection manifest:
  `84e8f988de9fa5013bbfd6d39b748804ab99cd173509878c583bacd05627b8ba`.
- Candidate status: `two_seed_offline_gates_passed_not_production_deployed`.
- Source sample: owned local DDA-11 BFree fake-image evaluation asset, submitted with a
  fresh idempotency key to prevent analysis-result reuse.
- Analysis ID: `62fcf334-e893-4e1a-ba96-eb9fe2d7ce0a`.

## Observed result

The active and shadow workers received the same immutable asset hash
`1b438937a92088b397c7252267e2b1afb34ecb48e677bf6cdcc800dd097e8fdb`.

| Route | Score | Direction | User-visible evidence |
| --- | ---: | --- | --- |
| Active c0 | 0.5637549162 | AI generated | Yes |
| Universal shadow candidate | 0.9789345860 | AI generated | No |

The shadow comparison recorded `agreement`, a candidate-minus-baseline score delta of
`0.4151796699`, `decisionAuthority: none`, and
`productionSwapAuthorized: false`.

## Isolation checks

- The sealed report contained the active c0 checkpoint and score.
- The sealed report and evidence API contained neither the candidate ID nor candidate
  checkpoint digest.
- The candidate was absent from the multimodal assessment evidence context.
- The private JSONL record omitted filename and stored path and was created with mode
  `0600`.
- Unit and integration coverage proves that candidate timeout, malformed output, queue
  rejection, and audit persistence failure do not change or suppress the active result.
- With `DDA_SHADOW_ENABLED=false`, configuration resolves to the unchanged enabled c0-only
  route and does not construct a candidate worker.

## Verification

- `npm test`: 147 passed, 0 failed after adding the shadow evaluator coverage.
- `npm run build`: passed.
- Candidate verifier: all 11 artifact hashes and all semantic checks passed.
- Service health after restart: ready on `127.0.0.1:8020`.

## Promotion status

This smoke demonstrates execution and authority isolation only. It does not provide
deployment-domain calibration, fixed-FPR performance, transformation robustness,
subgroup coverage, capacity limits, or a production policy gate. The candidate remains
shadow-only and is not authorized to replace c0.
