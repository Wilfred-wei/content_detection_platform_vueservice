# GitHub Actions deployment

The repository now has one workflow at `.github/workflows/agent-ci-cd.yml`.

For the complete server registration and collaborator onboarding procedure, see
[`github-runner-and-contributor-guide.md`](github-runner-and-contributor-guide.md).

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

The current server has a Vite development process on port `25173`, while the
Detection Agent is not currently managed by a service supervisor. Therefore the
first deployment synchronizes source and build output but does not kill or restart
any existing process.

When systemd, Docker Compose, or another supervisor is configured, set these
repository variables:

- `AGENT_DEPLOY_RESTART_COMMAND`: the exact restart command, for example a
  user-level systemd restart command.
- `AGENT_DEPLOY_HEALTH_URL`: a local health endpoint such as
  `http://127.0.0.1:8020/health`.
- `AGENT_DEPLOY_REQUIRE_RESTART`: `true` once a restart command is mandatory.

The deployment script preserves `.env`, `.data`, `.tools`, `node_modules`, Python
virtual environments, model checkpoints, and the target `.git` directory. API
keys and model weights must remain on the server or in a secret manager; they do
not belong in GitHub Actions variables or the repository.

## Branch policy

Use pull requests for review. Pushes to `agent-detection-current` are the staging
deployment path. Promote to `master` only after the staging page and health checks
are verified. Production should use a separate protected environment and an
explicit approval/tag before enabling a production deploy job.
