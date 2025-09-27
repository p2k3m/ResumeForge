import request from 'supertest';
import app from '../server.js';
import { handler } from '../lambda.js';

describe('serverless bootstrap', () => {
  it('responds to GET / with status json', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      message: 'ResumeForge API is running.'
    });
  });

  it('handles API Gateway proxy events without socket errors', async () => {
    const event = {
      resource: '/{proxy+}',
      path: '/',
      httpMethod: 'GET',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        resourceId: '123456',
        stage: 'prod',
        requestId: 'id',
        identity: {},
        resourcePath: '/{proxy+}',
        httpMethod: 'GET',
        apiId: 'id'
      },
      body: null,
      isBase64Encoded: false
    };
    const context = {};
    const result = await handler(event, context);
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('ResumeForge API is running.');
  });
});
