import { configure } from '@vendia/serverless-express';
import app from '../server.js';
import {
  DEFAULT_BINARY_TYPES,
  normalizeMethod,
  matchesPath,
} from './routing.js';
import { getNormalizedRoutesForService } from './services.js';
import { withLambdaObservability } from '../lib/observability/lambda.js';

function normalizeIncomingPath(event) {
  const rawPath =
    (typeof event.path === 'string' && event.path) ||
    (typeof event.rawPath === 'string' && event.rawPath) ||
    '';
  const stage = event?.requestContext?.stage;
  if (stage) {
    const stagePrefix = `/${stage}`;
    if (rawPath === stagePrefix) {
      return '/';
    }
    if (rawPath.startsWith(`${stagePrefix}/`)) {
      const trimmed = rawPath.slice(stagePrefix.length);
      return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }
  }
  if (!rawPath) {
    return '/';
  }
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

export function createServiceHandler({
  key: serviceKey,
  serviceName = 'service',
  allowedRoutes = [],
  binaryTypes = DEFAULT_BINARY_TYPES,
} = {}) {
  if (!Array.isArray(allowedRoutes) || allowedRoutes.length === 0) {
    throw new Error(`createServiceHandler requires at least one allowed route for ${serviceName}.`);
  }

  const normalizedRoutes = (serviceKey && getNormalizedRoutesForService(serviceKey)) ||
    allowedRoutes.map((route) => ({
      method: normalizeMethod(route?.method),
      path: route?.path ? String(route.path) : '*',
    }));

  let serverlessExpressInstance;

  const serviceHandler = async function serviceHandler(event, context) {
    context.callbackWaitsForEmptyEventLoop = false;
    const method = normalizeMethod(event?.httpMethod || event?.requestContext?.http?.method);
    const path = normalizeIncomingPath(event);

    const routeAllowed = normalizedRoutes.some((route) => {
      if (!matchesPath(path, route.path)) {
        return false;
      }
      if (method === 'OPTIONS') {
        return true;
      }
      return route.method === 'ANY' || route.method === method;
    });

    console.log(JSON.stringify({
      event: 'service_handler_route_check',
      service: serviceName,
      incomingPath: event.path,
      normalizedPath: path,
      method,
      routeAllowed,
      routes: normalizedRoutes.map(r => r.path)
    }));

    if (!routeAllowed) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers':
            'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
        },
        body: JSON.stringify({
          message: 'Not Found',
          service: serviceName,
          requestedPath: path,
          requestedMethod: method,
        }),
      };
    }

    if (!serverlessExpressInstance) {
      serverlessExpressInstance = configure({
        app,
        binarySettings: {
          contentTypes: binaryTypes,
        },
      });
    }

    if (!event.headers) {
      event.headers = {};
    }
    event.headers['x-original-path'] = path;

    if (event.multiValueHeaders) {
      event.multiValueHeaders['x-original-path'] = [path];
    }

    console.log(JSON.stringify({
      event: 'debug_event_structure',
      keys: Object.keys(event),
      hasMultiValueHeaders: !!event.multiValueHeaders
    }));

    try {
      const response = await serverlessExpressInstance(event, context);

      if (response && typeof response === 'object') {
        response.headers = response.headers || {};
        // Ensure CORS headers are present
        if (!response.headers['Access-Control-Allow-Origin']) {
          response.headers['Access-Control-Allow-Origin'] = '*';
        }
        if (!response.headers['Access-Control-Allow-Headers']) {
          response.headers['Access-Control-Allow-Headers'] = 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token';
        }
        if (!response.headers['Access-Control-Allow-Methods']) {
          response.headers['Access-Control-Allow-Methods'] = 'OPTIONS,GET,POST,PUT,DELETE';
        }
      }

      return response;
    } catch (error) {
      console.error(JSON.stringify({
        event: 'serverless_express_error',
        message: error.message,
        stack: error.stack,
        eventPayload: event
      }));

      // Return a 500 with CORS headers instead of throwing, so the client sees the error
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE'
        },
        body: JSON.stringify({
          message: 'Internal Server Error',
          requestId: context.awsRequestId,
          error: error.message
        })
      };
    }
  };

  const operationGroup = (() => {
    if (serviceKey === 'documentGeneration') {
      return 'artifact-generation';
    }
    if (serviceKey === 'clientApp' || serviceKey === 'auditing') {
      return 'artifact-download';
    }
    if (typeof serviceKey === 'string' && serviceKey.startsWith('enhancement')) {
      return 'enhancement';
    }
    return undefined;
  })();

  return withLambdaObservability(serviceHandler, {
    name: serviceName,
    operationGroup,
    captureErrorTrace: Boolean(operationGroup),
  });
}

export default createServiceHandler;
