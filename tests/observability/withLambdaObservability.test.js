import { jest } from '@jest/globals';
import { withLambdaObservability } from '../../lib/observability/lambda.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('withLambdaObservability HTTP error handling', () => {
  const httpEvent = {
    version: '2.0',
    rawPath: '/test',
    requestContext: {
      http: {
        method: 'GET',
        path: '/test',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      stage: 'test',
    },
  };

  const baseContext = {
    functionName: 'test-function',
    awsRequestId: 'req-123',
  };

  it('returns a structured error response for API Gateway events', async () => {
    const error = new Error('Payload validation failed');
    error.statusCode = 422;
    error.code = 'INVALID_PAYLOAD';
    error.details = { field: 'resumeText' };

    const handler = withLambdaObservability(async () => {
      throw error;
    }, { name: 'test-function' });

    const response = await handler(httpEvent, baseContext);

    expect(response.statusCode).toBe(422);
    expect(response.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body);
    expect(body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Payload validation failed',
        details: { field: 'resumeText' },
        requestId: 'req-123',
      })
    );
  });

  it('applies fallback metadata when the error omits details', async () => {
    const error = new Error('');

    const handler = withLambdaObservability(async () => {
      throw error;
    }, { name: 'test-function' });

    const response = await handler(httpEvent, baseContext);

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.message).toBe('An unexpected error occurred. Please try again later.');
    expect(body.success).toBe(false);
  });
});

describe('withLambdaObservability non-HTTP events', () => {
  it('rethrows errors for non-HTTP invocations', async () => {
    const failure = new Error('step function failure');
    const handler = withLambdaObservability(async () => {
      throw failure;
    }, { name: 'test-function' });

    await expect(
      handler(
        { detailType: 'MyEvent', source: 'aws.states' },
        { functionName: 'fn', awsRequestId: 'req-456' }
      )
    ).rejects.toBe(failure);
  });
});

describe('withLambdaObservability HTTP response logging', () => {
  const httpEvent = {
    version: '2.0',
    rawPath: '/test',
    requestContext: {
      http: {
        method: 'GET',
        path: '/test',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      stage: 'test',
    },
  };

  const baseContext = {
    functionName: 'test-function',
    awsRequestId: 'req-123',
  };

  it('logs session and download totals in the response summary', async () => {
    const handler = withLambdaObservability(async () => ({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        urls: [{ href: 'a' }, { href: 'b' }],
      }),
    }), { name: 'test-function' });

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    await handler(httpEvent, baseContext);

    const summaryCall = infoSpy.mock.calls.find(([message]) => message === 'API gateway response summary');
    expect(summaryCall).toBeDefined();
    expect(summaryCall[1]).toEqual(
      expect.objectContaining({
        path: '/test',
        method: 'GET',
        sessionCount: 1,
        downloadCount: 2,
      })
    );

    const totalsCall = infoSpy.mock.calls.find(([message]) => message === 'API gateway session download totals');
    expect(totalsCall).toBeDefined();
    expect(totalsCall[1]).toEqual(
      expect.objectContaining({
        sessionCount: 1,
        downloadCount: 2,
      })
    );
  });

  it('logs asset response details and warns on 404 outcomes', async () => {
    const assetEvent = {
      ...httpEvent,
      rawPath: '/assets/app.js',
      requestContext: {
        ...httpEvent.requestContext,
        http: {
          ...httpEvent.requestContext.http,
          path: '/assets/app.js',
        },
      },
    };

    const handler = withLambdaObservability(async () => ({
      statusCode: 404,
      headers: { 'Content-Type': 'text/plain' },
      body: 'not found',
    }), { name: 'test-function' });

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await handler(assetEvent, baseContext);

    const assetCall = infoSpy.mock.calls.find(([message]) => message === 'API gateway asset response');
    expect(assetCall).toBeDefined();
    expect(assetCall[1]).toEqual(
      expect.objectContaining({
        path: '/assets/app.js',
        assetRequest: true,
        statusCode: 404,
      })
    );

    const notFoundCall = warnSpy.mock.calls.find(([message]) => message === 'API gateway not found response');
    expect(notFoundCall).toBeDefined();
    expect(notFoundCall[1]).toEqual(
      expect.objectContaining({
        path: '/assets/app.js',
        statusCode: 404,
      })
    );
  });
});
