#!/usr/bin/env node
import { build } from 'esbuild'
import { fileURLToPath } from 'url'
import path from 'path'
import { mkdir, rm, cp } from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const outDir = path.join(projectRoot, 'dist', 'lambda')

async function ensureCleanOutput() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
}

async function runEsbuild() {
  const entry = path.join(projectRoot, 'lambda.js')
  const outfile = path.join(outDir, 'lambda.mjs')

  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile,
    sourcemap: true,
    minify: true,
    logLevel: 'info',
    external: ['aws-sdk'],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    },
    banner: {
      js: [
        "import { createRequire as __createRequire } from 'module';",
        "const require = __createRequire(import.meta.url);",
      ].join('\n'),
    },
  })
}

async function copyStaticAssets() {
  const copyPairs = [
    [path.join(projectRoot, 'templates'), path.join(outDir, 'templates')],
    [path.join(projectRoot, 'lib', 'pdf', 'templates'), path.join(outDir, 'lib', 'pdf', 'templates')],
  ]

  for (const [source, destination] of copyPairs) {
    try {
      await cp(source, destination, { recursive: true })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue
      }
      throw error
    }
  }
}

async function main() {
  await ensureCleanOutput()
  await runEsbuild()
  await copyStaticAssets()
  console.log(`Lambda bundle written to ${outDir}`)
}

main().catch((error) => {
  console.error('Failed to build Lambda bundle:', error)
  process.exitCode = 1
})
