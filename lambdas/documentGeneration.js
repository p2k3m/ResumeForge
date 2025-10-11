import { createServiceHandler } from '../microservices/createServiceHandler.js';

export const handler = createServiceHandler({
  allowedRoutes: [
    { method: 'POST', path: '/api/generate-enhanced-docs' },
    { method: 'POST', path: '/api/render-cover-letter' },
  ],
});
