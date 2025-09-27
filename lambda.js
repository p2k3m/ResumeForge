import { configure } from '@vendia/serverless-express';
import app, { handleDataRetentionEvent } from './server.js';

let serverlessExpressInstance;

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  if (event?.source === 'aws.events' || event?.['detail-type'] === 'Scheduled Event') {
    // EventBridge rule triggers GDPR retention sweep without booting Express.
    return handleDataRetentionEvent(event);
  }
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
