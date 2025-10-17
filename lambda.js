import { configure } from '@vendia/serverless-express';
import app from './server.js';
import { withLambdaObservability } from './lib/observability/lambda.js';

let serverlessExpressInstance;

const baseHandler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  if (!serverlessExpressInstance) {
    serverlessExpressInstance = configure({
      app,
      request: {
        binaryTypes: [
          'multipart/form-data',
          'application/octet-stream',
          'application/pdf'
        ]
      }
    });
  }
  return serverlessExpressInstance(event, context);
};

export const handler = withLambdaObservability(baseHandler, {
  name: 'resume-forge-api',
  operationGroup: 'api',
});

export default handler;
