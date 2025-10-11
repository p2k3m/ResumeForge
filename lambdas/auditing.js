import { createServiceHandler } from '../microservices/createServiceHandler.js';

export const handler = createServiceHandler({
  allowedRoutes: [
    { method: 'POST', path: '/api/change-log' },
    { method: 'POST', path: '/api/refresh-download-link' },
    { method: 'GET', path: '/api/published-cloudfront' },
    { method: 'GET', path: '/healthz' },
  ],
});
