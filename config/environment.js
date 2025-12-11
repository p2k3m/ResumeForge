import fs from 'fs';
import path from 'path';
import process from 'process';
import dotenv from 'dotenv';
import { applyStageEnvironment } from './stage.js';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const normalizedNodeEnv = hasValue(process.env.NODE_ENV)
  ? process.env.NODE_ENV.trim().toLowerCase()
  : 'development';

const runningInLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const shouldLoadDotEnv = !runningInLambda && (normalizedNodeEnv === 'development' || !hasValue(process.env.NODE_ENV));

if (shouldLoadDotEnv) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const requiredEnvVars = ['S3_BUCKET'];
const optionalEnvHints = ['CLOUDFRONT_ORIGINS'];
const missing = requiredEnvVars.filter((name) => !hasValue(process.env[name]));
optionalEnvHints.forEach((name) => {
  if (!hasValue(process.env[name])) {
    console.warn(
      `Optional environment value ${name} is not set. Provide it via the runtime config file or environment to enable strict CORS.`
    );
  }
});

if (!hasValue(process.env.AWS_REGION) && hasValue(process.env.AWS_DEFAULT_REGION)) {
  process.env.AWS_REGION = process.env.AWS_DEFAULT_REGION.trim();
}

if (!hasValue(process.env.AWS_REGION)) {
  missing.push('AWS_REGION');
}

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. ` +
    'Ensure they are configured via deployment secrets or a local .env file.'
  );
}

const { stageName, deploymentEnvironment } = applyStageEnvironment({
  propagateToProcessEnv: true,
  propagateViteEnv: false,
});

export function getDeploymentEnvironment() {
  return deploymentEnvironment;
}

export function getStageName() {
  return stageName;
}

function mergeTaggingString(existingTagging) {
  const params = new URLSearchParams(existingTagging || '');
  params.set('environment', deploymentEnvironment);
  return params.toString();
}

export function withEnvironmentTagging(commandInput = {}) {
  return {
    ...commandInput,
    Tagging: mergeTaggingString(commandInput.Tagging),
  };
}

export const REQUIRED_ENV_VARS = Object.freeze([...requiredEnvVars, 'AWS_REGION']);

export default {
  getDeploymentEnvironment,
  getStageName,
  withEnvironmentTagging,
  REQUIRED_ENV_VARS,
};
