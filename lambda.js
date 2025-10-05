import { configure } from '@vendia/serverless-express';
import app from './server.js';

let serverlessExpressInstance;

export const handler = async (event, context) => {
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
