export const DEFAULT_BINARY_TYPES = [
  'multipart/form-data',
  'application/octet-stream',
  'application/pdf',
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/eot',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/x-icon',
];

export function normalizeRoutePath(path) {
  if (!path) {
    return '/';
  }
  if (path === '*' || path === '/*') {
    return '*';
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') {
    return normalized;
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

export function normalizeMethod(method) {
  return typeof method === 'string' && method.trim()
    ? method.trim().toUpperCase()
    : 'ANY';
}

export function matchesPath(requestPath, allowedPath) {
  if (!allowedPath || allowedPath === '*') {
    return true;
  }

  const normalizedAllowed = normalizeRoutePath(allowedPath);
  if (normalizedAllowed === '*') {
    return true;
  }

  const normalizedRequest = normalizeRoutePath(requestPath);
  if (normalizedAllowed.endsWith('*')) {
    const prefix = normalizeRoutePath(normalizedAllowed.slice(0, -1));
    return (
      normalizedRequest === prefix ||
      normalizedRequest.startsWith(`${prefix}/`)
    );
  }

  return (
    normalizedRequest === normalizedAllowed ||
    `${normalizedRequest}/` === normalizedAllowed ||
    normalizedRequest === `${normalizedAllowed}/`
  );
}

export function buildNormalizedRoutes(allowedRoutes = []) {
  if (!Array.isArray(allowedRoutes)) {
    return [];
  }
  return allowedRoutes.map((route = {}) => ({
    method: normalizeMethod(route.method),
    path: route.path ? String(route.path) : '*',
  }));
}

export function routeMatchesRequest(route, method, path) {
  if (!route) {
    return false;
  }
  if (!matchesPath(path, route.path)) {
    return false;
  }
  const normalizedMethod = normalizeMethod(method);
  if (normalizedMethod === 'OPTIONS') {
    return true;
  }
  return route.method === 'ANY' || route.method === normalizedMethod;
}

export default {
  DEFAULT_BINARY_TYPES,
  normalizeRoutePath,
  normalizeMethod,
  matchesPath,
  buildNormalizedRoutes,
  routeMatchesRequest,
};
