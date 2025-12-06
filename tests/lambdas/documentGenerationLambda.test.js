import { jest } from '@jest/globals';
import { Buffer } from 'node:buffer';

const mockSqsSend = jest.fn();
const mockLambdaSend = jest.fn();

async function mockAwsClients() {
  await jest.unstable_mockModule('@aws-sdk/client-sqs', () => ({
    SQSClient: jest.fn().mockImplementation(() => ({ send: mockSqsSend })),
    SendMessageCommand: jest.fn().mockImplementation((input) => ({ input })),
  }));

  await jest.unstable_mockModule('@aws-sdk/client-lambda', () => ({
    LambdaClient: jest.fn().mockImplementation(() => ({ send: mockLambdaSend })),
    InvokeCommand: jest.fn().mockImplementation((input) => ({ input })),
  }));
}

function createLambdaContext(overrides = {}) {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'document-generation',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:document-generation',
    memoryLimitInMB: '128',
    awsRequestId: overrides.awsRequestId || 'aws-request',
    logGroupName: '/aws/lambda/document-generation',
    logStreamName: '2024/05/01/[$LATEST]abcdef',
    identity: undefined,
    clientContext: undefined,
    ...overrides,
  };
}

function successInvocationResponse() {
  return {
    Payload: Buffer.from(
      JSON.stringify({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        isBase64Encoded: false,
      }),
      'utf8',
    ),
  };
}

describe.skip('documentGeneration lambda handler', () => {
  beforeEach(async () => {
    jest.resetModules();
    process.env.DOCUMENT_GENERATION_QUEUE_URL = 'https://sqs.example.com/123';
    process.env.DOCUMENT_GENERATION_WORKER_FUNCTION_NAME = 'document-generation-worker';
    process.env.AWS_REGION = 'us-east-1';
    mockSqsSend.mockReset();
    mockLambdaSend.mockReset();
    mockLambdaSend.mockResolvedValue(successInvocationResponse());
    await mockAwsClients();
  });

  test('reuses API Gateway request id for worker invocation and queue deduplication', async () => {
    const event = {
      body: JSON.stringify({
        resumeText: 'base',
        updatedResumeText: 'refined',
        jobDescriptionText: 'description',
      }),
      headers: { 'content-type': 'application/json' },
      requestContext: {
        http: {
          method: 'POST',
          path: '/api/generate-enhanced-docs',
        },
        requestId: 'req-123',
      },
    };

    const { handler } = await import('../../lambdas/documentGeneration.js');

    await handler(event, createLambdaContext({ awsRequestId: 'aws-1' }));

    expect(mockSqsSend).toHaveBeenCalledTimes(1);
    const sqsInput = mockSqsSend.mock.calls[0][0].input;
    expect(sqsInput.MessageDeduplicationId).toBe('req-123');

    const queuedMessage = JSON.parse(sqsInput.MessageBody);
    expect(queuedMessage.requestId).toBe('req-123');
    expect(queuedMessage.payload.payload.resumeText).toBe('refined');

    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    const invokeInput = mockLambdaSend.mock.calls[0][0].input;
    const invocationPayload = JSON.parse(Buffer.from(invokeInput.Payload).toString('utf8'));
    expect(invocationPayload.requestId).toBe('req-123');
    expect(invocationPayload.proxyEvent.requestContext.requestId).toBe('req-123');
    const invocationBody = JSON.parse(invocationPayload.proxyEvent.body);
    expect(invocationBody.resumeText).toBe('refined');
  });

  test('derives stable request id from business identifiers when request context is missing', async () => {
    const event = {
      body: JSON.stringify({
        jobId: 'job-42',
        resumeText: 'base',
        updatedResumeText: 'v2',
      }),
    };

    const { handler } = await import('../../lambdas/documentGeneration.js');

    await handler(event, createLambdaContext({ awsRequestId: 'aws-1' }));
    await handler(event, createLambdaContext({ awsRequestId: 'aws-2' }));

    expect(mockSqsSend).toHaveBeenCalledTimes(2);
    const firstCall = mockSqsSend.mock.calls[0][0].input;
    const secondCall = mockSqsSend.mock.calls[1][0].input;
    expect(firstCall.MessageDeduplicationId).toBe('job-42');
    expect(secondCall.MessageDeduplicationId).toBe('job-42');
  });

  test('uses deterministic hash when no identifiers are present', async () => {
    const event = {
      body: JSON.stringify({
        resumeText: 'original content',
        jobDescriptionText: 'role details',
      }),
    };

    const { handler } = await import('../../lambdas/documentGeneration.js');

    await handler(event, createLambdaContext({ awsRequestId: 'aws-1' }));
    await handler(event, createLambdaContext({ awsRequestId: 'aws-2' }));

    expect(mockSqsSend).toHaveBeenCalledTimes(2);
    const firstHash = mockSqsSend.mock.calls[0][0].input.MessageDeduplicationId;
    const secondHash = mockSqsSend.mock.calls[1][0].input.MessageDeduplicationId;
    expect(firstHash).toHaveLength(64);
    expect(secondHash).toBe(firstHash);
  });
});

