# Automated Pipeline Repair Script

This repository now includes `scripts/auto-pipeline-repair.mjs`, a Node.js automation utility that can be scheduled from CI/CD to self-heal failing `main` branch workflows.

## Capabilities

The script performs the following high-level workflow:

1. Detect the most recent failed GitHub Actions run on the configured base branch (defaults to `main`).
2. Download and extract the logs, then harvest the lines containing errors for context.
3. Ask the configured LLM to return a unified diff patch that resolves the failure.
4. Clone the repository, create an iteration-specific branch, apply the patch, and push it back to origin.
5. Open a pull request with the harvested context and (optionally) enable auto-merge.
6. Poll PR check runs and, once merged, poll the base branch run that was triggered by the merge.
7. If the new run fails, iterate with the new logs until it succeeds or the iteration limit is reached.

## Required Environment Variables

| Variable | Description |
| --- | --- |
| `GITHUB_TOKEN` | Fine-grained token with `repo`, `workflow`, and `pull_request` permissions. Used for cloning, GitHub API calls, and pushing branches. |
| `OPENAI_API_KEY` | API key for the configured OpenAI-compatible model. |
| `REPO_OWNER` | Repository owner/organization. |
| `REPO_NAME` | Repository name. |

## Optional Overrides

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTOFIX_BASE_BRANCH` | `main` | Branch to monitor and target for fixes. |
| `AUTOFIX_MODEL` | `gpt-4o-mini` | Model identifier passed to the OpenAI client. |
| `AUTOFIX_CLONE_URL` | Derived from `GITHUB_TOKEN` | Custom clone URL if HTTPS with embedded token is not desired. |
| `AUTOFIX_WORKDIR` | Temporary system directory | Parent directory used for clone worktrees. |
| `AUTOFIX_MAX_ITERATIONS` | `3` | Maximum retry count before the script exits with failure. |
| `AUTOFIX_POLL_INTERVAL_MS` | `20000` | Polling interval (ms) for checks and workflow runs. |
| `AUTOFIX_POLL_TIMEOUT_MS` | `3600000` | Timeout (ms) for long-running polling loops. |
| `AUTOFIX_COMMIT_MESSAGE` | `chore: automated pipeline repair` | Commit message for the generated fix. |
| `AUTOFIX_GIT_USER` / `AUTOFIX_GIT_EMAIL` | `autofix-bot` / `autofix@example.com` | Git identity applied to the fix commits. |
| `AUTOFIX_PR_TITLE` | `Automated pipeline repair` | Title for generated pull requests. |
| `AUTOFIX_MERGE_METHOD` | `SQUASH` | Merge method used when auto-merge is enabled (requires auto-merge enabled on the repository). |

## CI Integration

Add a workflow job that triggers on failure or on a schedule to run the script. The job will exit with a non-zero status if:

- No fix can be produced within `AUTOFIX_MAX_ITERATIONS` attempts.
- Required environment variables are missing.
- Git or API operations fail (for example, insufficient permissions).

Example GitHub Actions step:

```yaml
- name: Attempt automated repair
  if: failure()
  env:
    GITHUB_TOKEN: ${{ secrets.AUTOFIX_GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    REPO_OWNER: ${{ github.repository_owner }}
    REPO_NAME: ${{ github.event.repository.name }}
  run: |
    npm install --omit=dev
    node scripts/auto-pipeline-repair.mjs
```

## Safety Considerations

- Ensure the token provided can push branches and open pull requests.
- Auto-merge requires repository-level activation; otherwise the script will log a warning and continue.
- Inspect generated pull requests periodically to confirm compliance with project policies.
