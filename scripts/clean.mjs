#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import { rm, stat, readdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const CLEAN_TARGETS = [
  'coverage',
  '.aws-sam',
  '.nyc_output',
  'artifacts',
  'dist',
  'build',
  'tmp/build',
  'tmp/cache',
  'lambdas/.cache',
  'lambdas/.bundle',
  'client/dist',
  'client/.cache',
  'client/.next',
  'client/.vite',
  'client/tmp',
  'microservices/.cache',
  'microservices/.dist',
  'node_modules/.cache',
  'tests/.cache',
];

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

async function remove(target) {
  if (!(await pathExists(target))) {
    return false;
  }
  await rm(target, { recursive: true, force: true });
  return true;
}

async function cleanEmptyDirectories(baseDir) {
  const entries = await readdir(baseDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(baseDir, entry.name);
        try {
          const childEntries = await readdir(fullPath);
          if (childEntries.length === 0) {
            await rm(fullPath, { recursive: true, force: true });
          }
        } catch (err) {
          if (err && err.code !== 'ENOENT') {
            throw err;
          }
        }
      })
  );
}

async function main() {
  const removals = await Promise.all(
    CLEAN_TARGETS.map((relativeTarget) => {
      const target = path.resolve(projectRoot, relativeTarget);
      return remove(target).then((removed) => ({ target, removed })).catch((err) => ({ target, error: err }));
    })
  );

  await cleanEmptyDirectories(path.resolve(projectRoot, 'client'));
  await cleanEmptyDirectories(projectRoot);

  const removed = removals.filter((result) => result.removed);
  const failed = removals.filter((result) => result.error);

  removed.forEach((result) => {
    console.log(`Removed ${path.relative(projectRoot, result.target) || '.'}`);
  });

  if (failed.length) {
    failed.forEach((result) => {
      console.warn(`Failed to clean ${path.relative(projectRoot, result.target) || '.'}:`, result.error);
    });
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Clean script failed', err);
  process.exitCode = 1;
});
