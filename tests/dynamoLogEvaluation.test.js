import { jest } from '@jest/globals';
import { createHash } from 'crypto';
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

  const hash = (v) => createHash('sha256').update(v).digest('hex');

  test('includes hashed urls when provided', async () => {
    const sendMock = jest
      .spyOn(DynamoDBClient.prototype, 'send')
      .mockResolvedValue({});

    await logEvaluation({
      jobId: '1',
      ipAddress: 'ip',
      userAgent: 'ua',
      jobDescriptionUrl: 'https://example.com/job',
      linkedinProfileUrl: 'https://linkedin.com/in/example',
      cvKey: 's3/key',
      docType: 'resume',
    });

    const putCall = sendMock.mock.calls.find(
      ([cmd]) => cmd.__type === 'PutItemCommand'
    );
    expect(putCall[0].input.Item.linkedinProfileHash).toEqual({
      S: hash('https://linkedin.com/in/example'),
    });
    expect(putCall[0].input.Item.cvKeyHash).toEqual({ S: hash('s3/key') });
    expect(putCall[0].input.Item.ipHash).toEqual({ S: hash('ip') });
    expect(putCall[0].input.Item.location).toEqual({ S: 'City, Country' });
  });

  test('omits linkedinProfileHash when not provided', async () => {
    const sendMock = jest
      .spyOn(DynamoDBClient.prototype, 'send')
      .mockResolvedValue({});

    await logEvaluation({
      jobId: '2',
      ipAddress: 'ip',
      userAgent: 'ua',
      jobDescriptionUrl: 'https://example.com/job',
      cvKey: 'another/key',
      docType: 'resume',
    });

    const putCall = sendMock.mock.calls.find(
      ([cmd]) => cmd.__type === 'PutItemCommand'
    );
    expect(putCall[0].input.Item.linkedinProfileHash).toBeUndefined();
    expect(putCall[0].input.Item.ipHash).toEqual({ S: hash('ip') });
    expect(putCall[0].input.Item.location).toEqual({ S: 'City, Country' });
  });
});

