import { createServiceHandler } from '../../microservices/createServiceHandler.js';
import { getServiceConfig } from '../../microservices/services.js';

const auditingConfig = getServiceConfig('auditing');

export const auditingHttpHandler = createServiceHandler(auditingConfig);

export default auditingHttpHandler;
