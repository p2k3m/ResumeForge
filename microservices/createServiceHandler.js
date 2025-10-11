import { configure } from '@vendia/serverless-express';
import app from '../server.js';

const DEFAULT_BINARY_TYPES = [
  'multipart/form-data',
  'application/octet-stream',
  'application/pdf',
];

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

function normalizeRoutePath(path) {
  if (!path) {
    return '/';
  }
  if (path === '/') {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.endsWith('/') && normalized !== '/'
    ? normalized.slice(0, -1)
    : normalized;
}

function matchesPath(requestPath, allowedPath) {
  if (allowedPath === '*') {
    return true;
  }
  const normalizedRequest = normalizeRoutePath(requestPath);
  if (allowedPath.endsWith('*')) {
    const prefix = normalizeRoutePath(allowedPath.slice(0, -1));
    return normalizedRequest === prefix || normalizedRequest.startsWith(`${prefix}/`);
  }
  const normalizedAllowed = normalizeRoutePath(allowedPath);
  return (
    normalizedRequest === normalizedAllowed ||
    `${normalizedRequest}/` === normalizedAllowed ||
    normalizedRequest === `${normalizedAllowed}/`
  );
}

function normalizeMethod(method) {
  return typeof method === 'string' && method.trim()
    ? method.trim().toUpperCase()
    : 'ANY';
}

export function createServiceHandler({
  serviceName = 'service',
  allowedRoutes = [],
  binaryTypes = DEFAULT_BINARY_TYPES,
} = {}) {
  if (!Array.isArray(allowedRoutes) || allowedRoutes.length === 0) {
    throw new Error(`createServiceHandler requires at least one allowed route for ${serviceName}.`);
  }

  const normalizedRoutes = allowedRoutes.map((route) => ({
    method: normalizeMethod(route?.method),
    path: route?.path ? String(route.path) : '*',
  }));

  let serverlessExpressInstance;

  return async function serviceHandler(event, context) {
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
        request: {
          binaryTypes,
        },
      });
    }

    return serverlessExpressInstance(event, context);
  };
}

export default createServiceHandler;
