import { createServiceHandler } from '../microservices/createServiceHandler.js';
import { getServiceConfig } from '../microservices/services.js';

export const handler = createServiceHandler(getServiceConfig('enhancement'));
