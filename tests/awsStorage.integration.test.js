import request from 'supertest';
import { jest } from '@jest/globals';
import crypto from 'crypto';
import { setupTestServer, primeSuccessfulAi } from './utils/testServer.js';

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

describe('AWS integrations for /api/process-cv', () => {
  test('writes uploads and metadata to S3 and DynamoDB', async () => {
    const { app, mocks } = await setupTestServer();
    await primeSuccessfulAi();

    const response = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'https://example.com/job')
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const putCalls = mocks.mockS3Send.mock.calls
      .map(([command]) => command.__type)
      .filter(Boolean);
    expect(putCalls).toContain('PutObjectCommand');

    const uploadedKeys = mocks.mockS3Send.mock.calls
      .map(([command]) => command.input?.Key)
      .filter(Boolean);
    const rawUploadKey = uploadedKeys.find(
      (key) => key.endsWith('.pdf') && !key.includes('/generated/')
    );
    expect(rawUploadKey).toBeTruthy();
    expect(rawUploadKey).toContain('/cv/');

    const metadataCall = uploadedKeys.find((key) => key.endsWith('log.json'));
    expect(metadataCall).toBeTruthy();

    const dynamoPut = mocks.mockDynamoSend.mock.calls.find(
      ([command]) => command.__type === 'PutItemCommand'
    );
    expect(dynamoPut).toBeTruthy();
    expect(dynamoPut[0].input.Item.linkedinProfileUrl.S).toBe(
      hash('https://linkedin.com/in/example')
    );

    expect(mocks.logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'uploaded_metadata' })
    );
    expect(mocks.logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'completed' })
    );
  });

  test('surfaces initial upload errors and records failure log', async () => {
    const error = new Error('network down');
    const failingImpl = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue({});

    const { app, mocks } = await setupTestServer({ s3Impl: failingImpl });
    await primeSuccessfulAi();

    const response = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'https://example.com/job')
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INITIAL_UPLOAD_FAILED');
    expect(mocks.logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'initial_upload_failed', level: 'error' })
    );
  });

  test('creates DynamoDB table when missing', async () => {
    const creationFlow = [
      () => Promise.reject({ name: 'ResourceNotFoundException' }),
      () => Promise.resolve({}),
      () => Promise.resolve({ Table: { TableStatus: 'ACTIVE' } }),
      () => Promise.resolve({}),
    ];
    const sequence = jest.fn(() =>
      creationFlow.length ? creationFlow.shift()() : Promise.resolve({})
    );

    const { app, mocks } = await setupTestServer({ dynamoImpl: sequence });
    await primeSuccessfulAi();

    const response = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'https://example.com/job')
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(200);

    const commandTypes = mocks.mockDynamoSend.mock.calls.map(([command]) => command.__type);
    expect(commandTypes).toEqual([
      'DescribeTableCommand',
      'CreateTableCommand',
      'DescribeTableCommand',
      'PutItemCommand',
    ]);
  });
});
