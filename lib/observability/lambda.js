import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { logEvent, logErrorTrace } from '../../logger.js';
import { withEnvironmentTagging } from '../../config/environment.js';

const awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || undefined;
const cloudWatchClient = awsRegion
  ? new CloudWatchClient({ region: awsRegion })
  : null;
const s3Client = awsRegion ? new S3Client({ region: awsRegion }) : null;

const metricsNamespace = process.env.METRICS_NAMESPACE || 'ResumeForge/Operations';
const artifactNamespace = process.env.ARTIFACT_METRICS_NAMESPACE || 'ResumeForge/Artifacts';
const changeLogPrefix = process.env.SESSION_CHANGE_LOG_PREFIX || 'logs/sessions/';
const errorTracePrefix = process.env.LAMBDA_ERROR_TRACE_PREFIX || 'logs/errors/';
const artifactFailurePrefix = process.env.ARTIFACT_FAILURE_LOG_PREFIX || 'logs/artifact-failures/';
const logBucket = process.env.LOGS_BUCKET || process.env.S3_BUCKET || '';
const stageName = process.env.STAGE_NAME || process.env.DEPLOYMENT_ENVIRONMENT || 'prod';

const DEFAULT_HTTP_ERROR_HEADERS = Object.freeze({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
});

const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.';
const CLIENT_ERROR_MESSAGE = 'The request could not be completed.';

function resolveRequestId(event = {}, context = {}) {
  return (
    event?.requestContext?.requestId ||
    event?.headers?.['x-amzn-requestid'] ||
    event?.headers?.['x-amzn-request-id'] ||
    context?.awsRequestId ||
    randomUUID()
  );
}

function resolveSessionIdentifier(event = {}) {
  if (!event || typeof event !== 'object') {
    return '';
  }

  if (typeof event.sessionId === 'string' && event.sessionId.trim()) {
    return event.sessionId.trim();
  }
  if (typeof event.jobId === 'string' && event.jobId.trim()) {
    return event.jobId.trim();
  }
  if (typeof event.detail === 'object' && event.detail) {
    const detail = event.detail;
    if (typeof detail.sessionId === 'string' && detail.sessionId.trim()) {
      return detail.sessionId.trim();
    }
    if (typeof detail.jobId === 'string' && detail.jobId.trim()) {
      return detail.jobId.trim();
    }
  }
  if (Array.isArray(event.Records) && event.Records.length > 0) {
    const record = event.Records[0];
    if (record && typeof record.body === 'string') {
      try {
        const payload = JSON.parse(record.body);
        if (payload && typeof payload === 'object') {
          if (typeof payload.sessionId === 'string' && payload.sessionId.trim()) {
            return payload.sessionId.trim();
          }
          if (typeof payload.jobId === 'string' && payload.jobId.trim()) {
            return payload.jobId.trim();
          }
          if (
            payload.payload &&
            typeof payload.payload === 'object' &&
            typeof payload.payload.jobId === 'string' &&
            payload.payload.jobId.trim()
          ) {
            return payload.payload.jobId.trim();
          }
        }
      } catch {
        // ignore JSON parse errors
      }
    }
  }
  return '';
}

