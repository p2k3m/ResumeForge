#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  embedCloudfrontMetadataIntoHtml,
  resolvePublishedCloudfrontPath,
  serializePublishedCloudfrontPayload,
} from '../lib/cloudfront/metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const clientDistDir = path.join(projectRoot, 'client', 'dist');
const clientIndexPath = path.join(clientDistDir, 'index.html');
const assetsDir = path.join(clientDistDir, 'assets');
const publishedCloudfrontSourcePath = resolvePublishedCloudfrontSourcePath();
const MIN_HASHED_VARIANTS_PER_TYPE = 6;
const MIN_ASSET_RETENTION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

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

  const assetPattern = /assets\/(index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js))(?:\?[^"'\s>]+)?/g;
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
    return html;
  }

  const entries = await listAssetEntries();
  if (!entries.length) {
    return html;
  }

  const fileNames = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  );

  const hashedMetadata = await gatherHashedAssetMetadata(fileNames);
  const fallbackKeep = new Set();

  if (hashedMetadata.length) {
    const retentionThreshold = Date.now() - MIN_ASSET_RETENTION_MS;
    const groupedByExtension = hashedMetadata.reduce((acc, item) => {
      if (!acc.has(item.extension)) {
        acc.set(item.extension, []);
      }
      acc.get(item.extension).push(item);
      return acc;
    }, new Map());

    for (const [extension, group] of groupedByExtension.entries()) {
      group.sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (const item of group) {
        if (item.mtimeMs >= retentionThreshold) {
          fallbackKeep.add(item.name);
        }
      }
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
    return html;
  }

  for (const target of removalTargets) {
    await removeFile(target);
  }

  console.log(
    `[prune-client-assets] Removed ${removalTargets.size} obsolete hashed asset${
      removalTargets.size === 1 ? '' : 's'
    }.`
  );

  return html;
}

function normalizePrimaryIndexAssetPath(assetPath) {
  if (typeof assetPath !== 'string') {
    return '';
  }

  let candidate = assetPath.trim();
  if (!candidate) {
    return '';
  }

  candidate = candidate.replace(/\?.*$/, '').replace(/#.*$/, '');
  candidate = candidate.replace(/^(?:\.\.\/|\.\/)+/, '');
  candidate = candidate.replace(/^\/+/, '').replace(/\\/g, '/');

  const match = candidate.match(/^assets\/index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)$/i);
  if (!match) {
    return '';
  }

  return match[0];
}

function extractPrimaryIndexAssetsFromHtml(html) {
  const manifest = { css: '', js: '' };
  if (typeof html !== 'string' || !html.trim()) {
    return manifest;
  }

  const assetPattern = /(?:src|href)=["']([^"']*assets\/index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js))(?:\?[^"'>\s]+)?["']/gi;
  let match;

  while ((match = assetPattern.exec(html)) !== null) {
    const candidate = normalizePrimaryIndexAssetPath(match[1]);
    if (!candidate) {
      continue;
    }

    if (candidate.endsWith('.css') && !manifest.css) {
      manifest.css = candidate;
    } else if (candidate.endsWith('.js') && !manifest.js) {
      manifest.js = candidate;
    }

    if (manifest.css && manifest.js) {
      break;
    }
  }

  return manifest;
}

async function ensurePrimaryIndexAliases(html) {
  const aliasCandidates = [
    { type: 'css', alias: 'assets/index-latest.css' },
    { type: 'js', alias: 'assets/index-latest.js' },
  ];

  if (typeof html !== 'string' || !html.trim()) {
    return;
  }

  const manifest = extractPrimaryIndexAssetsFromHtml(html);

  for (const { type, alias } of aliasCandidates) {
    const source = manifest[type];
    if (!source) {
      console.warn(
        `[prune-client-assets] Skipping ${alias}; unable to determine primary ${type.toUpperCase()} asset.`,
      );
      continue;
    }

    if (!alias.startsWith('assets/')) {
      continue;
    }

    const sourcePath = path.join(clientDistDir, source);
    const aliasPath = path.join(clientDistDir, alias);

    try {
      await fs.mkdir(path.dirname(aliasPath), { recursive: true });
      await fs.copyFile(sourcePath, aliasPath);
      console.log(`[prune-client-assets] Updated ${alias} → ${source}.`);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        console.warn(
          `[prune-client-assets] Unable to update ${alias}; source asset ${source} was not found.`,
        );
        continue;
      }
      throw error;
    }
  }
}

function resolvePublishedCloudfrontSourcePath() {
  return resolvePublishedCloudfrontPath({ projectRoot });
}

async function loadPublishedCloudfrontMetadata() {
  if (!publishedCloudfrontSourcePath) {
    return null;
  }

  try {
    const raw = await fs.readFile(publishedCloudfrontSourcePath, 'utf8');
    if (!raw.trim()) {
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn(
        `[prune-client-assets] Skipping published CloudFront metadata fallback; JSON parse failed for ${publishedCloudfrontSourcePath}.`,
        error,
      );
      return null;
    }

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn(
        `[prune-client-assets] Published CloudFront metadata not found at ${publishedCloudfrontSourcePath}; skipping static fallback.`,
      );
      return null;
    }
    throw error;
  }
}

async function ensurePublishedCloudfrontFallback({ metadata } = {}) {
  const resolvedMetadata = metadata || (await loadPublishedCloudfrontMetadata());
  if (!resolvedMetadata) {
    return;
  }

  const serialized = serializePublishedCloudfrontPayload(resolvedMetadata);
  const targets = [
    path.join(clientDistDir, 'api', 'published-cloudfront'),
    path.join(clientDistDir, 'api', 'published-cloudfront.json'),
  ];

  for (const target of targets) {
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, serialized, 'utf8');
      const relativeTarget = path.relative(clientDistDir, target) || path.basename(target);
      console.log(
        `[prune-client-assets] Updated ${relativeTarget.replace(/\\/g, '/')} from config/published-cloudfront.json.`,
      );
    } catch (error) {
      if (error?.code === 'ENOENT') {
        console.warn(
          `[prune-client-assets] Unable to write ${target}; ensure the client build completed successfully.`,
        );
        continue;
      }
      throw error;
    }
  }
}

async function embedPublishedCloudfrontMetadata({ metadata, html }) {
  if (!metadata) {
    return;
  }

  let workingHtml = html;
  if (!workingHtml || typeof workingHtml !== 'string') {
    try {
      workingHtml = await fs.readFile(clientIndexPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        console.warn('[prune-client-assets] client/dist/index.html missing; unable to embed metadata.');
        return;
      }
      throw error;
    }
  }

  const updatedHtml = embedCloudfrontMetadataIntoHtml(workingHtml, metadata);
  if (typeof updatedHtml !== 'string' || updatedHtml === workingHtml) {
    return;
  }

  await fs.writeFile(clientIndexPath, updatedHtml, 'utf8');
  console.log('[prune-client-assets] Embedded published CloudFront metadata into client index.');
}

async function run() {
  const html = await pruneHashedAssets();
  await ensurePrimaryIndexAliases(html);
  const metadata = await loadPublishedCloudfrontMetadata();
  if (metadata) {
    await ensurePublishedCloudfrontFallback({ metadata });
    await embedPublishedCloudfrontMetadata({ metadata, html });
  }
}

run().catch((error) => {
  console.error('[prune-client-assets] Failed to prune client assets:', error);
  process.exitCode = 1;
});
