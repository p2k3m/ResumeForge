#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');
const RETIRED_DIR = path.join(TEMPLATES_DIR, 'retired');

const RETIRED_FILES = [
  'minimalist.html',
  'precision.html',
  'structured.html',
  'portal.html'
];

const CURRENT_YEAR = new Date().getFullYear();
const TARGET_YEAR = Math.max(CURRENT_YEAR, 2025);
const QUARTER = 'Q4';

// Update the palette definitions each year when the Q4 refresh introduces
// new colour treatments for the Future Vision template family.
const VARIANTS = [
  {
    slug: 'slate',
    title: 'Future Vision 2025 – Slate Horizon',
    tagline: 'Slate Horizon palette tuned for Q4 innovation roles.',
    colors: {
      '--accent': '#1d4ed8',
      '--accent-soft': '#e8ecff',
      '--border': '#c7d2fe',
      '--text': '#0f172a',
      '--muted': '#475569',
      '--pill': '#38bdf8',
      '--pill-bg': 'rgba(56, 189, 248, 0.16)',
      '--card-shadow': '0 22px 48px rgba(30, 64, 175, 0.16)'
    }
  },
  {
    slug: 'midnight',
    title: 'Future Vision 2025 – Midnight Pulse',
    tagline: 'Midnight Pulse palette built for late-stage growth teams.',
    colors: {
      '--accent': '#0f172a',
      '--accent-soft': '#101827',
      '--border': '#1f2a44',
      '--text': '#e2e8f0',
      '--muted': '#94a3b8',
      '--pill': '#38bdf8',
      '--pill-bg': 'rgba(14, 165, 233, 0.22)',
      '--card-shadow': '0 26px 52px rgba(15, 23, 42, 0.32)'
    }
  },
  {
    slug: 'sunrise',
    title: 'Future Vision 2025 – Sunrise Ember',
    tagline: 'Sunrise Ember palette energised for Q4 product launches.',
    colors: {
      '--accent': '#ea580c',
      '--accent-soft': '#fff3e8',
      '--border': '#fed7aa',
      '--text': '#1f2933',
      '--muted': '#9a3412',
      '--pill': '#f97316',
      '--pill-bg': 'rgba(251, 146, 60, 0.18)',
      '--card-shadow': '0 22px 44px rgba(249, 115, 22, 0.16)'
    }
  },
  {
    slug: 'emerald',
    title: 'Future Vision 2025 – Emerald Current',
    tagline: 'Emerald Current palette crafted for Q4 sustainability hires.',
    colors: {
      '--accent': '#047857',
      '--accent-soft': '#e1f8f0',
      '--border': '#bbf7d0',
      '--text': '#064e3b',
      '--muted': '#0f766e',
      '--pill': '#10b981',
      '--pill-bg': 'rgba(16, 185, 129, 0.16)',
      '--card-shadow': '0 20px 40px rgba(4, 120, 87, 0.14)'
    }
  }
];

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function retireTemplates() {
  await ensureDir(RETIRED_DIR);
  for (const fileName of RETIRED_FILES) {
    const source = path.join(TEMPLATES_DIR, fileName);
    if (!(await pathExists(source))) {
      continue;
    }
    const target = path.join(RETIRED_DIR, fileName);
    if (await pathExists(target)) {
      await fs.rm(target, { force: true });
    }
    await fs.rename(source, target);
    console.log(`Retired template → ${path.relative(ROOT_DIR, target)}`);
  }
}

function buildCssContent(colors) {
  const overrides = Object.entries(colors)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
  return `@import url('./2025.css');\n\n:root {\n${overrides}\n}\n`;
}

function decorateHtml(baseHtml, { cssFileName, title, tagline }) {
  let html = baseHtml.replace('href="2025.css"', `href="${cssFileName}"`);
  html = html.replace(
    'Future-ready professional profile &mdash; tailored for 2025 hiring',
    `${title} &mdash; ${tagline}`
  );
  return html.replace(
    '<head>',
    `<head>\n    <!-- Generated ${QUARTER} ${TARGET_YEAR} via scripts/refresh-templates.mjs -->`
  );
}

async function pruneLegacyVariants(activeFiles) {
  const entries = await fs.readdir(TEMPLATES_DIR);
  const q4Pattern = /^2025-q\d+-/;
  for (const entry of entries) {
    if (!q4Pattern.test(entry) && !entry.startsWith('2025-variant-')) {
      continue;
    }
    if (activeFiles.has(entry)) {
      continue;
    }
    await fs.rm(path.join(TEMPLATES_DIR, entry), { force: true });
    console.log(`Removed stale variant → templates/${entry}`);
  }
}

async function updateVariants() {
  const baseHtmlPath = path.join(TEMPLATES_DIR, '2025.html');
  const baseHtml = await fs.readFile(baseHtmlPath, 'utf8');
  const activeFiles = new Set();

  for (const variant of VARIANTS) {
    const id = `2025-${QUARTER.toLowerCase()}-${variant.slug}`;
    const cssFileName = `${id}.css`;
    const htmlFileName = `${id}.html`;
    const htmlPath = path.join(TEMPLATES_DIR, htmlFileName);
    const cssPath = path.join(TEMPLATES_DIR, cssFileName);

    const html = decorateHtml(baseHtml, {
      cssFileName,
      title: variant.title,
      tagline: variant.tagline
    });
    const css = buildCssContent(variant.colors);

    await fs.writeFile(htmlPath, html);
    await fs.writeFile(cssPath, css);

    activeFiles.add(htmlFileName);
    activeFiles.add(cssFileName);

    console.log(`Refreshed 2025 variant → templates/${htmlFileName}`);
    console.log(`Refreshed 2025 palette → templates/${cssFileName}`);
  }

  await pruneLegacyVariants(activeFiles);
}

async function main() {
  await retireTemplates();
  await updateVariants();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
