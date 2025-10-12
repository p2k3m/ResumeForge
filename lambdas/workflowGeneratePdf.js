import PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

function renderPdfBuffer(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: true, size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));
    doc.fontSize(12).text(text || '', { align: 'left' });
    doc.end();
  });
}

export const handler = async (event = {}) => {
  const resumeText = typeof event.resumeText === 'string' ? event.resumeText : '';
  const jobId = typeof event.jobId === 'string' ? event.jobId : 'session';
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET environment variable is required to generate artifacts.');
  }
  const pdfBuffer = await renderPdfBuffer(resumeText);
  const key = `orchestration/${jobId}/enhanced-resume.pdf`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    })
  );
  return {
    success: true,
    bucket,
    key,
  };
};

export default handler;
