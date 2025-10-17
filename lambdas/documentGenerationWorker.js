import '../config/environment.js';
import documentGenerationHttpHandler from '../services/documentGeneration/httpHandler.js';
import { withLambdaObservability } from '../lib/observability/lambda.js';

function normalizePath(path) {
  if (!path) {
    return '/api/generate-enhanced-docs';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function buildProxyEvent(payload, route = {}, messageId) {
  const path = normalizePath(route.path);
  const method = typeof route.method === 'string' ? route.method.toUpperCase() : 'POST';
  const rawQueryString =
    typeof route.rawQueryString === 'string' ? route.rawQueryString : '';
  const queryStringParameters =
    route?.queryStringParameters && typeof route.queryStringParameters === 'object'
      ? { ...route.queryStringParameters }
      : undefined;
  const multiValueQueryStringParameters =
    route?.multiValueQueryStringParameters &&
    typeof route.multiValueQueryStringParameters === 'object'
      ? { ...route.multiValueQueryStringParameters }
      : undefined;

  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString,
    headers: {},
    queryStringParameters,
    multiValueQueryStringParameters,
    requestContext: {
      accountId: '000000000000',
      apiId: 'sqs-worker',
      domainName: 'sqs-worker',
      domainPrefix: 'sqs-worker',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'sqs-worker',
      },
      requestId: messageId || 'sqs-worker-request',
      routeKey: `${method} ${path}`,
      stage: process.env.STAGE_NAME || 'prod',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: JSON.stringify(payload),
    isBase64Encoded: false,
  };
}

function buildProxyContext(record, context) {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    invokedFunctionArn: context.invokedFunctionArn,
    memoryLimitInMB: context.memoryLimitInMB,
    awsRequestId: `${context.awsRequestId}:${record.messageId}`,
    logGroupName: context.logGroupName,
    logStreamName: context.logStreamName,
    identity: context.identity,
    clientContext: context.clientContext,
  };
}

const baseHandler = async (event, context) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  for (const record of records) {
    let payload = {};
    try {
      payload = JSON.parse(record.body || '{}');
    } catch {
      payload = {};
    }

    const messagePayload =
      payload && typeof payload === 'object' && payload.payload
        ? payload.payload
        : payload;
    const route =
      messagePayload && typeof messagePayload === 'object' && messagePayload.route
        ? messagePayload.route
        : { path: '/api/generate-enhanced-docs', method: 'POST' };
    const bodyPayload =
      messagePayload && typeof messagePayload === 'object' && messagePayload.payload
        ? messagePayload.payload
        : messagePayload;

    const proxyEvent = buildProxyEvent(bodyPayload, route, record.messageId);
    const proxyContext = buildProxyContext(record, context);

    const response = await documentGenerationHttpHandler(
      proxyEvent,
      proxyContext,
    );

    const status = Number.parseInt(response?.statusCode, 10) || 500;
    if (status >= 400) {
      const error = new Error('Document generation worker failed');
      error.response = response;
      throw error;
    }
  }
};

export const handler = withLambdaObservability(baseHandler, {
  name: 'document-generation-worker',
  operationGroup: 'artifact-generation',
  captureErrorTrace: true,
});

export default handler;
