import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createHash, randomUUID } from 'crypto';
import '../config/environment.js';
import { withLambdaObservability } from '../lib/observability/lambda.js';

const awsRegion = process.env.AWS_REGION;
const clientConfig = awsRegion ? { region: awsRegion } : {};
const sqsClient = new SQSClient(clientConfig);
const lambdaClient = new LambdaClient(clientConfig);

function parseBody(event = {}) {
  if (!event || event.body === undefined || event.body === null) {
    return {};
  }

  if (typeof event.body === 'object') {
    return event.body;
  }

  try {
    const decoded = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

function normalizePath(path) {
  if (!path) {
    return '/api/generate-enhanced-docs';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function resolveRouteFromEvent(event = {}) {
  const method =
    event?.requestContext?.http?.method || event?.httpMethod || 'POST';
  const pathCandidate =
    event?.rawPath || event?.path || '/api/generate-enhanced-docs';
  const rawQueryString =
    typeof event.rawQueryString === 'string' ? event.rawQueryString : '';
  const queryStringParameters =
    event?.queryStringParameters && typeof event.queryStringParameters === 'object'
      ? { ...event.queryStringParameters }
      : undefined;
  const multiValueQueryStringParameters =
    event?.multiValueQueryStringParameters &&
    typeof event.multiValueQueryStringParameters === 'object'
      ? { ...event.multiValueQueryStringParameters }
      : undefined;

  return {
    path: normalizePath(pathCandidate),
    method: typeof method === 'string' ? method.toUpperCase() : 'POST',
    rawQueryString,
    queryStringParameters,
    multiValueQueryStringParameters,
  };
}

function buildProxyEvent(event = {}, payload = {}, route = {}, requestIdOverride) {
  const headers = event.headers && typeof event.headers === 'object'
    ? { ...event.headers }
    : {};

  const stage = event?.requestContext?.stage || process.env.STAGE_NAME || 'prod';
  const path = normalizePath(route.path);
  const method = typeof route.method === 'string' ? route.method.toUpperCase() : 'POST';
  const rawQueryString =
    typeof route.rawQueryString === 'string'
      ? route.rawQueryString
      : typeof event.rawQueryString === 'string'
        ? event.rawQueryString
        : '';
  const queryStringParameters = (() => {
    if (
      route?.queryStringParameters &&
      typeof route.queryStringParameters === 'object'
    ) {
      return { ...route.queryStringParameters };
    }
    if (
      event?.queryStringParameters &&
      typeof event.queryStringParameters === 'object'
    ) {
      return { ...event.queryStringParameters };
    }
    return undefined;
  })();
  const multiValueQueryStringParameters = (() => {
    if (
      route?.multiValueQueryStringParameters &&
      typeof route.multiValueQueryStringParameters === 'object'
    ) {
      return { ...route.multiValueQueryStringParameters };
    }
    if (
      event?.multiValueQueryStringParameters &&
      typeof event.multiValueQueryStringParameters === 'object'
    ) {
      return { ...event.multiValueQueryStringParameters };
    }
    return undefined;
  })();

  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString,
    headers,
    queryStringParameters,
    multiValueQueryStringParameters,
    requestContext: {
      accountId: event?.requestContext?.accountId || '000000000000',
      apiId: event?.requestContext?.apiId || 'local',
      domainName: event?.requestContext?.domainName || 'localhost',
      domainPrefix: event?.requestContext?.domainPrefix || 'local',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: event?.requestContext?.http?.sourceIp || '127.0.0.1',
        userAgent: event?.requestContext?.http?.userAgent || 'lambda',
      },
      requestId:
        (typeof requestIdOverride === 'string' && requestIdOverride)
          || event?.requestContext?.requestId
          || randomUUID(),
      routeKey: `${method} ${path}`,
      stage,
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: JSON.stringify(payload),
    isBase64Encoded: false,
  };
}

function cloneLambdaContext(context = {}) {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    invokedFunctionArn: context.invokedFunctionArn,
    memoryLimitInMB: context.memoryLimitInMB,
    awsRequestId: context.awsRequestId,
    logGroupName: context.logGroupName,
    logStreamName: context.logStreamName,
    identity: context.identity,
    clientContext: context.clientContext,
  };
}

function resolveFinalText(primary = '', fallback = '') {
  if (typeof primary === 'string' && primary.trim()) {
    return primary;
  }
  if (typeof fallback === 'string') {
    return fallback;
  }
  return '';
}

function prepareWorkerPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const finalResumeText = resolveFinalText(
    payload.finalResumeText,
    resolveFinalText(payload.updatedResumeText, payload.resumeText),
  );
  const finalJobDescriptionText = resolveFinalText(
    payload.finalJobDescriptionText,
    payload.jobDescriptionText,
  );

  return {
    ...payload,
    finalResumeText,
    finalJobDescriptionText,
    resumeText: finalResumeText,
    jobDescriptionText: finalJobDescriptionText,
  };
}

function normalizeHeaderValue(headers = {}, name) {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const target = String(name || '').toLowerCase();
  return Object.entries(headers).reduce((acc, [key, value]) => {
    if (acc !== undefined) {
      return acc;
    }
    if (typeof key === 'string' && key.toLowerCase() === target) {
      return value;
    }
    return undefined;
  }, undefined);
}

function stableStringify(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const entries = value.map((item) => stableStringify(item));
    return `[${entries.join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const serialized = keys.map((key) => {
    const serializedValue = stableStringify(value[key]);
    return `${JSON.stringify(key)}:${serializedValue}`;
  });

  return `{${serialized.join(',')}}`;
}

function createDeterministicIdentifier(payload, route) {
  const hash = createHash('sha256');
  const serialized = stableStringify({ payload, route });
  hash.update(serialized);
  return hash.digest('hex');
}

function resolveStableRequestId(event = {}, payload = {}, route = {}) {
  const directId = (() => {
    if (typeof event?.requestContext?.requestId === 'string' && event.requestContext.requestId) {
      return event.requestContext.requestId;
    }
    if (typeof event?.id === 'string' && event.id) {
      return event.id;
    }
    const headerRequestId =
      normalizeHeaderValue(event?.headers, 'x-request-id') ||
      normalizeHeaderValue(event?.headers, 'x-amzn-requestid') ||
      normalizeHeaderValue(event?.headers, 'x-amzn-request-id');
    if (typeof headerRequestId === 'string' && headerRequestId) {
      return headerRequestId;
    }
    if (typeof payload?.requestId === 'string' && payload.requestId) {
      return payload.requestId;
    }
    if (typeof payload?.id === 'string' && payload.id) {
      return payload.id;
    }
    if (typeof payload?.jobId === 'string' && payload.jobId) {
      return payload.jobId;
    }
    if (typeof payload?.sessionId === 'string' && payload.sessionId) {
      return payload.sessionId;
    }
    return undefined;
  })();

  if (directId) {
    return String(directId);
  }

  return createDeterministicIdentifier(payload, route);
}

async function invokeWorkerLambda(event, context, payload, route, requestId) {
  const functionName = process.env.DOCUMENT_GENERATION_WORKER_FUNCTION_NAME;
  if (!functionName) {
    throw new Error('DOCUMENT_GENERATION_WORKER_FUNCTION_NAME is not configured.');
  }

  const proxyEvent = buildProxyEvent(event, payload, route, requestId);
  const proxyContext = cloneLambdaContext(context);
  const invocationPayload = {
    proxyEvent,
    proxyContext,
    requestId: requestId || proxyEvent?.requestContext?.requestId,
  };

  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify(invocationPayload)),
  });

  const response = await lambdaClient.send(command);
  const rawPayload = response?.Payload ? Buffer.from(response.Payload).toString('utf8') : '';

  if (response?.FunctionError) {
    const workerError = new Error(
      `Document generation worker invocation failed: ${response.FunctionError}`,
    );
    workerError.functionError = response.FunctionError;
    workerError.payload = rawPayload;
    throw workerError;
  }

  let parsed = {};
  if (rawPayload) {
    try {
      parsed = JSON.parse(rawPayload);
    } catch (err) {
      const parseError = new Error('Document generation worker returned invalid JSON payload.');
      parseError.cause = err;
      parseError.payload = rawPayload;
      throw parseError;
    }
  }

  return {
    statusCode: Number.parseInt(parsed?.statusCode, 10) || 500,
    headers: parsed?.headers || {},
    body: parsed?.body ?? '',
    isBase64Encoded: Boolean(parsed?.isBase64Encoded),
  };
}

async function enqueueGeneration(queueUrl, payload, requestId) {
  if (!queueUrl) {
    return null;
  }

  const deduplicationId = typeof requestId === 'string' && requestId
    ? requestId
    : createDeterministicIdentifier(payload);
  const finalRequestId = typeof requestId === 'string' && requestId
    ? requestId
    : deduplicationId;
  const messageBody = {
    id: finalRequestId,
    requestId: finalRequestId,
    type: 'document-generation',
    payload,
    enqueuedAt: new Date().toISOString(),
  };

  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageBody),
        MessageGroupId: 'document-generation',
        MessageDeduplicationId: deduplicationId,
      }),
    );
  } catch (err) {
    console.warn('Failed to enqueue document generation request', err);
  }

  return null;
}

const baseHandler = async (event, context) => {
  const payload = parseBody(event);
  const preparedPayload = prepareWorkerPayload(payload);
  const route = resolveRouteFromEvent(event);
  const queueUrl = process.env.DOCUMENT_GENERATION_QUEUE_URL || '';

  const requestId = resolveStableRequestId(event, preparedPayload, route);

  if (queueUrl) {
    await enqueueGeneration(queueUrl, { payload: preparedPayload, route }, requestId);
  }

  const response = await invokeWorkerLambda(
    event,
    context,
    preparedPayload,
    route,
    requestId,
  );
  return response;
};

export const handler = withLambdaObservability(baseHandler, {
  name: 'document-generation',
  operationGroup: 'artifact-generation',
  captureErrorTrace: true,
});

export default handler;
