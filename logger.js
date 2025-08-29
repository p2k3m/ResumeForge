import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

export async function logEvent({ s3, bucket, key, jobId, event, level = 'info', message }) {
  const entry = {
    timestamp: new Date().toISOString(),
    jobId,
    event,
    level
  };
  if (message) entry.message = message;

  let existing = '';
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    existing = await streamToString(res.Body);
  } catch (err) {
    if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
      throw err;
    }
  }

  const body = existing + JSON.stringify(entry) + '\n';
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/json' }));
}
