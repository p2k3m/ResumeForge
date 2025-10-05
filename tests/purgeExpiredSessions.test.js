import { describe, expect, test } from '@jest/globals';
import { setupTestServer } from './utils/testServer.js';

const buildS3Object = (Key) => ({ Key });

describe('purgeExpiredSessions', () => {
  test('deletes S3 objects and DynamoDB metadata for expired sessions', async () => {
    const { serverModule, mocks } = await setupTestServer();
    const oldDate = '2023-01-01';
    const freshDate = '2024-01-15';
    const sessionId = 'session-abc123';
    const freshSessionId = 'session-fresh456';
    const sessionPrefix = `cv/candidate/${oldDate}/${sessionId}/`;
    const freshPrefix = `cv/candidate/${freshDate}/${freshSessionId}/`;

    const listedObjects = [
      buildS3Object(`${sessionPrefix}original.pdf`),
      buildS3Object(`${sessionPrefix}enhanced_primary.pdf`),
      buildS3Object(`${freshPrefix}original.pdf`),
    ];

    const deleteChunks = [];
    mocks.mockS3Send.mockImplementation((command) => {
      switch (command.__type) {
        case 'ListObjectsV2Command':
          return Promise.resolve({
            Contents: listedObjects,
            IsTruncated: false,
          });
        case 'DeleteObjectsCommand':
          deleteChunks.push(command.input.Delete.Objects);
          return Promise.resolve({ Deleted: command.input.Delete.Objects });
        default:
          return Promise.resolve({});
      }
    });

    const dynamoDeletes = [];
    mocks.mockDynamoSend.mockImplementation((command) => {
      switch (command.__type) {
        case 'ScanCommand':
          return Promise.resolve({
            Items: [
              {
                linkedinProfileUrl: { S: 'expired-hash' },
                s3Key: { S: `${sessionPrefix}original.pdf` },
                cv1Url: {
                  S: `https://example.com/${sessionPrefix}enhanced_primary.pdf?X-Amz-Signature=mock-signature&X-Amz-Expires=100`,
                },
              },
              {
                linkedinProfileUrl: { S: 'fresh-hash' },
                s3Key: { S: `${freshPrefix}original.pdf` },
              },
            ],
          });
        case 'DeleteItemCommand':
          dynamoDeletes.push(command.input.Key);
          return Promise.resolve({});
        default:
          return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
      }
    });

    const now = new Date('2024-02-01T00:00:00Z');
    const result = await serverModule.purgeExpiredSessions({
      retentionDays: 30,
      now,
    });

    expect(result.deleted).toBe(2);
    expect(result.metadataDeleted).toBe(1);

    expect(deleteChunks).toHaveLength(1);
    const deletedKeys = deleteChunks.flat().map((entry) => entry.Key);
    expect(deletedKeys).toEqual(
      expect.arrayContaining([
        `${sessionPrefix}original.pdf`,
        `${sessionPrefix}enhanced_primary.pdf`,
      ])
    );

    expect(dynamoDeletes).toEqual([
      { linkedinProfileUrl: { S: 'expired-hash' } },
    ]);
  });
});