function sanitizeLogKeySegment(value = '') {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function resolveSessionLogKey(sessionId, requestId) {
  const id = sessionId || requestId;
  if (!id) {
    return '';
  }
  const safeId = sanitizeLogKeySegment(id);
  const prefix = changeLogPrefix.endsWith('/') ? changeLogPrefix : `${changeLogPrefix}/`;
  return `${prefix}${safeId}.jsonl`;
}

function extractRequestMetadata(event = {}) {
  if (event?.requestContext?.http) {
    return {
      type: 'http',
      method: event.requestContext.http.method,
      path: event.requestContext.http.path,
      protocol: event.requestContext.http.protocol,
      sourceIp: event.requestContext.http.sourceIp,
      userAgent: event.requestContext.http.userAgent,
    };
  }
  if (typeof event.httpMethod === 'string' && typeof event.path === 'string') {
    return {
      type: 'http-legacy',
      method: event.httpMethod,
      path: event.path,
    };
  }
  if (Array.isArray(event.Records)) {
    return {
      type: 'records',
      recordCount: event.Records.length,
      sources: Array.from(
        new Set(
          event.Records
            .map((record) => record.eventSource || record.EventSource || record.source)
            .filter(Boolean)
        )
      ),
    };
  }
  if (event?.detailType || event?.source) {
    return {
      type: 'event-bridge',
      detailType: event.detailType,
      source: event.source,
    };
  }
  if (event?.source === 'aws.states') {
    return {
      type: 'step-functions',
    };
  }
  return {
    type: typeof event,
  };
}

function isApiGatewayHttpEvent(event = {}) {
  if (!event || typeof event !== 'object') {
    return false;
  }

  if (typeof event.httpMethod === 'string') {
    return true;
  }

  if (event?.requestContext?.http && typeof event.requestContext.http.method === 'string') {
    return true;
  }

  if (
    typeof event.version === 'string' &&
    event.version.startsWith('2') &&
    (typeof event.rawPath === 'string' || typeof event.routeKey === 'string')
  ) {
    return true;
  }

  if (typeof event.rawPath === 'string' && typeof event.requestContext === 'object') {
    return true;
  }

  if (typeof event.resource === 'string' && typeof event.path === 'string') {
    return true;
  }

  return false;
}

function resolveHttpErrorStatus(error) {
  const candidates = [
    error?.statusCode,
    error?.status,
    error?.httpStatus,
    error?.response?.status,
    error?.output?.statusCode,
  ];

  const status = candidates.find(
    (value) => Number.isInteger(value) && value >= 400 && value <= 599
  );

  return status ?? 500;
}

function resolveHttpErrorCode(error, status) {
  if (typeof error?.code === 'string' && error.code.trim()) {
    return error.code.trim();
  }

  return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
}

function resolveHttpErrorMessage(error, status) {
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return status >= 500 ? INTERNAL_ERROR_MESSAGE : CLIENT_ERROR_MESSAGE;
}

function resolveHttpErrorDetails(error) {
  if (error?.details !== undefined) {
    return error.details;
  }
  if (error?.errors !== undefined) {
    return error.errors;
  }
  if (error?.data !== undefined) {
    return error.data;
  }
  if (error?.response?.data !== undefined) {
    return error.response.data;
  }
  return undefined;
}

function normalizeHttpErrorHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return { ...DEFAULT_HTTP_ERROR_HEADERS };
  }

  return {
    ...DEFAULT_HTTP_ERROR_HEADERS,
    ...headers,
  };
}

function buildHttpErrorResponse(error, { requestId } = {}) {
  const statusCode = resolveHttpErrorStatus(error);
  const code = resolveHttpErrorCode(error, statusCode);
  const message = resolveHttpErrorMessage(error, statusCode);
  const details = resolveHttpErrorDetails(error);

  const bodyPayload = {
    success: false,
    code,
    message,
    ...(details !== undefined ? { details } : {}),
    ...(requestId ? { requestId } : {}),
  };

  let body;

  if (typeof error?.body === 'string') {
    body = error.body;
  } else if (error?.body && typeof error.body === 'object') {
    try {
      body = JSON.stringify(error.body);
    } catch {
      body = JSON.stringify(bodyPayload);
    }
  } else {
    body = JSON.stringify(bodyPayload);
  }

  return {
    statusCode,
    headers: normalizeHttpErrorHeaders(error?.headers),
    body,
    isBase64Encoded: Boolean(error?.isBase64Encoded && body === error?.body),
  };
}

async function publishMetrics({
  functionName,
  durationMs,
  success,
  coldStart,
  operationGroup,
}) {
  if (!cloudWatchClient || !awsRegion) {
    return;
  }

  const timestamp = new Date();
  const dimensions = [
    { Name: 'FunctionName', Value: functionName },
    { Name: 'Stage', Value: stageName },
  ];
  if (operationGroup) {
    dimensions.push({ Name: 'Operation', Value: operationGroup });
  }

  const metricData = [
    {
      MetricName: 'InvocationDuration',
      Dimensions: dimensions,
      Timestamp: timestamp,
      Unit: 'Milliseconds',
      Value: durationMs,
    },
    {
      MetricName: 'InvocationCount',
      Dimensions: [...dimensions, { Name: 'Status', Value: success ? 'Success' : 'Failure' }],
      Timestamp: timestamp,
      Unit: 'Count',
      Value: 1,
    },
  ];

  if (coldStart) {
    metricData.push({
      MetricName: 'ColdStart',
      Dimensions: dimensions,
      Timestamp: timestamp,
      Unit: 'Count',
      Value: 1,
    });
  }

  try {
    await cloudWatchClient.send(
      new PutMetricDataCommand({
        Namespace: metricsNamespace,
        MetricData: metricData,
      })
    );
  } catch (err) {
    console.warn('Failed to publish lambda metrics', {
      functionName,
      stage: stageName,
      errorMessage: err?.message,
    });
  }

  if (!operationGroup) {
    return;
  }

  const operationMetricName = success ? 'Success' : 'Failure';
  const operationMetricData = [
    {
      MetricName: `${operationGroup.replace(/-/g, ' ').replace(/\s+/g, '')}${operationMetricName}`,
      Dimensions: [
        { Name: 'Operation', Value: operationGroup },
        { Name: 'Stage', Value: stageName },
      ],
      Timestamp: timestamp,
      Unit: 'Count',
      Value: 1,
    },
  ];

  try {
    await cloudWatchClient.send(
      new PutMetricDataCommand({
        Namespace: artifactNamespace,
        MetricData: operationMetricData,
      })
    );
  } catch (err) {
    console.warn('Failed to publish artifact metrics', {
      operationGroup,
      stage: stageName,
      errorMessage: err?.message,
    });
  }
}

