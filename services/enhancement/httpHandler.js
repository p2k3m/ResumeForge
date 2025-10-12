import { createServiceHandler } from '../../microservices/createServiceHandler.js';
import { getServiceConfig } from '../../microservices/services.js';

const enhancementConfig = getServiceConfig('enhancement');

export const enhancementHttpHandler = createServiceHandler(
  enhancementConfig,
);

export default enhancementHttpHandler;
