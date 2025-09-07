import { jest } from '@jest/globals';
import { createHash } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { logSession } from '../services/dynamo.js';

describe('logSession location field', () => {
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

  test('includes hashed IP and location derived from IP', async () => {
    const sendMock = jest
      .spyOn(DynamoDBClient.prototype, 'send')
      .mockResolvedValue({});

    await logSession({ jobId: '1', ipAddress: '1.2.3.4' });

    const putCall = sendMock.mock.calls.find(
      ([cmd]) => cmd.__type === 'PutItemCommand'
    );
    const hash = createHash('sha256').update('1.2.3.4').digest('hex');
    expect(putCall[0].input.Item.ipHash).toEqual({ S: hash });
    expect(putCall[0].input.Item.location).toEqual({ S: 'City, Country' });
  });
});
