import { PassThrough } from 'stream';
import { Upload } from '@aws-sdk/lib-storage';
import { PutObjectCommand } from '@aws-sdk/client-s3';

function ensureResumeUploadContext(req) {
  if (!req || typeof req !== 'object') {
    return {};
  }
  if (!req.resumeUploadContext || typeof req.resumeUploadContext !== 'object') {
    req.resumeUploadContext = {};
  }
  return req.resumeUploadContext;
}

function toUploadStorageError(err, { code } = {}) {
  if (err instanceof Error) {
    if (code && !err.code) {
      err.code = code;
    }
    err.isUploadStorageError = true;
    return err;
  }

  const message =
    (err && typeof err.message === 'string' && err.message) ||
    (typeof err === 'string' ? err : 'Upload failed');
  const error = new Error(message);
  error.code = code || 'UPLOAD_STORAGE_FAILED';
  error.isUploadStorageError = true;
  return error;
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
        cb(
          toUploadStorageError(new Error('S3 client unavailable for upload.'), {
            code: 'UPLOAD_CONFIGURATION_ERROR',
          })
        );
        return;
      }
      const context = ensureResumeUploadContext(req);
      const bucket = context.bucket;
      const key = context.key;
      if (!bucket) {
        cb(
          toUploadStorageError(
            new Error('Upload bucket was not configured for the request.'),
            { code: 'UPLOAD_CONFIGURATION_ERROR' }
          )
        );
        return;
      }
      if (!key) {
        cb(
          toUploadStorageError(
            new Error('Upload key was not configured for the request.'),
            { code: 'UPLOAD_CONFIGURATION_ERROR' }
          )
        );
        return;
      }

      const contentType = context.contentType || file.mimetype || defaultContentType;
      const supportsStreamingUpload = Boolean(
        client &&
          typeof client === 'object' &&
          typeof client.send === 'function' &&
          client.config &&
          client.config.requestHandler &&
          typeof client.config.requestHandler.handle === 'function'
      );

      if (supportsStreamingUpload) {
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
            cb(toUploadStorageError(err));
          });
        return;
      }

      const chunks = [];
      let uploadedBytes = 0;
      let settled = false;
      const finish = (err, info) => {
        if (settled) return;
        settled = true;
        cb(err, info);
      };

      file.stream.on('data', (chunk) => {
        if (!chunk) return;
        chunks.push(chunk);
        uploadedBytes += chunk.length || 0;
      });

      file.stream.on('error', (err) => {
        finish(toUploadStorageError(err));
      });

      file.stream.on('end', async () => {
        try {
          const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
          await client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: body,
              ContentType: contentType,
            })
          );
          finish(null, {
            bucket,
            key,
            size: uploadedBytes,
            contentType,
            location: `s3://${bucket}/${key}`,
          });
        } catch (err) {
          finish(toUploadStorageError(err));
        }
      });

      file.stream.resume();
    },
    _removeFile(req, file, cb) {
      if (typeof cb === 'function') {
        cb(null);
      }
    },
  };
}

export default createS3StreamingStorage;
