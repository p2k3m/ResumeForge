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

const FUNCTION_BUILD_CONFIG = {
  ResumeForgeFunction: {
    entryPoints: ['lambdas/resumeUpload.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  ClientAppFunction: {
    entryPoints: ['lambdas/clientApp.js'],
    copyClientAssets: true,
    copyTemplates: true,
  },
  JobEvaluationFunction: {
    entryPoints: ['lambdas/jobEvaluation.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  ScoringFunction: {
    entryPoints: ['lambdas/scoring.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveSummaryFunction: {
    entryPoints: ['lambdas/enhancementImproveSummary.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveSkillsFunction: {
    entryPoints: ['lambdas/enhancementImproveSkills.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveDesignationFunction: {
    entryPoints: ['lambdas/enhancementImproveDesignation.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveExperienceFunction: {
    entryPoints: ['lambdas/enhancementImproveExperience.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveCertificationsFunction: {
    entryPoints: ['lambdas/enhancementImproveCertifications.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveProjectsFunction: {
    entryPoints: ['lambdas/enhancementImproveProjects.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveHighlightsFunction: {
    entryPoints: ['lambdas/enhancementImproveHighlights.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveAtsFunction: {
    entryPoints: ['lambdas/enhancementImproveAts.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  EnhancementImproveAllFunction: {
    entryPoints: ['lambdas/enhancementImproveAll.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  DocumentGenerationFunction: {
    entryPoints: ['lambdas/documentGeneration.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  DocumentGenerationWorkerFunction: {
    entryPoints: ['lambdas/documentGenerationWorker.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  WorkflowScoreFunction: {
    entryPoints: ['lambdas/workflowScore.js'],
    copyClientAssets: false,
    copyTemplates: false,
  },
  WorkflowEnhancementSectionFunction: {
    entryPoints: ['lambdas/workflowEnhancementSection.js'],
    copyClientAssets: false,
    copyTemplates: false,
  },
  WorkflowCombineFunction: {
    entryPoints: ['lambdas/workflowCombine.js'],
    copyClientAssets: false,
    copyTemplates: false,
  },
  WorkflowGenerateFunction: {
    entryPoints: ['lambdas/workflowGeneratePdf.js'],
    copyClientAssets: false,
    copyTemplates: false,
  },
  AuditingFunction: {
    entryPoints: ['lambdas/auditing.js'],
    copyClientAssets: false,
    copyTemplates: true,
  },
  CloudFrontLogProcessorFunction: {
    entryPoints: ['lambdas/cloudfrontLogProcessor.js'],
    copyClientAssets: false,
    copyTemplates: false,
  },
}

function parseCliOptions() {
  const defaultOutDir = path.join(projectRoot, 'dist', 'lambda')
  const args = process.argv.slice(2)

  let outDirCandidate = defaultOutDir
  let functionNames

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--outdir' || token === '-o') {
      const value = args[index + 1]
      if (value === undefined) {
        throw new Error('The --outdir option requires a path argument')
      }
      if (!String(value).trim()) {
        throw new Error('The --outdir option requires a non-empty value')
      }
      outDirCandidate = path.isAbsolute(value)
        ? value
        : path.join(projectRoot, value)
      index += 1
      continue
    }

    if (token === '--function' || token === '-f') {
      const value = args[index + 1]
      if (value === undefined) {
        throw new Error('The --function option requires a function identifier')
      }
      const parsed = String(value)
        .split(',')
        .map((fn) => fn.trim())
        .filter(Boolean)
      if (parsed.length === 0) {
        throw new Error('The --function option requires at least one identifier')
      }
      functionNames = parsed
      index += 1
      continue
    }

    throw new Error(
      `Unknown argument: ${token}. Supported options: --outdir <path>, --function <logical id>`
    )
  }

  return { outDir: outDirCandidate, functionNames }
}

const { outDir, functionNames } = parseCliOptions()

function resolveBuildTargets(names) {
  const selectedNames = Array.isArray(names) && names.length > 0
    ? names
    : Object.keys(FUNCTION_BUILD_CONFIG)

  const entryPointSet = new Set()
  let copyClientAssets = false
  let copyTemplates = false

  for (const name of selectedNames) {
    const config = FUNCTION_BUILD_CONFIG[name]
    if (!config) {
      throw new Error(`Unknown Lambda function target: ${name}`)
    }
    for (const relativeEntry of config.entryPoints) {
      const absoluteEntry = path.join(projectRoot, relativeEntry)
      entryPointSet.add(absoluteEntry)
    }
    copyClientAssets = copyClientAssets || Boolean(config.copyClientAssets)
    copyTemplates = copyTemplates || Boolean(config.copyTemplates)
  }

  if (entryPointSet.size === 0) {
    throw new Error('No entry points were resolved for the Lambda build')
  }

  return {
    entryPoints: Array.from(entryPointSet),
    copyClientAssets,
    copyTemplates,
  }
}

const buildTargets = resolveBuildTargets(functionNames)

if (Array.isArray(functionNames) && functionNames.length > 0) {
  console.log(`Building targeted Lambda function(s): ${functionNames.join(', ')}`)
} else {
  console.log('Building all Lambda entry points defined in FUNCTION_BUILD_CONFIG')
}

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
  const shouldGenerateSourceMap = process.env.GENERATE_SOURCEMAP === 'true'

  await build({
    entryPoints: buildTargets.entryPoints,
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

async function copyStaticAssets({ copyTemplates, copyClientAssets }) {
  const copyPairs = []

  if (copyTemplates) {
    copyPairs.push(
      [path.join(projectRoot, 'templates'), path.join(outDir, 'templates')],
      [
        path.join(projectRoot, 'lib', 'pdf', 'templates'),
        path.join(outDir, 'lib', 'pdf', 'templates'),
      ],
    )
  }

  if (copyClientAssets) {
    copyPairs.push([
      path.join(projectRoot, 'client', 'dist'),
      path.join(outDir, 'client', 'dist'),
    ])
  }

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

  if (buildTargets.copyClientAssets) {
    await runClientBuild()
    await writeClientMetadata(buildMetadata)
  } else {
    console.log('Skipping client build; not required for targeted Lambda function(s).')
  }

  if (buildTargets.copyTemplates) {
    await backstopPdfTemplates({ logger: console })
  } else {
    console.log('Skipping PDF template backstop; not required for targeted Lambda function(s).')
  }

  await ensureCleanOutput()
  await runEsbuild()
  await copyStaticAssets({
    copyTemplates: buildTargets.copyTemplates,
    copyClientAssets: buildTargets.copyClientAssets,
  })
  await writeLambdaMetadata(buildMetadata)
  console.log(`Lambda bundle written to ${outDir}`)
}

main().catch((error) => {
  console.error('Failed to build Lambda bundle:', error)
  process.exitCode = 1
})
