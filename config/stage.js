import process from 'node:process';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveNodeEnvStage() {
  const normalizedNodeEnv = normalize(process.env.NODE_ENV).toLowerCase();
  if (!normalizedNodeEnv) {
    return '';
  }
  if (normalizedNodeEnv === 'development' || normalizedNodeEnv === 'dev') {
    return 'dev';
  }
  if (normalizedNodeEnv === 'production' || normalizedNodeEnv === 'prod') {
    return 'prod';
  }
  if (normalizedNodeEnv === 'test') {
    return 'test';
  }
  return normalizedNodeEnv;
}

export function resolveStageName() {
  if (hasValue(process.env.STAGE_NAME)) {
    return normalize(process.env.STAGE_NAME);
  }
  if (hasValue(process.env.DEPLOYMENT_ENVIRONMENT)) {
    return normalize(process.env.DEPLOYMENT_ENVIRONMENT);
  }
  const fromNodeEnv = resolveNodeEnvStage();
  if (fromNodeEnv) {
    return fromNodeEnv;
  }
  return 'dev';
}

export function resolveDeploymentEnvironment({ stageName } = {}) {
  if (hasValue(process.env.DEPLOYMENT_ENVIRONMENT)) {
    return normalize(process.env.DEPLOYMENT_ENVIRONMENT);
  }
  const resolvedStage = hasValue(stageName) ? normalize(stageName) : resolveStageName();
  if (resolvedStage) {
    return resolvedStage;
  }
  return 'dev';
}

export function resolveDataBucketName() {
  if (hasValue(process.env.DATA_BUCKET)) {
    return normalize(process.env.DATA_BUCKET);
  }
  if (hasValue(process.env.S3_BUCKET)) {
    return normalize(process.env.S3_BUCKET);
  }
  return '';
}

export function resolveStaticAssetsBucketName({ dataBucket } = {}) {
  if (hasValue(process.env.STATIC_ASSETS_BUCKET)) {
    return normalize(process.env.STATIC_ASSETS_BUCKET);
  }
  if (hasValue(dataBucket)) {
    return normalize(dataBucket);
  }
  const resolvedDataBucket = resolveDataBucketName();
  if (resolvedDataBucket) {
    return resolvedDataBucket;
  }
  return '';
}

export function resolveLogsBucketName() {
  if (hasValue(process.env.LOGS_BUCKET)) {
    return normalize(process.env.LOGS_BUCKET);
  }
  return '';
}

function assignEnv(name, value) {
  if (typeof name !== 'string') {
    return;
  }
  if (hasValue(value)) {
    process.env[name] = normalize(value);
  }
}

export function applyStageEnvironment({ propagateToProcessEnv = true, propagateViteEnv = false } = {}) {
  const stageName = resolveStageName();
  const deploymentEnvironment = resolveDeploymentEnvironment({ stageName });
  const dataBucket = resolveDataBucketName();
  const staticAssetsBucket = resolveStaticAssetsBucketName({ dataBucket });
  const logsBucket = resolveLogsBucketName();

  if (propagateToProcessEnv) {
    assignEnv('STAGE_NAME', stageName);
    assignEnv('DEPLOYMENT_ENVIRONMENT', deploymentEnvironment);
    if (hasValue(dataBucket)) {
      assignEnv('S3_BUCKET', dataBucket);
    }
    if (hasValue(staticAssetsBucket)) {
      assignEnv('STATIC_ASSETS_BUCKET', staticAssetsBucket);
    }
    if (hasValue(logsBucket)) {
      assignEnv('LOGS_BUCKET', logsBucket);
    }
  }

  if (propagateViteEnv) {
    assignEnv('VITE_STAGE_NAME', stageName);
    assignEnv('VITE_DEPLOYMENT_ENVIRONMENT', deploymentEnvironment);
    if (hasValue(dataBucket)) {
      assignEnv('VITE_S3_BUCKET', dataBucket);
      assignEnv('VITE_DATA_BUCKET', dataBucket);
    }
    if (hasValue(staticAssetsBucket)) {
      assignEnv('VITE_STATIC_ASSETS_BUCKET', staticAssetsBucket);
    }
    if (hasValue(logsBucket)) {
      assignEnv('VITE_LOGS_BUCKET', logsBucket);
    }
  }

  return {
    stageName,
    deploymentEnvironment,
    dataBucket,
    staticAssetsBucket,
    logsBucket,
  };
}

export function getStageEnvironment() {
  const stageName = resolveStageName();
  const deploymentEnvironment = resolveDeploymentEnvironment({ stageName });
  const dataBucket = resolveDataBucketName();
  const staticAssetsBucket = resolveStaticAssetsBucketName({ dataBucket });
  const logsBucket = resolveLogsBucketName();

  return Object.freeze({
    stageName,
    deploymentEnvironment,
    dataBucket,
    staticAssetsBucket,
    logsBucket,
  });
}

export default {
  applyStageEnvironment,
  getStageEnvironment,
  resolveStageName,
  resolveDeploymentEnvironment,
  resolveDataBucketName,
  resolveStaticAssetsBucketName,
  resolveLogsBucketName,
};
