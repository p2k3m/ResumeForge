import PDFDocument from 'pdfkit';

export async function convertToPdf(content) {
  let text;
  if (typeof content === 'string') {
    text = content;
  } else {
    try {
      text = JSON.stringify(content, null, 2);
    } catch {
      text = String(content);
    }
  }
  const doc = new PDFDocument();
  const buffers = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (data) => buffers.push(data));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    doc.text(text);
    doc.end();
  });
}
