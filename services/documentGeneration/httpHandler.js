import { createServiceHandler } from '../../microservices/createServiceHandler.js';
import { getServiceConfig } from '../../microservices/services.js';

const documentGenerationConfig = getServiceConfig('documentGeneration');

export const documentGenerationHttpHandler = createServiceHandler(
  documentGenerationConfig,
);

export default documentGenerationHttpHandler;
