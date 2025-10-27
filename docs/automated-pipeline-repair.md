# Automated pipeline repair

The `scripts/auto-pipeline-repair.mjs` entry point coordinates an automated
loop that reviews failed workflow runs on `main`, asks an LLM to propose a
patch, opens a pull request, and waits for the pipeline to recover. The
process is wired into GitHub Actions via
[`.github/workflows/auto-pipeline-repair.yml`](../.github/workflows/auto-pipeline-repair.yml),
which triggers whenever the primary CI workflow finishes with a failure on the
`main` branch.

## Required secrets and environment variables

The workflow expects the following secrets to be configured in the repository
settings:

| Secret | Purpose |
| --- | --- |
| `AUTOFIX_GITHUB_TOKEN` | Fine-grained personal access token with `repo`, `workflow`, and PR permissions. Used for cloning, pushing branches, and enabling auto-merge. |
| `AUTOFIX_OPENAI_API_KEY` | API key used to call the LLM that proposes repair patches. |

The action supplies additional environment variables when it calls the script,
but you can override any default by defining the corresponding optional
variables:

- `AUTOFIX_BASE_BRANCH` (defaults to `main`)
- `AUTOFIX_MODEL` (defaults to `gpt-4o-mini`)
- `AUTOFIX_MAX_ITERATIONS` (defaults to `3`)
- `AUTOFIX_POLL_INTERVAL_MS`
- `AUTOFIX_POLL_TIMEOUT_MS`
- `AUTOFIX_GIT_USER` / `AUTOFIX_GIT_EMAIL` for commits created by the bot
- `AUTOFIX_COMMIT_MESSAGE` and `AUTOFIX_PR_TITLE`

If a required environment variable is missing the script fails fast with a
helpful error so that the workflow highlights the missing configuration.

## Local execution

To test the automation locally, export the required environment variables, then
run:

```bash
npm ci --omit=dev
npm run autofix:pipeline
```

The script creates temporary clones under the system temp directory by default.
Set `AUTOFIX_WORKDIR` if you would like to control the parent directory.
