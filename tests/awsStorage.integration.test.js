import request from 'supertest';
import { jest } from '@jest/globals';
import { setupTestServer, primeSuccessfulAi } from './utils/testServer.js';

const MANUAL_JOB_DESCRIPTION = `
Join our platform engineering team to build resilient infrastructure and developer tooling.
Collaborate across functions, automate deployments, and improve service reliability.
`;

describe('AWS integrations for /api/process-cv', () => {
  test('writes uploads and metadata to S3 and DynamoDB', async () => {
    const { app, mocks } = await setupTestServer();
    await primeSuccessfulAi();

    const response = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const commandSummaries = mocks.mockS3Send.mock.calls.map(([command]) => ({
      type: command.__type,
      key: command.input?.Key,
      copySource: command.input?.CopySource,
    }));
    const initialUpload = commandSummaries.find(
      (command) =>
        command.type === 'PutObjectCommand' &&
        typeof command.key === 'string' &&
        command.key.includes('/incoming/')
    );
    expect(initialUpload).toBeTruthy();

    const relocatedUpload = commandSummaries.find(
      (command) =>
        command.type === 'CopyObjectCommand' &&
        typeof command.key === 'string' &&
        command.key.includes('cv/')
    );
    expect(relocatedUpload).toBeTruthy();

    const tempDelete = commandSummaries.find(
      (command) =>
        command.type === 'DeleteObjectCommand' &&
        typeof command.key === 'string' &&
        initialUpload &&
        command.key === initialUpload.key
    );
    expect(tempDelete).toBeTruthy();

    const rawUploadKey = relocatedUpload.key;
    expect(rawUploadKey).toContain('cv/');

    const metadataWrites = mocks.mockS3Send.mock.calls.filter(
      ([command]) =>
        command.__type === 'PutObjectCommand' &&
        typeof command.input?.Key === 'string' &&
        command.input.Key.endsWith('logs/log.json')
    );
    expect(metadataWrites.length).toBeGreaterThan(0);
    const latestMetadataCall = metadataWrites[metadataWrites.length - 1];
    const metadataPayload = JSON.parse(latestMetadataCall[0].input.Body.toString());
    expect(metadataPayload).not.toHaveProperty('client');
    expect(metadataPayload).not.toHaveProperty('templates');
    expect(metadataPayload).toEqual(
      expect.objectContaining({
        version: 2,
        jobId: expect.any(String),
        stages: expect.objectContaining({
          upload: expect.objectContaining({
            uploadedAt: expect.any(String),
            fileType: expect.any(String),
          }),
          scoring: expect.objectContaining({
            completedAt: expect.any(String),
            score: expect.any(Number),
          }),
          download: expect.objectContaining({
            completedAt: expect.any(String),
            artifactCount: expect.any(Number),
          }),
        }),
      })
    );

    expect(metadataPayload.stages.upload).not.toHaveProperty('storage');
    expect(metadataPayload.stages.scoring).not.toHaveProperty('missingSkillsCount');
    expect(metadataPayload.stages.scoring).not.toHaveProperty('addedSkillsCount');
    expect(metadataPayload.stages.download).not.toHaveProperty('textArtifactCount');
    expect(metadataPayload.stages.download).not.toHaveProperty('urlCount');

    expect(metadataPayload.stages.download.templates).toEqual(
      expect.objectContaining({
        resume: expect.objectContaining({
          primary: expect.any(String),
          selected: expect.any(String),
          available: expect.arrayContaining([expect.any(String)]),
        }),
        cover: expect.objectContaining({
          primary: expect.any(String),
          available: expect.arrayContaining([expect.any(String)]),
        }),
      })
    );

    const generatedPdf = commandSummaries.find(
      (command) =>
        command.type === 'PutObjectCommand' &&
        typeof command.key === 'string' &&
        command.key.endsWith('.pdf') &&
        command.key.includes('cv/')
    );
    expect(generatedPdf).toBeTruthy();
    const pdfSegments = generatedPdf.key.split('/');
    expect(pdfSegments.length).toBeGreaterThanOrEqual(5);
    expect(pdfSegments[0]).toBe('cv');
    expect(pdfSegments[3]).toMatch(/[a-z0-9_-]+/);
    expect(pdfSegments[4]).toMatch(/[a-z0-9_-]+\.pdf$/);

    const dynamoPut = mocks.mockDynamoSend.mock.calls.find(
      ([command]) => command.__type === 'PutItemCommand'
    );
    expect(dynamoPut).toBeTruthy();
    expect(dynamoPut[0].input.Item.linkedinProfileUrl.S).toBe(
      'https://linkedin.com/in/example'
    );
    expect(dynamoPut[0].input.Item.status.S).toBe('uploaded');

    const dynamoUpdates = mocks.mockDynamoSend.mock.calls.filter(
      ([command]) => command.__type === 'UpdateItemCommand'
    );
    expect(dynamoUpdates.length).toBeGreaterThan(0);

    const finalUpdate = dynamoUpdates[dynamoUpdates.length - 1];
    expect(finalUpdate[0].input.ExpressionAttributeValues[':status'].S).toBe(
      'completed'
    );
    expect(finalUpdate[0].input.UpdateExpression).toContain(
      'analysisCompletedAt'
    );

    const intermediateStatuses = dynamoUpdates
      .slice(0, -1)
      .map((update) => update[0].input.ExpressionAttributeValues[':status'].S);
    if (intermediateStatuses.length) {
      expect(intermediateStatuses).toContain('scored');
    }

    expect(mocks.logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'uploaded_metadata' })
    );
    expect(mocks.logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'completed' })
    );
    expect(mocks.logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'generation_text_artifacts_uploaded' })
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
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
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
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(200);

    const commandTypes = mocks.mockDynamoSend.mock.calls.map(([command]) => command.__type);
    expect(commandTypes).toEqual([
      'DescribeTableCommand',
      'CreateTableCommand',
      'DescribeTableCommand',
      'PutItemCommand',
      'UpdateItemCommand',
      'UpdateItemCommand',
    ]);
  });
});
