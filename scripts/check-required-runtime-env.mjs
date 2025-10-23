#!/usr/bin/env node
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import process from 'process'

const DEFAULT_REQUIRED_ENV_VARS = Object.freeze(['GEMINI_API_KEY'])

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function parseRequiredEnvList(value) {
  if (!hasValue(value)) {
    return []
  }
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolveSecretName() {
  const candidates = [
    process.env.RUNTIME_CONFIG_SECRET_NAME,
    process.env.SECRET_NAME,
    process.env.RESUMEFORGE_SECRET_NAME,
    process.argv[2],
  ]

  for (const candidate of candidates) {
    if (hasValue(candidate)) {
      return candidate.trim()
    }
  }

  return null
}

async function loadSecretPayload(secretName) {
  const client = new SecretsManagerClient({})
  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    )

    const secretString = hasValue(response?.SecretString)
      ? response.SecretString.trim()
      : null

    if (secretString) {
      try {
        const parsed = JSON.parse(secretString)
        if (parsed && typeof parsed === 'object') {
          return parsed
        }
      } catch (err) {
        if (hasValue(secretString)) {
          return { GEMINI_API_KEY: secretString }
        }
        throw err
      }
    }

    if (response?.SecretBinary) {
      const decoded = Buffer.from(response.SecretBinary, 'base64').toString('utf8').trim()
      if (decoded) {
        try {
          const parsed = JSON.parse(decoded)
          if (parsed && typeof parsed === 'object') {
            return parsed
          }
        } catch (err) {
          return { GEMINI_API_KEY: decoded }
        }
      }
    }

    return {}
  } catch (err) {
    if (err?.name === 'ResourceNotFoundException') {
      throw new Error(
        `Runtime configuration secret "${secretName}" was not found in AWS Secrets Manager. ` +
          'Create the secret or provide the required environment variables directly before deploying.'
      )
    }

    if (err?.name === 'AccessDeniedException') {
      throw new Error(
        `Unable to access runtime configuration secret "${secretName}". ` +
          'Ensure the deployment credentials have permissions for secretsmanager:GetSecretValue.'
      )
    }

    throw err
  }
}

async function main() {
  const requiredEnvVars = parseRequiredEnvList(process.env.REQUIRED_RUNTIME_ENV_VARS)
  const required = requiredEnvVars.length ? requiredEnvVars : DEFAULT_REQUIRED_ENV_VARS

  const missing = new Set()
  for (const name of required) {
    if (!hasValue(process.env[name])) {
      missing.add(name)
    }
  }

  if (missing.size === 0) {
    console.log('All required runtime environment variables are present in the environment.')
    return
  }

  const secretName = resolveSecretName()
  if (!secretName) {
    throw new Error(
      `Missing required runtime environment variables: ${Array.from(missing).join(', ')}. ` +
        'Provide them via environment variables or supply a runtime configuration secret.'
    )
  }

  const secretPayload = await loadSecretPayload(secretName)
  const stillMissing = []

  for (const name of missing) {
    const secretValue = secretPayload?.[name]
    if (!hasValue(secretValue)) {
      stillMissing.push(name)
    }
  }

  if (stillMissing.length > 0) {
    throw new Error(
      `Runtime configuration secret "${secretName}" is missing required keys: ${stillMissing.join(', ')}. ` +
        'Add the missing entries or provide them via environment variables before deploying.'
    )
  }

  console.log(
    `All required runtime environment variables resolved successfully from secret "${secretName}".`
  )
}

main().catch((err) => {
  if (err) {
    console.error(err.message || err)
  }
  process.exitCode = 1
})
