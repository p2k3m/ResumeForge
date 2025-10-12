import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { renderResumePdfBuffer } from '../lib/pdf/resume.js';
import { withEnvironmentTagging } from '../config/environment.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event = {}) => {
  const resumeText = typeof event.resumeText === 'string' ? event.resumeText : '';
  const jobId = typeof event.jobId === 'string' ? event.jobId : 'session';
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET environment variable is required to generate artifacts.');
  }
  const pdfBuffer = await renderResumePdfBuffer(resumeText);
  const key = `orchestration/${jobId}/enhanced-resume.pdf`;
  await s3Client.send(
    new PutObjectCommand(
      withEnvironmentTagging({
        Bucket: bucket,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      })
    )
  );
  return {
    success: true,
    bucket,
    key,
  };
};

export default handler;
