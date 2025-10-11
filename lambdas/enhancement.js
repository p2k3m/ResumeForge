import { createServiceHandler } from '../microservices/createServiceHandler.js';

export const handler = createServiceHandler({
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
});
