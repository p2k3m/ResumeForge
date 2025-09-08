import { jest } from '@jest/globals';
import request from 'supertest';

const mockS3Send = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn((input) => ({ input, __type: 'DeleteObjectCommand' })),
}));

const mockDynamoSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDynamoSend })),
  GetItemCommand: jest.fn((input) => ({ input, __type: 'GetItemCommand' })),
  DeleteItemCommand: jest.fn((input) => ({ input, __type: 'DeleteItemCommand' })),
  PutItemCommand: jest.fn((input) => ({ input, __type: 'PutItemCommand' })),
  ScanCommand: jest.fn((input) => ({ input, __type: 'ScanCommand' })),
  CreateTableCommand: jest.fn((input) => ({ input })),
  DescribeTableCommand: jest.fn((input) => ({ input })),
}));

jest.unstable_mockModule('../config/secrets.js', () => ({
  getSecrets: jest.fn().mockResolvedValue({}),
}));

const express = (await import('express')).default;
const registerProcessCv = (await import('../routes/processCv.js')).default;

const app = express();
app.use(express.json());

registerProcessCv(app, {
  generativeModel: {},
  classifyDocument: jest.fn(),
  extractName: jest.fn(),
  CV_TEMPLATES: [],
  CL_TEMPLATES: [],
  selectTemplates: jest.fn(),
  analyzeJobDescription: jest.fn(),
  fetchLinkedInProfile: jest.fn(),
  fetchCredlyProfile: jest.fn(),
  collectSectionText: jest.fn(),
  extractResumeSkills: jest.fn(),
  generateProjectSummary: jest.fn(),
  calculateMatchScore: jest.fn(),
  sanitizeGeneratedText: jest.fn(),
  parseAiJson: jest.fn(),
  generatePdf: jest.fn(),
  generateDocx: jest.fn(),
});

beforeEach(() => {
  mockS3Send.mockReset();
  mockDynamoSend.mockReset();
  mockDynamoSend.mockImplementation((cmd) => {
    if (cmd.__type === 'GetItemCommand') {
      return Promise.resolve({
        Item: {
          cvKey: { S: 'path/cv.pdf' },
          coverLetterKey: { S: 'path/cover.pdf' },
        },
      });
    }
    return Promise.resolve({});
  });
});

test('DELETE /api/session/:jobId removes data', async () => {
  const res = await request(app).delete('/api/session/test-job');
  expect(res.status).toBe(200);
  expect(mockS3Send).toHaveBeenCalledWith(
    expect.objectContaining({ input: { Bucket: 'resume-forge-data', Key: 'path/cv.pdf' } })
  );
  expect(mockS3Send).toHaveBeenCalledWith(
    expect.objectContaining({ input: { Bucket: 'resume-forge-data', Key: 'path/cover.pdf' } })
  );
  expect(mockDynamoSend).toHaveBeenCalledWith(
    expect.objectContaining({
      __type: 'DeleteItemCommand',
      input: { TableName: 'ResumeForgeLogs', Key: { jobId: { S: 'test-job' } } },
    })
  );
});
