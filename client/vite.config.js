import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyStageEnvironment } from '../config/stage.js'

function resolveBuildVersion() {
  if (process.env.VITE_BUILD_VERSION) {
    return process.env.VITE_BUILD_VERSION
  }

  if (process.env.BUILD_VERSION) {
    return process.env.BUILD_VERSION
  }

  if (process.env.GIT_COMMIT || process.env.GIT_SHA) {
    return process.env.GIT_COMMIT || process.env.GIT_SHA
  }

  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch (error) {
    console.warn('Unable to determine build version from git', error)
    return 'dev'
  }
}

const stageEnvironment = applyStageEnvironment({
  propagateToProcessEnv: true,
  propagateViteEnv: true,
})

const buildVersion = resolveBuildVersion()

function loadPublishedCloudfrontMetadata() {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const metadataPath = path.resolve(currentDir, '../config/published-cloudfront.json')
    const raw = readFileSync(metadataPath, 'utf8')
    if (!raw) {
      return null
    }

    const trimmed = raw.trim()
    if (!trimmed) {
      return null
    }

    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Unable to load published CloudFront metadata', error)
    }
    return null
  }
}

const publishedCloudfrontMetadata = loadPublishedCloudfrontMetadata()

function serializePublishedCloudfrontMetadata(metadata) {
  const json = JSON.stringify(metadata ?? null)
  if (!json) {
    return 'null'
  }

  const escapeMap = new Map([
    ['<', '\\u003c'],
    ['>', '\\u003e'],
    ['&', '\\u0026'],
  ])

  return json.replace(/[<>&\u2028\u2029]/g, (character) => {
    if (character === '\u2028') {
      return '\\u2028'
    }
    if (character === '\u2029') {
      return '\\u2029'
    }
    return escapeMap.get(character) || character
  })
}

function resolveApiBase(metadata) {
  const normalize = (value) => {
    if (typeof value !== 'string') {
      return ''
    }

    const trimmed = value.trim()
    return trimmed || ''
  }

  const envCandidates = [
    normalize(process.env.VITE_API_BASE_URL),
    normalize(process.env.RESUMEFORGE_API_BASE_URL),
  ]

  for (const candidate of envCandidates) {
    if (candidate) {
      return candidate
    }
  }

  if (metadata && typeof metadata === 'object') {
    const metadataCandidates = [
      normalize(metadata.apiGatewayUrl),
      normalize(metadata.url),
    ]

    for (const candidate of metadataCandidates) {
      if (candidate) {
        return candidate
      }
    }
  }

  return ''
}

const resolvedApiBase = resolveApiBase(publishedCloudfrontMetadata)

process.env.VITE_API_BASE_URL = resolvedApiBase
process.env.VITE_PUBLISHED_CLOUDFRONT_METADATA = serializePublishedCloudfrontMetadata(
  publishedCloudfrontMetadata,
)

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    manifest: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
    __STAGE_NAME__: JSON.stringify(stageEnvironment.stageName),
    __DEPLOYMENT_ENVIRONMENT__: JSON.stringify(stageEnvironment.deploymentEnvironment),
    __DATA_BUCKET_NAME__: JSON.stringify(stageEnvironment.dataBucket || ''),
    __STATIC_ASSETS_BUCKET_NAME__: JSON.stringify(stageEnvironment.staticAssetsBucket || ''),
    __PUBLISHED_CLOUDFRONT_METADATA__: JSON.stringify(publishedCloudfrontMetadata),
  },
})
