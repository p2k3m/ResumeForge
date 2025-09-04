import { jest } from '@jest/globals';
import { Readable } from 'stream';
import { logEvent } from '../logger.js';

describe('logEvent', () => {
  it('logs and continues when get fails', async () => {
    const s3 = { send: jest.fn() };
    s3.send.mockRejectedValueOnce(new Error('get failed'));
    s3.send.mockResolvedValueOnce();
    const logger = { error: jest.fn() };

    await expect(
      logEvent({ s3, bucket: 'b', key: 'k', jobId: '1', event: 'evt', logger })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith('Error retrieving log from S3', expect.any(Error));
    expect(s3.send).toHaveBeenCalledTimes(2);
  });

  it('logs error when put fails', async () => {
    const s3 = { send: jest.fn() };
    s3.send.mockResolvedValueOnce({ Body: Readable.from([]) });
    s3.send.mockRejectedValueOnce(new Error('put failed'));
    const logger = { error: jest.fn() };

    await expect(
      logEvent({ s3, bucket: 'b', key: 'k', jobId: '1', event: 'evt', logger })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith('Error uploading log to S3', expect.any(Error));
  });
});
