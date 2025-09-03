import { jest } from '@jest/globals';
export const getSignedUrl = jest.fn(async (_client, command) => {
  const key = command?.input?.Key || '';
  return `https://example.com/${key}`;
});
