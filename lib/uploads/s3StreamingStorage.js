import { PassThrough } from 'stream';
import { Upload } from '@aws-sdk/lib-storage';

function ensureResumeUploadContext(req) {
  if (!req || typeof req !== 'object') {
    return {};
  }
  if (!req.resumeUploadContext || typeof req.resumeUploadContext !== 'object') {
    req.resumeUploadContext = {};
  }
  return req.resumeUploadContext;
}

export function createS3StreamingStorage({
  s3Client,
  defaultContentType = 'application/octet-stream',
} = {}) {
  const resolveClient =
    typeof s3Client === 'function'
      ? s3Client
      : () => s3Client;

  return {
    _handleFile(req, file, cb) {
      const client = resolveClient();
      if (!client || typeof client !== 'object') {
        cb(new Error('S3 client unavailable for upload.'));
        return;
      }
      const context = ensureResumeUploadContext(req);
      const bucket = context.bucket;
      const key = context.key;
      if (!bucket) {
        cb(new Error('Upload bucket was not configured for the request.'));
        return;
      }
      if (!key) {
        cb(new Error('Upload key was not configured for the request.'));
        return;
      }

      const contentType = context.contentType || file.mimetype || defaultContentType;
      const passThrough = new PassThrough();
      let uploadedBytes = 0;
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: passThrough,
          ContentType: contentType,
        },
      });

      file.stream.on('data', (chunk) => {
        if (chunk) {
          uploadedBytes += chunk.length || 0;
        }
      });

      file.stream.on('error', (err) => {
        passThrough.destroy(err);
      });

      file.stream.pipe(passThrough);

      upload
        .done()
        .then(() => {
          cb(null, {
            bucket,
            key,
            size: uploadedBytes,
            contentType,
            location: `s3://${bucket}/${key}`,
          });
        })
        .catch((err) => {
          cb(err);
        });
    },
    _removeFile(req, file, cb) {
      if (typeof cb === 'function') {
        cb(null);
      }
    },
  };
}

export default createS3StreamingStorage;
