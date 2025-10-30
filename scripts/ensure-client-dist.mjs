#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { access, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const clientDistDir = path.join(projectRoot, 'client', 'dist')
const TRACKED_ASSET_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.ico',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.wasm',
  '.map',
  '.txt',
  '.webmanifest',
])

function createValidationError(message) {
  const error = new Error(message)
  error.name = 'ClientBuildValidationError'
  return error
}

async function assertDirectoryPopulated(directory, { label } = {}) {
  let metadata
  try {
    metadata = await stat(directory)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createValidationError(
        `[ensure-client-build] Missing ${label ?? 'required directory'} at ${directory}. Run "npm run build:client" before deploying.`,
      )
    }
    throw error
  }

  if (!metadata.isDirectory()) {
    throw createValidationError(
      `[ensure-client-build] Expected ${directory} to be a directory created by the client build.`,
    )
  }

  const entries = await readdir(directory)
  const visibleEntries = entries.filter((entry) => !entry.startsWith('.'))
  if (visibleEntries.length === 0) {
    throw createValidationError(
      `[ensure-client-build] ${directory} is empty. Confirm "npm run build:client" completed successfully before deploying.`,
    )
  }
}

async function assertFileExists(filePath, { label } = {}) {
  try {
    await access(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createValidationError(
        `[ensure-client-build] Missing ${label ?? 'required file'} at ${filePath}. Run "npm run build:client" before deploying.`,
      )
    }
    throw error
  }
}

function extractLocalAssetPathsFromIndex(htmlContent) {
  if (typeof htmlContent !== 'string' || !htmlContent.trim()) {
    return []
  }

  const assetPattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi
  const assetPaths = new Set()
  let match

  while ((match = assetPattern.exec(htmlContent))) {
    const raw = match[1]?.trim()
    if (!raw) {
      continue
    }

    const lower = raw.toLowerCase()

    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('//') ||
      lower.startsWith('data:') ||
      lower.startsWith('mailto:') ||
      lower.startsWith('#')
    ) {
      continue
    }

    let sanitized = raw
    while (sanitized.startsWith('./')) {
      sanitized = sanitized.slice(2)
    }
    if (sanitized.startsWith('/')) {
      sanitized = sanitized.slice(1)
    }
    if (sanitized.startsWith('..')) {
      continue
    }

    const [withoutQuery] = sanitized.split(/[?#]/)
    const candidate = withoutQuery?.trim()
    if (!candidate) {
      continue
    }

    const extension = path.extname(candidate).toLowerCase()
    if (!TRACKED_ASSET_EXTENSIONS.has(extension)) {
      continue
    }

    assetPaths.add(candidate)
  }

  return Array.from(assetPaths)
}

async function main() {
  await assertDirectoryPopulated(clientDistDir, { label: 'client build output' })
  const indexHtmlPath = path.join(clientDistDir, 'index.html')
  await assertFileExists(indexHtmlPath, { label: 'client entry point' })

  const assetsDir = path.join(clientDistDir, 'assets')
  await assertDirectoryPopulated(assetsDir, { label: 'hashed asset bundle' })

  const indexContents = await readFile(indexHtmlPath, 'utf8')
  const referencedAssetPaths = extractLocalAssetPathsFromIndex(indexContents)

  await Promise.all(
    referencedAssetPaths.map(async (relativePath) => {
      const absolutePath = path.join(clientDistDir, relativePath)
      await assertFileExists(absolutePath, {
        label: `client asset referenced by index.html (${relativePath})`,
      })
    }),
  )

  console.log(`[ensure-client-build] Client assets verified in ${clientDistDir}`)
}

main().catch((error) => {
  console.error(error?.message ?? error)
  process.exitCode = 1
})
