import { jest } from '@jest/globals';
import { Readable } from 'stream';

const stripUploadMetadataMock = jest.fn();
let uploadParamsCaptured;
const uploadDoneMock = jest.fn();
const uploadConstructorMock = jest.fn((options) => {
  uploadParamsCaptured = options.params;
  return { done: uploadDoneMock };
});

jest.unstable_mockModule('../../../lib/uploads/metadata.js', () => ({
  stripUploadMetadata: stripUploadMetadataMock,
}));

jest.unstable_mockModule('@aws-sdk/lib-storage', () => ({
  Upload: uploadConstructorMock,
}));

const { createS3StreamingStorage } = await import('../../../lib/uploads/s3StreamingStorage.js');

describe('createS3StreamingStorage', () => {
  beforeEach(() => {
    stripUploadMetadataMock.mockReset();
    stripUploadMetadataMock.mockImplementation(async () => Buffer.from('sanitized'));
    uploadParamsCaptured = undefined;
    uploadConstructorMock.mockClear();
    uploadDoneMock.mockReset();
    uploadDoneMock.mockResolvedValue(undefined);
  });

  test('uploads sanitised buffer when streaming upload unsupported', async () => {
    const client = {
      send: jest.fn().mockResolvedValue({}),
    };

    const storage = createS3StreamingStorage({ s3Client: client });
    const req = { resumeUploadContext: { bucket: 'bucket', key: 'key' } };
    const file = {
      stream: Readable.from([Buffer.from('original')]),
      mimetype: 'application/pdf',
      originalname: 'resume.pdf',
    };

    const result = await new Promise((resolve, reject) => {
      storage._handleFile(req, file, (err, info) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(info);
      });
    });

    expect(stripUploadMetadataMock).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
      mimeType: 'application/pdf',
      originalName: 'resume.pdf',
    });
    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0][0];
    expect(command.input.Body.equals(Buffer.from('sanitized'))).toBe(true);
    expect(command.input.Metadata).toEqual(
      expect.objectContaining({
        'build-version': expect.any(String),
        'build-sha': expect.any(String),
        'build-timestamp': expect.any(String),
      })
    );
    expect(command.input.Tagging).toEqual(
      expect.stringMatching(/(^|&)build=[^&]+(&|$)/)
    );
    expect(command.input.Tagging).toEqual(
      expect.stringMatching(/(^|&)deployed=[^&]+(&|$)/)
    );
    expect(result).toEqual({
      bucket: 'bucket',
      key: 'key',
      size: Buffer.from('sanitized').length,
      contentType: 'application/pdf',
      location: 's3://bucket/key',
    });
    expect(uploadConstructorMock).not.toHaveBeenCalled();
  });

  test('uses multipart upload client with sanitised body when available', async () => {
    const client = {
      send: jest.fn().mockResolvedValue({}),
      config: {
        requestHandler: {
          handle: jest.fn(),
        },
      },
    };

    const storage = createS3StreamingStorage({ s3Client: client });
    const req = { resumeUploadContext: { bucket: 'bucket', key: 'key' } };
    const file = {
      stream: Readable.from([Buffer.from('original')]),
      mimetype: 'application/pdf',
      originalname: 'resume.pdf',
    };

    const result = await new Promise((resolve, reject) => {
      storage._handleFile(req, file, (err, info) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(info);
      });
    });

    expect(uploadConstructorMock).toHaveBeenCalledTimes(1);
    expect(uploadParamsCaptured).toEqual({
      Bucket: 'bucket',
      Key: 'key',
      Body: Buffer.from('sanitized'),
      ContentType: 'application/pdf',
      Metadata: expect.objectContaining({
        'build-version': expect.any(String),
        'build-sha': expect.any(String),
        'build-timestamp': expect.any(String),
      }),
      Tagging: expect.stringMatching(/(^|&)build=[^&]+(&|$)/),
    });
    expect(uploadParamsCaptured.Tagging).toEqual(
      expect.stringMatching(/(^|&)deployed=[^&]+(&|$)/)
    );
    expect(uploadDoneMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      bucket: 'bucket',
      key: 'key',
      size: Buffer.from('sanitized').length,
      contentType: 'application/pdf',
      location: 's3://bucket/key',
    });
  });
});
