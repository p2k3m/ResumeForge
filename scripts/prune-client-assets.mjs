#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const clientDistDir = path.join(projectRoot, 'client', 'dist');
const clientIndexPath = path.join(clientDistDir, 'index.html');
const assetsDir = path.join(clientDistDir, 'assets');
const MIN_HASHED_VARIANTS_PER_TYPE = 2;

async function readIndexHtml() {
  try {
    return await fs.readFile(clientIndexPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn('[prune-client-assets] client/dist/index.html missing; skipping prune.');
      return null;
    }
    throw error;
  }
}

function extractReferencedAssets(html) {
  const referenced = new Set();
  if (!html) {
    return referenced;
  }

  const assetPattern = /assets\/(index-[\w.-]+\.(?:css|js))(?:\?[^"'\s>]+)?/g;
  let match;
  while ((match = assetPattern.exec(html)) !== null) {
    referenced.add(match[1]);
  }
  return referenced;
}

async function listAssetEntries() {
  try {
    return await fs.readdir(assetsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn('[prune-client-assets] client/dist/assets missing; skipping prune.');
      return [];
    }
    throw error;
  }
}

async function gatherHashedAssetMetadata(fileNames = []) {
  const metadata = [];

  for (const name of fileNames) {
    if (!name.startsWith('index-')) {
      continue;
    }

    const ext = path.extname(name);
    if (ext !== '.js' && ext !== '.css') {
      continue;
    }

    const fullPath = path.join(assetsDir, name);
    try {
      const stats = await fs.stat(fullPath);
      metadata.push({
        name,
        extension: ext,
        mtimeMs: Number.isFinite(stats.mtimeMs) ? stats.mtimeMs : 0,
      });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }

  return metadata;
}

async function removeFile(targetPath) {
  try {
    await fs.rm(targetPath, { force: true });
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function pruneHashedAssets() {
  const html = await readIndexHtml();
  const referencedAssets = extractReferencedAssets(html);

  if (referencedAssets.size === 0) {
    if (html) {
      console.warn('[prune-client-assets] No hashed index assets referenced; skipping prune.');
    }
    return;
  }

  const entries = await listAssetEntries();
  if (!entries.length) {
    return;
  }

  const fileNames = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  );

  const hashedMetadata = await gatherHashedAssetMetadata(fileNames);
  const fallbackKeep = new Set();

  if (hashedMetadata.length) {
    const groupedByExtension = hashedMetadata.reduce((acc, item) => {
      if (!acc.has(item.extension)) {
        acc.set(item.extension, []);
      }
      acc.get(item.extension).push(item);
      return acc;
    }, new Map());

    for (const [extension, group] of groupedByExtension.entries()) {
      group.sort((a, b) => b.mtimeMs - a.mtimeMs);
      const referencedCount = group.filter((item) =>
        referencedAssets.has(item.name)
      ).length;
      const keepCount = Math.min(
        group.length,
        Math.max(MIN_HASHED_VARIANTS_PER_TYPE, referencedCount)
      );

      for (let index = 0; index < keepCount; index += 1) {
        fallbackKeep.add(group[index].name);
      }
    }
  }

  const keepSet = new Set([...referencedAssets, ...fallbackKeep]);

  const removalTargets = new Set();

  for (const name of fileNames) {
    if (!name.startsWith('index-')) {
      continue;
    }

    if (name.endsWith('.map')) {
      const base = name.slice(0, -4);
      if (!keepSet.has(base)) {
        removalTargets.add(path.join(assetsDir, name));
      }
      continue;
    }

    const ext = path.extname(name);
    if (ext !== '.js' && ext !== '.css') {
      continue;
    }

    if (!keepSet.has(name)) {
      removalTargets.add(path.join(assetsDir, name));
      const sourcemapName = `${name}.map`;
      if (fileNames.has(sourcemapName)) {
        removalTargets.add(path.join(assetsDir, sourcemapName));
      }
    }
  }

  if (removalTargets.size === 0) {
    return;
  }

  for (const target of removalTargets) {
    await removeFile(target);
  }

  console.log(
    `[prune-client-assets] Removed ${removalTargets.size} obsolete hashed asset${
      removalTargets.size === 1 ? '' : 's'
    }.`
  );
}

pruneHashedAssets().catch((error) => {
  console.error('[prune-client-assets] Failed to prune client assets:', error);
  process.exitCode = 1;
});
