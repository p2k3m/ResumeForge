import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import process from 'process';
import JSZip from 'jszip';
import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';

const MAX_ITERATIONS = Number.parseInt(process.env.AUTOFIX_MAX_ITERATIONS || '3', 10);
const POLL_INTERVAL_MS = Number.parseInt(process.env.AUTOFIX_POLL_INTERVAL_MS || '20000', 10);
const POLL_TIMEOUT_MS = Number.parseInt(process.env.AUTOFIX_POLL_TIMEOUT_MS || String(1000 * 60 * 60), 10);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const githubToken = requireEnv('GITHUB_TOKEN');
const openaiApiKey = requireEnv('OPENAI_API_KEY');
const repoOwner = requireEnv('REPO_OWNER');
const repoName = requireEnv('REPO_NAME');
const baseBranch = process.env.AUTOFIX_BASE_BRANCH || 'main';
const modelName = process.env.AUTOFIX_MODEL || 'gpt-4o-mini';
const cloneUrl = process.env.AUTOFIX_CLONE_URL || `https://x-access-token:${githubToken}@github.com/${repoOwner}/${repoName}.git`;
const workingParentDir = process.env.AUTOFIX_WORKDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-'));

const octokit = new Octokit({ auth: githubToken });
const openai = new OpenAI({ apiKey: openaiApiKey });

function log(message, details) {
  const timestamp = new Date().toISOString();
  if (details) {
    console.log(`[${timestamp}] ${message}`, details);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

async function findLatestFailedRun() {
  log('Searching for latest failed workflow run on base branch', { baseBranch });
  const { data } = await octokit.actions.listWorkflowRunsForRepo({
    owner: repoOwner,
    repo: repoName,
    branch: baseBranch,
    status: 'completed',
    per_page: 50,
  });

  const failedRun = data.workflow_runs.find((run) => run.conclusion === 'failure');
  if (!failedRun) {
    return null;
  }
  log('Located failed workflow run', { runId: failedRun.id, name: failedRun.name, runNumber: failedRun.run_number });
  return failedRun;
}

async function downloadLogs(runId) {
  log('Downloading logs for failed run', { runId });
  const response = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs', {
    owner: repoOwner,
    repo: repoName,
    run_id: runId,
    request: { responseType: 'arraybuffer' },
  });

  const zip = await JSZip.loadAsync(Buffer.from(response.data));
  const logEntries = [];
  const files = Object.keys(zip.files).sort();
  for (const filename of files) {
    if (filename.endsWith('.txt')) {
      const file = zip.files[filename];
      const content = await file.async('string');
      logEntries.push({ filename, content });
    }
  }
  return logEntries;
}

function summariseLogs(logEntries) {
  const summaryLines = [];
  for (const entry of logEntries) {
    const lines = entry.content.split(/\r?\n/);
    const errorLines = lines.filter((line) => /error|failed|exception|traceback|fatal/i.test(line));
    if (errorLines.length > 0) {
      summaryLines.push(`### ${entry.filename}`);
      summaryLines.push(...errorLines.slice(0, 50));
    }
  }
  return summaryLines.join('\n');
}

