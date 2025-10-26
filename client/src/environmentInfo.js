/* global __STAGE_NAME__, __DEPLOYMENT_ENVIRONMENT__, __DATA_BUCKET_NAME__, __STATIC_ASSETS_BUCKET_NAME__ */

function sanitize(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readDefineStage() {
  try {
    if (typeof __STAGE_NAME__ !== 'undefined') {
      return sanitize(__STAGE_NAME__)
    }
  } catch (error) {
    // Ignore reference errors when the define is not injected.
  }
  return ''
}

function readDefineDeploymentEnvironment() {
  try {
    if (typeof __DEPLOYMENT_ENVIRONMENT__ !== 'undefined') {
      return sanitize(__DEPLOYMENT_ENVIRONMENT__)
    }
  } catch (error) {
    // Ignore reference errors when the define is not injected.
  }
  return ''
}

function readDefineDataBucket() {
  try {
    if (typeof __DATA_BUCKET_NAME__ !== 'undefined') {
      return sanitize(__DATA_BUCKET_NAME__)
    }
  } catch (error) {
    // Ignore reference errors when the define is not injected.
  }
  return ''
}

function readDefineStaticAssetsBucket() {
  try {
    if (typeof __STATIC_ASSETS_BUCKET_NAME__ !== 'undefined') {
      return sanitize(__STATIC_ASSETS_BUCKET_NAME__)
    }
  } catch (error) {
    // Ignore reference errors when the define is not injected.
  }
  return ''
}

function readImportMetaEnv(name) {
  if (typeof import.meta !== 'undefined' && import.meta.env && name in import.meta.env) {
    return sanitize(import.meta.env[name])
  }
  return ''
}

function readProcessEnv(name) {
  if (typeof process !== 'undefined' && process.env && typeof process.env[name] === 'string') {
    return sanitize(process.env[name])
  }
  return ''
}

function pickValue(readers, fallback = '') {
  for (const reader of readers) {
    const value = reader()
    if (value) {
      return value
    }
  }
  return fallback
}

export function getStageName() {
  return (
    pickValue(
      [
        readDefineStage,
        () => readImportMetaEnv('VITE_STAGE_NAME'),
        () => readProcessEnv('VITE_STAGE_NAME'),
        () => readProcessEnv('STAGE_NAME'),
        () => readProcessEnv('DEPLOYMENT_ENVIRONMENT'),
      ],
      'dev',
    )
  )
}

export function getDeploymentEnvironment() {
  return pickValue(
    [
      readDefineDeploymentEnvironment,
      () => readImportMetaEnv('VITE_DEPLOYMENT_ENVIRONMENT'),
      () => readProcessEnv('VITE_DEPLOYMENT_ENVIRONMENT'),
      getStageName,
    ],
    'dev',
  )
}

export function getDataBucketName() {
  return pickValue(
    [
      readDefineDataBucket,
      () => readImportMetaEnv('VITE_DATA_BUCKET'),
      () => readProcessEnv('VITE_DATA_BUCKET'),
      () => readProcessEnv('S3_BUCKET'),
      () => readProcessEnv('DATA_BUCKET'),
    ],
    '',
  )
}

export function getStaticAssetsBucketName() {
  return pickValue(
    [
      readDefineStaticAssetsBucket,
      () => readImportMetaEnv('VITE_STATIC_ASSETS_BUCKET'),
      () => readProcessEnv('VITE_STATIC_ASSETS_BUCKET'),
      () => readProcessEnv('STATIC_ASSETS_BUCKET'),
      getDataBucketName,
    ],
    '',
  )
}

export const STAGE_NAME = getStageName()
export const DEPLOYMENT_ENVIRONMENT = getDeploymentEnvironment()
export const DATA_BUCKET_NAME = getDataBucketName()
export const STATIC_ASSETS_BUCKET_NAME = getStaticAssetsBucketName()

export default {
  getStageName,
  getDeploymentEnvironment,
  getDataBucketName,
  getStaticAssetsBucketName,
  STAGE_NAME,
  DEPLOYMENT_ENVIRONMENT,
  DATA_BUCKET_NAME,
  STATIC_ASSETS_BUCKET_NAME,
}
