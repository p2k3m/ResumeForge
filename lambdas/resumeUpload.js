import { createServiceHandler } from '../microservices/createServiceHandler.js';

export const handler = createServiceHandler({
  allowedRoutes: [
    { method: 'POST', path: '/api/process-cv' },
  ],
});
