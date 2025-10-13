#!/usr/bin/env node
import { build } from 'esbuild'
import { fileURLToPath } from 'url'
import path from 'path'
import { mkdir, rm, cp, writeFile } from 'fs/promises'
import { spawn, execFile } from 'child_process'
import { backstopPdfTemplates } from './pdf-template-backstop.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
function resolveOutDir() {
  const defaultOutDir = path.join(projectRoot, 'dist', 'lambda')
  const args = process.argv.slice(2)

  if (args.length === 0) {
    return defaultOutDir
  }

  let outDirFromArgs
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--outdir' || token === '-o') {
      outDirFromArgs = args[index + 1]
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${token}. Supported option: --outdir <path>`)
  }

  if (!outDirFromArgs) {
    return defaultOutDir
  }

  if (outDirFromArgs === undefined) {
    throw new Error('The --outdir option requires a path argument')
  }

  if (!outDirFromArgs.trim()) {
    throw new Error('The --outdir option requires a non-empty value')
  }

  const resolved = path.isAbsolute(outDirFromArgs)
    ? outDirFromArgs
    : path.join(projectRoot, outDirFromArgs)

  return resolved
}

const outDir = resolveOutDir()

function execFileAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }

      resolve({ stdout, stderr })
    })
  })
}

async function resolveGitSha() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot })
    return stdout.trim()
  } catch (error) {
    const message = error?.message || 'Unknown error'
    console.warn(`Unable to determine git SHA for build metadata (${message}).`)
    return 'unknown'
  }
}

async function writeMetadataFile(destination, metadata) {
  const payload = `${JSON.stringify(metadata, null, 2)}\n`
  await writeFile(destination, payload)
}

async function writeClientMetadata(metadata) {
  const clientDistDir = path.join(projectRoot, 'client', 'dist')
  const clientMetadataPath = path.join(clientDistDir, 'build-info.json')

  try {
    await writeMetadataFile(clientMetadataPath, metadata)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn('Client dist directory missing; skipping client build metadata generation.')
      return
    }
    throw error
  }
}

async function writeLambdaMetadata(metadata) {
  const lambdaMetadataPath = path.join(outDir, 'build-info.json')
  await writeMetadataFile(lambdaMetadataPath, metadata)
}

async function runClientBuild() {
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build', '--prefix', 'client'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`Client build failed with exit code ${code}`))
    })
  })
}

async function ensureCleanOutput() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
}

async function runEsbuild() {
  const entryPoints = [
    path.join(projectRoot, 'lambdas', 'clientApp.js'),
    path.join(projectRoot, 'lambdas', 'resumeUpload.js'),
    path.join(projectRoot, 'lambdas', 'jobEvaluation.js'),
    path.join(projectRoot, 'lambdas', 'scoring.js'),
    path.join(projectRoot, 'lambdas', 'enhancement.js'),
    path.join(projectRoot, 'lambdas', 'documentGeneration.js'),
    path.join(projectRoot, 'lambdas', 'documentGenerationWorker.js'),
    path.join(projectRoot, 'lambdas', 'auditing.js'),
  ]
  const shouldGenerateSourceMap = process.env.GENERATE_SOURCEMAP === 'true'

  await build({
    entryPoints,
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outdir: outDir,
    outbase: projectRoot,
    sourcemap: shouldGenerateSourceMap,
    minify: true,
    logLevel: 'info',
    external: ['aws-sdk'],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    },
    banner: {
      js: [
        "import { createRequire as __createRequire } from 'module';",
        "import { fileURLToPath as __fileURLToPath } from 'url';",
        "import path from 'path';",
        "const require = __createRequire(import.meta.url);",
        "const __filename = __fileURLToPath(import.meta.url);",
        "const __dirname = path.dirname(__filename);",
        "globalThis.__filename = globalThis.__filename || __filename;",
        "globalThis.__dirname = globalThis.__dirname || __dirname;",
      ].join('\n'),
    },
    outExtension: {
      '.js': '.mjs',
    },
  })
}

async function copyStaticAssets() {
  const copyPairs = [
    [path.join(projectRoot, 'templates'), path.join(outDir, 'templates')],
    [path.join(projectRoot, 'lib', 'pdf', 'templates'), path.join(outDir, 'lib', 'pdf', 'templates')],
    [path.join(projectRoot, 'client', 'dist'), path.join(outDir, 'client', 'dist')],
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
  const gitSha = await resolveGitSha()
  const buildMetadata = {
    gitSha,
    gitShortSha: gitSha === 'unknown' ? 'unknown' : gitSha.slice(0, 7),
    builtAt: new Date().toISOString(),
  }

  await runClientBuild()
  await writeClientMetadata(buildMetadata)
  await backstopPdfTemplates({ logger: console })
  await ensureCleanOutput()
  await runEsbuild()
  await copyStaticAssets()
  await writeLambdaMetadata(buildMetadata)
  console.log(`Lambda bundle written to ${outDir}`)
}

main().catch((error) => {
  console.error('Failed to build Lambda bundle:', error)
  process.exitCode = 1
})
