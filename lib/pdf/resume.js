import PDFDocument from 'pdfkit';

/**
 * Render plain-text resume content into a PDF buffer. The helper keeps PDFKit
 * usage contained within the shared lib so Lambda handlers can focus on IO
 * orchestration.
 *
 * @param {string} text - Resume body to render.
 * @returns {Promise<Buffer>} Buffer containing the generated PDF.
 */
export function renderResumePdfBuffer(text = '') {
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

export default renderResumePdfBuffer;
