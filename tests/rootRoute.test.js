import request from 'supertest';
import app from '../server.js';
import { handler } from '../lambda.js';

describe('serverless bootstrap', () => {
  it('responds to GET / with the hosted portal', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/html/);
    expect(response.text).toContain('<title>ResumeForge Portal</title>');
    expect(response.text).toContain('id="portal-form"');
    expect(response.text).toContain('option value="modern"');
    expect(response.text).toContain('option value="professional"');
    expect(response.text).toContain('option value="classic"');
    expect(response.text).toContain('option value="ats"');
    expect(response.text).toContain('option value="2025"');
    expect(response.text).toContain('name="templateId"');
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
    expect(result.body).toContain('<title>ResumeForge Portal</title>');
  });
});
