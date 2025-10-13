import { createServiceHandler } from '../../microservices/createServiceHandler.js';
import { getServiceConfig } from '../../microservices/services.js';

const clientAppConfig = getServiceConfig('clientApp');

export const clientAppHttpHandler = createServiceHandler(clientAppConfig);

export default clientAppHttpHandler;
