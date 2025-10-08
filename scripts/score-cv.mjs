#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { buildScoreBreakdown } from '../lib/scoring/atsMetrics.js';

const METRIC_ORDER = [
  'layoutSearchability',
  'atsReadability',
  'impact',
  'crispness',
  'otherQuality',
];

function formatMetric(metric) {
  const lines = [];
  lines.push(`${metric.category}`);
  lines.push(`  Score: ${metric.score}` + (metric.rating ? ` (${metric.rating})` : ''));
  if (metric.tips?.length) {
    lines.push('  Tips:');
    metric.tips.forEach((tip) => {
      lines.push(`    • ${tip}`);
    });
  }
  return lines.join('\n');
}

async function readJson(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(resolvedPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse JSON from ${resolvedPath}: ${error.message}`);
  }
}

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error('Usage: node scripts/score-cv.mjs <path-to-json>');
    process.exitCode = 1;
    return;
  }

  let payload;
  try {
    payload = await readJson(inputPath);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const resumeText = typeof payload.resumeText === 'string' ? payload.resumeText : '';
  if (!resumeText.trim()) {
    console.error('The resumeText field must be a non-empty string.');
    process.exitCode = 1;
    return;
  }

  const jobTextCandidates = [payload.jobDescription, payload.jobText];
  const jobText = jobTextCandidates.find((value) => typeof value === 'string' && value.trim()) ?? '';
  const jobSkills = Array.isArray(payload.jobSkills) ? payload.jobSkills : [];
  const resumeSkills = Array.isArray(payload.resumeSkills) ? payload.resumeSkills : [];

  const breakdown = buildScoreBreakdown(resumeText, {
    jobText,
    jobSkills,
    resumeSkills,
  });

  const orderedMetrics = METRIC_ORDER.map((key) => breakdown[key]).filter(Boolean);

  orderedMetrics.forEach((metric, index) => {
    if (index > 0) {
      process.stdout.write('\n');
    }
    process.stdout.write(formatMetric(metric));
    process.stdout.write('\n');
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