async function requestPatch({ failureSummary, iteration, baseSha }) {
  const systemPrompt = `You are an automated code maintenance agent. You receive:
- A summary of CI logs
- Repository metadata

You must produce a unified diff patch that addresses the failure. Only respond with the diff.
Do not include markdown fences or commentary. Each hunk must include filenames relative to the repo root.
Keep the patch minimal but sufficient to fix the failure.`;

  const userPrompt = `Repository: ${repoOwner}/${repoName}
Base commit: ${baseSha}
Iteration: ${iteration + 1}

Failure summary:
${failureSummary}`;

  log('Requesting patch from model');
  const response = await openai.responses.create({
    model: modelName,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const outputText = response.output?.[0]?.content?.[0]?.text;
  if (!outputText) {
    throw new Error('Model response did not include a patch');
  }

  const trimmed = outputText.trim();
  if (!trimmed.startsWith('diff') && !trimmed.startsWith('---')) {
    throw new Error('Model response is not a unified diff');
  }

  return trimmed;
}

function runGitCommand(args, options = {}) {
  const result = spawnSync('git', args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function applyPatch({ patchText, iteration }) {
  const branchName = `autofix/run-${Date.now()}-${iteration + 1}`;
  const repoDir = fs.mkdtempSync(path.join(workingParentDir, 'repo-'));
  log('Cloning repository', { repoDir, branchName });
  runGitCommand(['clone', '--depth=50', '--branch', baseBranch, cloneUrl, repoDir]);
  runGitCommand(['checkout', '-b', branchName], { cwd: repoDir });

  log('Applying patch');
  const applyResult = spawnSync('git', ['apply', '--whitespace=fix'], {
    cwd: repoDir,
    input: patchText,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (applyResult.status !== 0) {
    throw new Error(`Failed to apply patch: ${applyResult.stderr}`);
  }

  runGitCommand(['status', '--short'], { cwd: repoDir });

  const commitMessage = process.env.AUTOFIX_COMMIT_MESSAGE || 'chore: automated pipeline repair';
  runGitCommand(['config', 'user.name', process.env.AUTOFIX_GIT_USER || 'autofix-bot'], { cwd: repoDir });
  runGitCommand(['config', 'user.email', process.env.AUTOFIX_GIT_EMAIL || 'autofix@example.com'], { cwd: repoDir });
  runGitCommand(['add', '-A'], { cwd: repoDir });
  runGitCommand(['commit', '-m', commitMessage], { cwd: repoDir });
  runGitCommand(['push', '--set-upstream', 'origin', branchName], { cwd: repoDir });

  return { repoDir, branchName };
}

async function createPullRequest({ branchName, failureSummary }) {
  const title = process.env.AUTOFIX_PR_TITLE || 'Automated pipeline repair';
  const bodyHeader = '## Summary\n- Automated fix for failing CI pipeline\n\n';
  const body = [bodyHeader, '## Failure context\n\n', '```\n', failureSummary.slice(0, 4000), '\n```'].join('');

  log('Creating pull request');
  const { data } = await octokit.pulls.create({
    owner: repoOwner,
    repo: repoName,
    head: branchName,
    base: baseBranch,
    title,
    body,
  });
  return data;
}

async function enableAutoMerge(pr) {
  log('Enabling auto-merge for PR', { number: pr.number });
  try {
    await octokit.graphql(
      `mutation EnableAutoMerge($pullRequestId: ID!, $method: PullRequestMergeMethod!) {
        enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $method }) {
          pullRequest { number }
        }
      }`,
      { pullRequestId: pr.node_id, method: process.env.AUTOFIX_MERGE_METHOD || 'SQUASH' },
    );
  } catch (error) {
    log('Failed to enable auto-merge (continuing)', { error: error.message });
  }
}

async function waitForChecks({ ref }) {
  const start = Date.now();
  log('Polling check runs for ref', { ref });
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const { data } = await octokit.checks.listForRef({
      owner: repoOwner,
      repo: repoName,
      ref,
    });
    const runs = data.check_runs;
    const statuses = new Set(runs.map((run) => run.status));
    if (!runs.length) {
      log('No check runs yet, waiting...');
    } else if (![...statuses].some((status) => status !== 'completed')) {
      const conclusionStatuses = new Set(runs.map((run) => run.conclusion));
      if (['failure', 'cancelled', 'timed_out'].some((state) => conclusionStatuses.has(state))) {
        return { success: false, runs };
      }
      if (!conclusionStatuses.has(null)) {
        return { success: true, runs };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Timed out while waiting for checks to complete');
}

async function waitForPrMerge(prNumber) {
  const start = Date.now();
  log('Waiting for PR to merge', { prNumber });
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const { data } = await octokit.pulls.get({ owner: repoOwner, repo: repoName, pull_number: prNumber });
    if (data.merged) {
      log('PR merged', { prNumber });
      return data.merge_commit_sha;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for PR to merge');
}

async function waitForNewMainRun(previousRunId) {
  const start = Date.now();
  log('Waiting for new workflow run on main branch');
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const { data } = await octokit.actions.listWorkflowRunsForRepo({
      owner: repoOwner,
      repo: repoName,
      branch: baseBranch,
      per_page: 20,
    });
    const run = data.workflow_runs[0];
    if (run && run.id !== previousRunId && run.status === 'completed') {
      log('Detected new workflow run', { runId: run.id, conclusion: run.conclusion });
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for new workflow run');
}

async function runAutofixLoop() {
  let iteration = 0;
  let previousFailedRunId = null;

  while (iteration < MAX_ITERATIONS) {
    const failedRun = await findLatestFailedRun();
    if (!failedRun) {
      log('No failed workflow run detected. Exiting.');
      return;
    }
    if (previousFailedRunId && failedRun.id === previousFailedRunId) {
      log('Latest failed run has already been processed. Exiting to avoid duplicate work.');
      return;
    }

    previousFailedRunId = failedRun.id;
    const logs = await downloadLogs(failedRun.id);
    const failureSummary = summariseLogs(logs) || 'No explicit error lines detected in logs.';
    const patch = await requestPatch({ failureSummary, iteration, baseSha: failedRun.head_sha });
    const { branchName } = applyPatch({ patchText: patch, iteration });
    const pr = await createPullRequest({ branchName, failureSummary });
    await enableAutoMerge(pr);

    const checksResult = await waitForChecks({ ref: `refs/pull/${pr.number}/head` });
    if (!checksResult.success) {
      log('Checks failed on PR branch, continuing with new iteration');
      iteration += 1;
      continue;
    }

    await waitForPrMerge(pr.number);
    const newRun = await waitForNewMainRun(failedRun.id);
    if (newRun.conclusion === 'success') {
      log('New main branch workflow run succeeded. Autofix complete.');
      return;
    }

    log('New workflow run failed, preparing to iterate', { newRunId: newRun.id });
    iteration += 1;
  }

  throw new Error('Reached iteration limit without achieving a successful pipeline run.');
}

runAutofixLoop().catch((error) => {
  console.error('Autofix process failed:', error);
  process.exitCode = 1;
});
