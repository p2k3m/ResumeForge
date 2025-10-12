import { createServiceHandler } from '../../microservices/createServiceHandler.js';
import { getServiceConfig } from '../../microservices/services.js';

const resumeUploadConfig = getServiceConfig('resumeUpload');

export const resumeUploadHttpHandler = createServiceHandler(
  resumeUploadConfig,
);

export default resumeUploadHttpHandler;
