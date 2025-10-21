import { withLambdaObservability } from '../../lib/observability/lambda.js';

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
