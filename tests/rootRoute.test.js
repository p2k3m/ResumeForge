import request from 'supertest';
import app from '../server.js';
import { handler } from '../lambda.js';

function expectValidPortalMarkup(html) {
  expect(html).toContain('<title>ResumeForge</title>');
  expect(html).toContain('id="root"');

  const hasHashedJs = /assets\/index-[\w]+\.js/.test(html);
  const hasHashedCss = /assets\/index-[\w]+\.css/.test(html);

  if (!hasHashedJs || !hasHashedCss) {
    expect(html).toContain('data-status="client-assets-missing"');
    expect(html).toContain('ResumeForge client rebuilding');
  }
}

describe('serverless bootstrap', () => {
  it('responds to GET / with the hosted portal', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/html/);
    expectValidPortalMarkup(response.text);
    expect(response.text).toContain('name="resumeforge-api-base"');
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
    expectValidPortalMarkup(result.body);
  });
});
