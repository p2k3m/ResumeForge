import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyStageEnvironment } from '../config/stage.js'

const resolvedApiBase =
  typeof process.env.VITE_API_BASE_URL === 'string'
    ? process.env.VITE_API_BASE_URL
    : process.env.RESUMEFORGE_API_BASE_URL

if (typeof process.env.VITE_API_BASE_URL === 'undefined') {
  process.env.VITE_API_BASE_URL = resolvedApiBase || ''
}

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
