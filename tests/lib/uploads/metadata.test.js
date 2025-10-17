import { PDFDocument, PDFName } from 'pdf-lib';
import JSZip from 'jszip';
import { read as readCfb, utils as cfbUtils, write as writeCfb } from 'cfb';
import { stripUploadMetadata } from '../../../lib/uploads/metadata.js';

describe('stripUploadMetadata', () => {
  test('removes PDF metadata dictionaries', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([200, 200]);
    pdfDoc.setTitle('Confidential Resume');
    pdfDoc.setAuthor('Jane Doe');
    const pdfBytes = await pdfDoc.save();

    const sanitised = await stripUploadMetadata({
      buffer: Buffer.from(pdfBytes),
      mimeType: 'application/pdf',
      originalName: 'resume.pdf',
    });

    const reloaded = await PDFDocument.load(sanitised);
    expect(reloaded.context?.trailer?.get?.(PDFName.of('Info'))).toBeUndefined();
    const catalogDict = reloaded.catalog?.dict;
    expect(catalogDict?.get?.(PDFName.of('Metadata'))).toBeUndefined();
  });

  test('removes docx property parts', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`);
    zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
    zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Resume</w:t></w:r></w:p>
  </w:body>
</w:document>`);
    zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
    zip.folder('docProps').file('core.xml', '<coreProperties xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"></coreProperties>');
    zip.folder('docProps').file('app.xml', '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"></Properties>');
    const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const sanitised = await stripUploadMetadata({
      buffer: docxBuffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      originalName: 'resume.docx',
    });

    const reloaded = await JSZip.loadAsync(sanitised);
    expect(reloaded.file('docProps/core.xml')).toBeNull();
    expect(reloaded.file('docProps/app.xml')).toBeNull();
  });

  test('removes summary information streams from doc files', async () => {
    const cfb = cfbUtils.cfb_new();
    cfbUtils.cfb_add(cfb, '\u0005SummaryInformation', Buffer.from('test'));
    cfbUtils.cfb_add(cfb, 'WordDocument', Buffer.from('stub'));
    const docBuffer = writeCfb(cfb, { type: 'buffer' });

    const sanitised = await stripUploadMetadata({
      buffer: Buffer.from(docBuffer),
      mimeType: 'application/msword',
      originalName: 'resume.doc',
    });

    const reloaded = readCfb(sanitised, { type: 'buffer' });
    expect(reloaded.FullPaths.some((path) => path.includes('SummaryInformation'))).toBe(false);
  });

  test('returns original buffer for unsupported types', async () => {
    const buffer = Buffer.from('plain-text');
    const sanitised = await stripUploadMetadata({
      buffer,
      mimeType: 'text/plain',
      originalName: 'notes.txt',
    });
    expect(sanitised).toBe(buffer);
  });
});
