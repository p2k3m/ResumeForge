import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

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

const buildVersion = resolveBuildVersion()

export default defineConfig({
  plugins: [react()],
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
  },
})