async function appendSessionLog({
  sessionId,
  requestId,
  jobId,
  event,
  metadata,
}) {
  if (!s3Client || !logBucket) {
    return;
  }

  const key = resolveSessionLogKey(sessionId, requestId);
  if (!key) {
    return;
  }

  try {
    await logEvent({
      s3: s3Client,
      bucket: logBucket,
      key,
      jobId: jobId || sessionId || requestId,
      event,
      metadata: withEnvironmentTagging({
        ...metadata,
        stage: stageName,
      }),
    });
  } catch (err) {
    console.warn('Failed to append session change log', {
      key,
      bucket: logBucket,
      event,
      errorMessage: err?.message,
    });
  }
}

async function writeFailureTrace({
  error,
  requestId,
  sessionId,
  jobId,
  functionName,
  operationGroup,
  metadata,
  prefix,
}) {
  if (!s3Client || !logBucket || !error) {
    return;
  }

  const entry = {
    requestId,
    sessionId,
    jobId,
    functionName,
    operationGroup,
    message: error.message,
    stack: error.stack,
    metadata,
  };

  try {
    await logErrorTrace({
      s3: s3Client,
      bucket: logBucket,
      entry,
      prefix,
    });
  } catch (err) {
    console.warn('Failed to upload lambda error trace', {
      functionName,
      bucket: logBucket,
      errorMessage: err?.message,
    });
  }
}

export function withLambdaObservability(handler, {
  name = 'lambda-function',
  operationGroup,
  captureErrorTrace = false,
} = {}) {
  if (typeof handler !== 'function') {
    throw new TypeError('withLambdaObservability expects a handler function.');
  }

  let coldStart = true;

  return async function observableHandler(event, context) {
    const functionName = context?.functionName || name;
    const requestId = resolveRequestId(event, context);
    const sessionId = resolveSessionIdentifier(event);
    const jobId = typeof event?.jobId === 'string' ? event.jobId : '';
    const invocationId = randomUUID();
    const requestMetadata = extractRequestMetadata(event);

    console.info('Lambda invocation started', {
      invocationId,
      functionName,
      requestId,
      sessionId,
      jobId,
      coldStart,
      operationGroup,
      requestMetadata,
    });

    await appendSessionLog({
      sessionId,
      requestId,
      jobId,
      event: 'lambda_invocation_started',
      metadata: {
        invocationId,
        functionName,
        operationGroup,
        coldStart,
        requestMetadata,
      },
    });

    const startedAt = Date.now();

    try {
      const result = await handler(event, context);
      const durationMs = Date.now() - startedAt;

      console.info('Lambda invocation completed', {
        invocationId,
        functionName,
        requestId,
        sessionId,
        jobId,
        durationMs,
        operationGroup,
        coldStart,
      });

      await appendSessionLog({
        sessionId,
        requestId,
        jobId,
        event: 'lambda_invocation_succeeded',
        metadata: {
          invocationId,
          functionName,
          operationGroup,
          durationMs,
          coldStart,
        },
      });

      await publishMetrics({
        functionName,
        durationMs,
        success: true,
        coldStart,
        operationGroup,
      });

      coldStart = false;
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.error('Lambda invocation failed', {
        invocationId,
        functionName,
        requestId,
        sessionId,
        jobId,
        durationMs,
        operationGroup,
        coldStart,
        errorMessage: error?.message,
        errorCode: error?.code,
      });

      await appendSessionLog({
        sessionId,
        requestId,
        jobId,
        event: 'lambda_invocation_failed',
        metadata: {
          invocationId,
          functionName,
          operationGroup,
          durationMs,
          coldStart,
          errorMessage: error?.message,
          errorCode: error?.code,
        },
      });

      await publishMetrics({
        functionName,
        durationMs,
        success: false,
        coldStart,
        operationGroup,
      });

      if (captureErrorTrace || (operationGroup && ['artifact-generation', 'artifact-download', 'enhancement'].includes(operationGroup))) {
        const prefix = operationGroup === 'artifact-generation' || operationGroup === 'artifact-download' || operationGroup === 'enhancement'
          ? artifactFailurePrefix
          : errorTracePrefix;
        await writeFailureTrace({
          error,
          requestId,
          sessionId,
          jobId,
          functionName,
          operationGroup,
          metadata: {
            invocationId,
            durationMs,
            requestMetadata,
          },
          prefix,
        });
      }

      coldStart = false;
      if (isApiGatewayHttpEvent(event)) {
        return buildHttpErrorResponse(error, { requestId });
      }

      throw error;
    }
  };
}

export default withLambdaObservability;
