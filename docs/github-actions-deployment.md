# GitHub Actions deployment

The repository now has one workflow at `.github/workflows/agent-ci-cd.yml`.

For the complete server registration and collaborator onboarding procedure, see
[`github-runner-and-contributor-guide.md`](github-runner-and-contributor-guide.md).
For the day-to-day developer workflow, see
[`collaborator-quickstart.md`](collaborator-quickstart.md).

- Pull requests and pushes to `master` or `agent-detection-current` run the frontend build, the Detection Agent test/build, Python syntax checks, and the CPU image-view worker tests.
- A push to `agent-detection-current` runs the same checks and then deploys on a self-hosted runner labelled `agent-deploy`.
- A manual workflow run can deploy a selected revision when the `deploy` input is enabled.

The Agent CI job runs `npm run test:ci`. This is the portable test set: the C2PA
inspector and provenance fixture tests are kept out of CI because their sample
assets and local `c2patool` binary are intentionally not stored in Git. Run the
full `npm test` locally when those optional fixtures are available.

## One-time runner setup

On GitHub open `Settings -> Actions -> Runners -> New self-hosted runner`, choose
Linux and x64, and run the generated commands on this server as the deployment
user (`weiwenfei`). Keep the generated registration token private. Add the custom
runner label `agent-deploy`; do not allow pull-request jobs to run on this runner.

The runner checkout must be different from the live checkout. The deployment
script defaults to `$HOME/content_detection_platform_vueservice-master`, which is
the current server path for this project. Set the repository variable
`AGENT_DEPLOY_ROOT` when the path differs.

## Restart and health check

The workflow deploys the frontend source/build output, Detection Agent source/build
output, and gateway source snapshot together into one live checkout. They are not
one runtime process:

- Vite frontend listens on `25173` and proxies browser requests.
- The Flask gateway listens on `28000` and is a separate platform service.
- Detection Agent listens on `8020`; the gateway forwards `/api/v1/agent/*` to it.

On this staging server, the ignored `frontend/.env.local` sets
`VITE_AGENT_TARGET=http://127.0.0.1:8020`, so the Agent calls use the local
frontend proxy directly while the other legacy modules keep their gateway
target. Removing that override returns Agent traffic to the gateway route.

The current project owns the frontend and Detection Agent services through
user-level systemd. Install them once on the deployment server:

```bash
cd /sda/home/temp/weiwenfei/content_detection_platform_vueservice-master
bash scripts/install-user-services.sh
bash scripts/restart-content-detection.sh
```

After that, a push to `agent-detection-current` builds and synchronizes the
revision, runs the restart script, and checks `http://127.0.0.1:8020/health`.
The workflow has these defaults; repository variables are only needed to override
them:

- `AGENT_DEPLOY_RESTART_COMMAND`: the exact restart command, for example a
  custom supervisor command. The default is
  `bash scripts/restart-content-detection.sh`.
- `AGENT_DEPLOY_HEALTH_URL`: a local health endpoint such as
  `http://127.0.0.1:8020/health`; this is the default.
- `AGENT_DEPLOY_REQUIRE_RESTART`: defaults to `true` so a deployment cannot be
  reported successful while the managed services were not restarted.

The checked-in Agent unit uses `NODE_ENV=staging` because the existing local
analysis state is plaintext. Before enabling production mode, migrate that state
to encrypted envelopes and set `AGENT_STORAGE_ENCRYPTION_KEY` in the server-only
`.env`; never commit the key.

The gateway currently runs outside this account and is not restarted by this
workflow. Changes under `gateway/` are synchronized, but they take effect only
when the platform service owner restarts the gateway. This boundary prevents a
deployment job from killing another user's process on the shared server.

The deployment script preserves `.env`, `.data`, `.tools`, `node_modules`, Python
virtual environments, model checkpoints, and the target `.git` directory. API
keys and model weights must remain on the server or in a secret manager; they do
not belong in GitHub Actions variables or the repository.

## Branch policy

Use pull requests for review. Pushes to `agent-detection-current` are the staging
deployment path. Promote to `master` only after the staging page and health checks
are verified. Production should use a separate protected environment and an
explicit approval/tag before enabling a production deploy job.
