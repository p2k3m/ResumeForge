import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
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

function buildProxyEvent(event = {}, payload = {}, route = {}) {
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
      requestId: event?.requestContext?.requestId || randomUUID(),
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

async function invokeWorkerLambda(event, context, payload, route) {
  const functionName = process.env.DOCUMENT_GENERATION_WORKER_FUNCTION_NAME;
  if (!functionName) {
    throw new Error('DOCUMENT_GENERATION_WORKER_FUNCTION_NAME is not configured.');
  }

  const workerPayload = prepareWorkerPayload(payload);
  const proxyEvent = buildProxyEvent(event, workerPayload, route);
  const proxyContext = cloneLambdaContext(context);
  const invocationPayload = {
    proxyEvent,
    proxyContext,
    requestId: proxyEvent?.requestContext?.requestId,
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

  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          id: requestId || randomUUID(),
          type: 'document-generation',
          payload,
          enqueuedAt: new Date().toISOString(),
        }),
        MessageGroupId: 'document-generation',
        MessageDeduplicationId: `${requestId || randomUUID()}-${Date.now()}`,
      }),
    );
  } catch (err) {
    console.warn('Failed to enqueue document generation request', err);
  }

  return null;
}

const baseHandler = async (event, context) => {
  const payload = parseBody(event);
  const route = resolveRouteFromEvent(event);
  const queueUrl = process.env.DOCUMENT_GENERATION_QUEUE_URL || '';

  const requestId =
    event?.requestContext?.requestId || context?.awsRequestId || randomUUID();

  if (queueUrl) {
    await enqueueGeneration(queueUrl, { payload, route }, requestId);
  }

  const response = await invokeWorkerLambda(event, context, payload, route);
  return response;
};

export const handler = withLambdaObservability(baseHandler, {
  name: 'document-generation',
  operationGroup: 'artifact-generation',
  captureErrorTrace: true,
});

export default handler;
