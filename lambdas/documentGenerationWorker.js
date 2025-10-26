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

function buildProxyContext(record, context, { requestId, baseContext } = {}) {
  const derivedRequestId =
    typeof requestId === 'string' && requestId
      ? requestId
      : record
        ? `${context.awsRequestId}:${record.messageId}`
        : context.awsRequestId;
  const sourceContext = baseContext && typeof baseContext === 'object' ? baseContext : {};

  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: sourceContext.functionName || context.functionName,
    functionVersion: sourceContext.functionVersion || context.functionVersion,
    invokedFunctionArn: sourceContext.invokedFunctionArn || context.invokedFunctionArn,
    memoryLimitInMB: sourceContext.memoryLimitInMB || context.memoryLimitInMB,
    awsRequestId: sourceContext.awsRequestId || derivedRequestId,
    logGroupName: sourceContext.logGroupName || context.logGroupName,
    logStreamName: sourceContext.logStreamName || context.logStreamName,
    identity: sourceContext.identity || context.identity,
    clientContext: sourceContext.clientContext || context.clientContext,
  };
}

function normalizeHandlerResponse(response) {
  return {
    statusCode: Number.parseInt(response?.statusCode, 10) || 500,
    headers: response?.headers || {},
    body: response?.body || '',
    isBase64Encoded: Boolean(response?.isBase64Encoded),
  };
}

const baseHandler = async (event, context) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  if (records.length > 0) {
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
      const messageRequestId =
        (typeof payload?.requestId === 'string' && payload.requestId)
        || (typeof payload?.id === 'string' && payload.id)
        || undefined;

      const proxyEvent = buildProxyEvent(
        bodyPayload,
        route,
        messageRequestId || record.messageId,
      );
      const proxyContext = buildProxyContext(record, context, {
        requestId: messageRequestId,
      });

      const response = await documentGenerationHttpHandler(
        proxyEvent,
        proxyContext,
      );

      const normalized = normalizeHandlerResponse(response);
      if (normalized.statusCode >= 400) {
        const error = new Error('Document generation worker failed');
        error.response = normalized;
        throw error;
      }
    }
    return;
  }

  if (event?.proxyEvent) {
    const proxyEvent = event.proxyEvent;
    const requestId =
      (typeof event.requestId === 'string' && event.requestId) ||
      proxyEvent?.requestContext?.requestId ||
      context.awsRequestId;
    const proxyContext = buildProxyContext(null, context, {
      requestId,
      baseContext: event.proxyContext,
    });

    const response = await documentGenerationHttpHandler(proxyEvent, proxyContext);
    return normalizeHandlerResponse(response);
  }

  const route =
    event?.route && typeof event.route === 'object'
      ? event.route
      : { path: '/api/generate-enhanced-docs', method: 'POST' };
  const bodyPayload =
    event?.payload && typeof event.payload === 'object'
      ? event.payload
      : event;
  const requestId = typeof event?.requestId === 'string' && event.requestId
    ? event.requestId
    : context.awsRequestId;

  const proxyEvent = buildProxyEvent(bodyPayload, route, requestId);
  const proxyContext = buildProxyContext(null, context, { requestId });
  const response = await documentGenerationHttpHandler(proxyEvent, proxyContext);
  return normalizeHandlerResponse(response);
};

export const handler = withLambdaObservability(baseHandler, {
  name: 'document-generation-worker',
  operationGroup: 'artifact-generation',
  captureErrorTrace: true,
});

export default handler;
