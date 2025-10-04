import { jest } from '@jest/globals';

export const getSignedUrl = jest
  .fn((client, command = {}, options = {}) => {
    const key = command?.input?.Key ?? 'mock-key';
    const expiresIn = options?.expiresIn ?? 0;
    return Promise.resolve(
      `https://example.com/${key}?X-Amz-Signature=mock-signature&X-Amz-Expires=${expiresIn}`
    );
  });

export default { getSignedUrl };
