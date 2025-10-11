import { createServiceHandler } from '../microservices/createServiceHandler.js';

export const handler = createServiceHandler({
  allowedRoutes: [
    { method: 'POST', path: '/api/score-match' },
    { method: 'POST', path: '/api/rescore-improvement' },
  ],
});
