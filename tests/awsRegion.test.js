import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('shared AWS region configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.AWS_REGION = 'us-test-1';
  });

  test('server exports shared region', async () => {
    const mockAxiosGet = jest.fn();
    const mockLaunch = jest.fn();
    jest.unstable_mockModule('axios', () => ({ default: { get: mockAxiosGet } }));
    jest.unstable_mockModule('puppeteer', () => ({ default: { launch: mockLaunch } }));
    const { REGION } = await import('../config/aws.js');
    const serverModule = await import('../server.js');
    expect(serverModule.region).toBe(REGION);
  });

  test('dynamo client uses shared region', async () => {
    const ctor = jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) }));
    jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: function (config) {
        ctor(config);
        return { send: jest.fn().mockResolvedValue({}) };
      },
      CreateTableCommand: class {},
      DescribeTableCommand: class {},
      PutItemCommand: class {},
      ScanCommand: class {},
      DeleteItemCommand: class {},
    }));
    process.env.DYNAMO_TABLE = 'test';
    const { REGION } = await import('../config/aws.js');
    const { logEvaluation } = await import('../services/dynamo.js');
    global.fetch = jest.fn().mockResolvedValue({ json: jest.fn().mockResolvedValue({}) });
    await logEvaluation({ jobId: '1' });
    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({ region: REGION }));
    delete process.env.DYNAMO_TABLE;
    delete global.fetch;
  });

  test('secrets client uses shared region', async () => {
    const ctor = jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) }));
    jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
      SecretsManagerClient: function (config) {
        ctor(config);
        return { send: jest.fn().mockResolvedValue({}) };
      },
      GetSecretValueCommand: class {},
    }));
    const { REGION } = await import('../config/aws.js');
    await import('../config/secrets.js');
    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({ region: REGION }));
  });

  test('processCv imports region config', () => {
    const content = fs.readFileSync(path.resolve('routes/processCv.js'), 'utf8');
    expect(content).toMatch(/from '\.\.\/config\/aws\.js'/);
    expect(content).not.toMatch(/AWS_REGION/);
    expect(content).not.toMatch(/ap-south-1/);
  });
});
