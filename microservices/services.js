import {
  DEFAULT_BINARY_TYPES,
  buildNormalizedRoutes,
  normalizeMethod,
  normalizeRoutePath,
  routeMatchesRequest,
} from './routing.js';

export const services = {
  clientApp: {
    serviceName: 'client-app',
    description: 'Serves the compiled client application and static assets.',
    allowedRoutes: [
      { method: 'GET', path: '/' },
      { method: 'HEAD', path: '/' },
      { method: 'GET', path: '/index.html' },
      { method: 'HEAD', path: '/index.html' },
      { method: 'GET', path: '/favicon.ico' },
      { method: 'HEAD', path: '/favicon.ico' },
      { method: 'GET', path: '/manifest.webmanifest' },
      { method: 'HEAD', path: '/manifest.webmanifest' },
      { method: 'GET', path: '/robots.txt' },
      { method: 'HEAD', path: '/robots.txt' },
      { method: 'GET', path: '/service-worker.js' },
      { method: 'HEAD', path: '/service-worker.js' },
      { method: 'GET', path: '/assets*' },
      { method: 'HEAD', path: '/assets*' },
      { method: 'GET', path: '/fonts*' },
      { method: 'HEAD', path: '/fonts*' },
      { method: 'GET', path: '/images*' },
      { method: 'HEAD', path: '/images*' },
      { method: 'GET', path: '/cover-templates*' },
      { method: 'HEAD', path: '/cover-templates*' },
    ],
  },
  resumeUpload: {
    serviceName: 'resume-upload',
    description: 'Accepts resumes and uploads artifacts to S3/DynamoDB.',
    allowedRoutes: [
      { method: 'POST', path: '/api/process-cv' },
    ],
    binaryTypes: DEFAULT_BINARY_TYPES,
  },
  jobEvaluation: {
    serviceName: 'job-evaluation',
    description: 'Evaluates resumes against a supplied job description.',
    allowedRoutes: [
      { method: 'POST', path: '/api/jd/evaluate' },
    ],
  },
  scoring: {
    serviceName: 'scoring',
    description: 'Calculates ATS-style scores and re-scoring operations.',
    allowedRoutes: [
      { method: 'POST', path: '/api/score-match' },
      { method: 'POST', path: '/api/rescore-improvement' },
    ],
  },
  enhancement: {
    serviceName: 'enhancement',
    description: 'Handles AI-driven resume enhancement flows.',
    allowedRoutes: [
      { method: 'POST', path: '/api/improve-summary' },
      { method: 'POST', path: '/api/add-missing-skills' },
      { method: 'POST', path: '/api/change-designation' },
      { method: 'POST', path: '/api/align-experience' },
      { method: 'POST', path: '/api/improve-certifications' },
      { method: 'POST', path: '/api/improve-projects' },
      { method: 'POST', path: '/api/improve-highlights' },
      { method: 'POST', path: '/api/enhance-all' },
    ],
  },
  documentGeneration: {
    serviceName: 'document-generation',
    description: 'Generates CVs and cover letters for download.',
    allowedRoutes: [
      { method: 'POST', path: '/api/generate-enhanced-docs' },
      { method: 'POST', path: '/api/render-cover-letter' },
    ],
  },
  auditing: {
    serviceName: 'auditing',
    description: 'Exposes audit logs, download refreshes and metrics.',
    allowedRoutes: [
      { method: 'POST', path: '/api/change-log' },
      { method: 'POST', path: '/api/refresh-download-link' },
      { method: 'GET', path: '/api/published-cloudfront' },
      { method: 'GET', path: '/healthz' },
    ],
  },
};

const normalizedRouteCache = new Map();

function primeNormalizedRoutes() {
  for (const [key, config] of Object.entries(services)) {
    if (!normalizedRouteCache.has(key)) {
      normalizedRouteCache.set(key, buildNormalizedRoutes(config.allowedRoutes));
    }
  }
}

primeNormalizedRoutes();

export function getServiceConfig(key) {
  if (!key) {
    throw new Error('Service key is required.');
  }
  const config = services[key];
  if (!config) {
    throw new Error(`Unknown microservice "${key}".`);
  }
  return {
    ...config,
    key,
  };
}

export function getNormalizedRoutesForService(key) {
  if (!normalizedRouteCache.has(key)) {
    const config = getServiceConfig(key);
    normalizedRouteCache.set(key, buildNormalizedRoutes(config.allowedRoutes));
  }
  return normalizedRouteCache.get(key);
}

export function resolveServiceForRoute(method, path) {
  const normalizedMethod = normalizeMethod(method);
  const normalizedPath = normalizeRoutePath(path);

  for (const [serviceKey, routes] of normalizedRouteCache.entries()) {
    if (!Array.isArray(routes) || routes.length === 0) {
      continue;
    }
    const matched = routes.some((route) =>
      routeMatchesRequest(route, normalizedMethod, normalizedPath)
    );
    if (matched) {
      return serviceKey;
    }
  }
  return null;
}

export default services;

export { DEFAULT_BINARY_TYPES };
