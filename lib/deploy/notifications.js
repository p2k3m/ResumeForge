import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { getStageEnvironment } from '../../config/stage.js';

const DEPLOY_NOTIFICATION_ENV_VARS = [
  'DEPLOY_NOTIFICATION_TOPIC_ARN',
  'DEPLOY_ALERTS_TOPIC_ARN',
];

const CLASSIFICATION_RULES = Object.freeze([
  {
    type: 'missing_client_assets',
    severity: 'error',
    patterns: [
      /client_build_missing/i,
      /client assets could not be located/i,
      /\[ensure-client-build]/i,
      /\[ensure-client-build] Missing client asset referenced by index\.html/i,
      /\[upload-static] Missing required (?:file|directory).*client[\\/\\\s-]*dist/i,
      /Missing required (?:file|directory).*client[\\/\\\s-]*dist/i,
      /client[\\/\\\s-]*dist[^\n]*is empty/i,
    ],
  },
  {
    type: 'static_upload_incomplete',
    severity: 'error',
    patterns: [
      /\[upload-static] Missing required index alias bundle/i,
      /\[upload-static] Missing required index alias bundles/i,
      /\[upload-static] index\.html does not reference/i,
      /\[upload-static] index\.html is empty/i,
      /\[upload-static] index\.html must reference/i,
      /\[upload-static] index\.html must include/i,
      /\[upload-static] Verified asset not found/i,
      /\[upload-static] Failed to verify uploaded asset/i,
      /\[upload-static] Manifest .* does not list any uploaded files/i,
      /\[upload-static] Manifest .* must include hashed index/i,
      /\[upload-static] Manifest .* is empty/i,
      /\[upload-static] Manifest .* contains invalid JSON/i,
      /\[upload-static] Manifest .* fileCount .* does not match/i,
      /\[verify-static]/i,
      /\[upload-hashed-assets]/i,
      /No hashed index assets were referenced/i,
      /Missing hashed index asset/i,
      /Missing hashed index assets/i,
    ],
  },
]);

let cachedTopicArn = null;
let snsClient = null;

function resolveTopicArn() {
  if (cachedTopicArn !== null) {
    return cachedTopicArn;
  }

  for (const envVar of DEPLOY_NOTIFICATION_ENV_VARS) {
    const value = process.env[envVar];
    if (typeof value === 'string' && value.trim()) {
      cachedTopicArn = value.trim();
      return cachedTopicArn;
    }
  }

  cachedTopicArn = '';
  return cachedTopicArn;
}

function getSnsClient() {
  if (snsClient) {
    return snsClient;
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || undefined;
  snsClient = new SNSClient(region ? { region } : {});
  return snsClient;
}

function extractErrorMessage(error) {
  if (!error) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }
    return error.toString();
  }
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function truncateSubject(subject) {
  if (typeof subject !== 'string') {
    return '';
  }
  return subject.length > 100 ? `${subject.slice(0, 97)}...` : subject;
}

function buildSubject({ type, severity, stageName, deploymentEnvironment }) {
  const envLabel = deploymentEnvironment || stageName || 'unknown';
  const normalizedType = typeof type === 'string' && type.trim() ? type.trim().replace(/_/g, ' ') : 'deploy issue';
  const severityLabel = typeof severity === 'string' && severity.trim() ? severity.trim().toUpperCase() : 'INFO';
  const base = `ResumeForge deploy alert [${envLabel}] ${severityLabel}: ${normalizedType}`;
  return truncateSubject(base);
}

function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      sanitized[key] = null;
      continue;
    }
    if (value instanceof Date) {
      sanitized[key] = value.toISOString();
      continue;
    }
    if (typeof value === 'object') {
      try {
        sanitized[key] = JSON.parse(JSON.stringify(value));
      } catch {
        sanitized[key] = String(value);
      }
      continue;
    }
    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function classifyDeployFailure(error) {
  const message = extractErrorMessage(error);
  if (!message) {
    return null;
  }

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(message)) {
        return {
          type: rule.type,
          severity: rule.severity,
          reason: message,
          matchedPattern: pattern.source,
        };
      }
    }
  }

  return null;
}

export function isDeployNotificationConfigured() {
  return Boolean(resolveTopicArn());
}

export async function publishDeployNotification({
  type,
  severity = 'info',
  message = '',
  details = undefined,
} = {}) {
  const topicArn = resolveTopicArn();
  if (!topicArn) {
    return false;
  }

  const stageContext = getStageEnvironment();
  const payload = {
    type,
    severity,
    message,
    timestamp: new Date().toISOString(),
  };

  if (stageContext?.stageName) {
    payload.stageName = stageContext.stageName;
  }
  if (stageContext?.deploymentEnvironment) {
    payload.deploymentEnvironment = stageContext.deploymentEnvironment;
  }

  const sanitizedDetails = sanitizeDetails(details);
  if (sanitizedDetails) {
    payload.details = sanitizedDetails;
  }

  const command = new PublishCommand({
    TopicArn: topicArn,
    Subject: buildSubject({
      type,
      severity,
      stageName: stageContext?.stageName,
      deploymentEnvironment: stageContext?.deploymentEnvironment,
    }),
    Message: JSON.stringify(payload, null, 2),
  });

  try {
    await getSnsClient().send(command);
    return true;
  } catch (error) {
    console.error('Failed to publish deploy notification', {
      error,
      type,
      severity,
    });
    return false;
  }
}

export async function notifyMissingClientAssets(details = {}) {
  const message =
    typeof details.message === 'string' && details.message.trim()
      ? details.message.trim()
      : 'ResumeForge could not locate the compiled client bundle for this deployment. Redeploy the client/dist artifacts to restore the UI.';
  const mergedDetails = { ...details, category: 'missing_client_assets' };
  return publishDeployNotification({
    type: 'missing_client_assets',
    severity: 'error',
    message,
    details: mergedDetails,
  });
}

export async function notifyIncompleteStaticUpload(details = {}) {
  const message =
    typeof details.message === 'string' && details.message.trim()
      ? details.message.trim()
      : 'The static asset upload failed verification. Some build artifacts are missing from the deployment prefix.';
  const mergedDetails = { ...details, category: 'static_upload_incomplete' };
  return publishDeployNotification({
    type: 'static_upload_incomplete',
    severity: 'error',
    message,
    details: mergedDetails,
  });
}

