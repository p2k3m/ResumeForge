import { jest } from '@jest/globals';
import {
  DynamoDBClient,
  DescribeTableCommand,
  ScanCommand,
  DeleteItemCommand
} from '@aws-sdk/client-dynamodb';
import { cleanupOldRecords } from '../services/dynamo.js';

describe('cleanupOldRecords', () => {
  beforeEach(() => {
    process.env.DYNAMO_TABLE = 'test';
  });

  afterEach(() => {
    delete process.env.DYNAMO_TABLE;
    jest.restoreAllMocks();
  });

  test('removes items older than retention', async () => {
    const oldTs = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const recentTs = Date.now() - 10 * 24 * 60 * 60 * 1000;

    const sendMock = jest
      .spyOn(DynamoDBClient.prototype, 'send')
      .mockImplementation((cmd) => {
        if (cmd instanceof DescribeTableCommand) {
          return Promise.resolve({});
        }
        if (cmd instanceof ScanCommand) {
          return Promise.resolve({
            Items: [
              { jobId: { S: 'old' }, createdAt: { N: String(oldTs) } },
              { jobId: { S: 'new' }, createdAt: { N: String(recentTs) } }
            ]
          });
        }
        if (cmd instanceof DeleteItemCommand) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

    await cleanupOldRecords({ retentionDays: 30 });

    const deleteCalls = sendMock.mock.calls.filter(
      ([c]) => c instanceof DeleteItemCommand
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][0].input.Key.jobId.S).toBe('old');
  });
});
