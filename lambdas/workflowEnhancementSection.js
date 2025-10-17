import '../config/environment.js';
import { generateEnhancementPatch } from '../lib/resume/enhancement.js';
import { withLambdaObservability } from '../lib/observability/lambda.js';

const baseHandler = async (event = {}) => {
  const type = typeof event.type === 'string' ? event.type : 'improve-summary';
  const result = generateEnhancementPatch({ ...event, type });
  return result;
};

export const handler = withLambdaObservability(baseHandler, {
  name: 'workflow-enhancement-section',
  operationGroup: 'enhancement',
  captureErrorTrace: true,
});

export default handler;
