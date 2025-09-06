import { jest } from '@jest/globals';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { logEvaluation } from '../services/dynamo.js';

describe('logEvaluation optional fields', () => {
  beforeEach(() => {
    process.env.DYNAMO_TABLE = 'test';
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        city: 'City',
        country_name: 'Country',
      }),
    });
  });

  afterEach(() => {
    delete process.env.DYNAMO_TABLE;
    delete global.fetch;
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
    expect(putCall[0].input.Item.location).toEqual({ S: 'City, Country' });
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
    expect(putCall[0].input.Item.location).toEqual({ S: 'City, Country' });
  });
});

