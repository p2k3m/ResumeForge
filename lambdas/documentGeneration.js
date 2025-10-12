import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
import '../config/environment.js';
import documentGenerationHttpHandler from '../services/documentGeneration/httpHandler.js';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

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

async function invokeDocumentGeneration(event, context, payload, route) {
  const proxyEvent = buildProxyEvent(event, payload, route);
  const proxyContext = cloneLambdaContext(context);
  const response = await documentGenerationHttpHandler(proxyEvent, proxyContext);

  return {
    statusCode: Number.parseInt(response?.statusCode, 10) || 500,
    headers: response?.headers || {},
    body: response?.body || '',
    isBase64Encoded: Boolean(response?.isBase64Encoded),
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

export const handler = async (event, context) => {
  const payload = parseBody(event);
  const route = resolveRouteFromEvent(event);
  const queueUrl = process.env.DOCUMENT_GENERATION_QUEUE_URL || '';

  const requestId =
    event?.requestContext?.requestId || context?.awsRequestId || randomUUID();

  if (queueUrl) {
    await enqueueGeneration(queueUrl, { payload, route }, requestId);
  }

  const response = await invokeDocumentGeneration(event, context, payload, route);
  return response;
};

export default handler;
