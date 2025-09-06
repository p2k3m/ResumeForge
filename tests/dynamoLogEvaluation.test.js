import { jest } from '@jest/globals';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { logEvaluation } from '../services/dynamo.js';

describe('logEvaluation optional fields', () => {
  beforeEach(() => {
    process.env.DYNAMO_TABLE = 'test';
  });

  afterEach(() => {
    delete process.env.DYNAMO_TABLE;
    jest.restoreAllMocks();
  });

  test('includes linkedinProfileUrl when provided', async () => {
    const sendMock = jest
      .spyOn(DynamoDBClient.prototype, 'send')
      .mockResolvedValue({});

    await logEvaluation({
      jobId: '1',
      ipAddress: 'ip',
      userAgent: 'ua',
      jobDescriptionUrl: 'https://example.com/job',
      linkedinProfileUrl: 'https://linkedin.com/in/example',
      docType: 'resume',
    });

    const putCall = sendMock.mock.calls.find(
      ([cmd]) => cmd.__type === 'PutItemCommand'
    );
    expect(putCall[0].input.Item.linkedinProfileUrl).toEqual({
      S: 'https://linkedin.com/in/example',
    });
  });

  test('omits linkedinProfileUrl when not provided', async () => {
    const sendMock = jest
      .spyOn(DynamoDBClient.prototype, 'send')
      .mockResolvedValue({});

    await logEvaluation({
      jobId: '2',
      ipAddress: 'ip',
      userAgent: 'ua',
      jobDescriptionUrl: 'https://example.com/job',
      docType: 'resume',
    });

    const putCall = sendMock.mock.calls.find(
      ([cmd]) => cmd.__type === 'PutItemCommand'
    );
    expect(putCall[0].input.Item.linkedinProfileUrl).toEqual({
      S: 'unknown',
    });
  });
});

