import path from 'path';
import { PDFDocument, PDFName } from 'pdf-lib';
import JSZip from 'jszip';
import { read as readCfb, write as writeCfb, utils as cfbUtils } from 'cfb';

const SUPPORTED_EXTENSIONS = new Map([
  ['.pdf', 'pdf'],
  ['.docx', 'docx'],
  ['.doc', 'doc'],
]);

function toBuffer(data) {
  if (!data) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  return Buffer.from(data);
}

async function stripPdfMetadata(buffer) {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const { context } = pdfDoc;
  if (context?.trailer?.has?.(PDFName.of('Info'))) {
    context.trailer.delete(PDFName.of('Info'));
  }
  const catalogDict = pdfDoc.catalog?.dict;
  if (catalogDict?.has?.(PDFName.of('Metadata'))) {
    catalogDict.delete(PDFName.of('Metadata'));
  }
  // Clearing out document metadata helpers just in case load helpers populate them
  try {
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');
  } catch {
    // ignore if setters unavailable
  }
  const sanitizedBytes = await pdfDoc.save({ useObjectStreams: false });
  return toBuffer(sanitizedBytes);
}

async function stripDocxMetadata(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  ['docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml'].forEach((entry) => {
    if (zip.file(entry)) {
      zip.remove(entry);
    }
  });
  Object.keys(zip.files)
    .filter((name) => name.startsWith('customXml/'))
    .forEach((name) => {
      zip.remove(name);
    });
  const sanitized = await zip.generateAsync({ type: 'nodebuffer' });
  return toBuffer(sanitized);
}

function stripDocMetadata(buffer) {
  const cfb = readCfb(buffer, { type: 'buffer' });
  const pathsToRemove = [
    '\u0005SummaryInformation',
    '\u0005DocumentSummaryInformation',
    'SummaryInformation',
    'DocumentSummaryInformation',
  ];
  pathsToRemove.forEach((fullPath) => {
    try {
      cfbUtils.cfb_del(cfb, fullPath);
    } catch {
      // path did not exist; ignore
    }
    try {
      cfbUtils.cfb_del(cfb, `/${fullPath}`);
    } catch {
      // ignore duplicate leading slash
    }
  });
  const sanitized = writeCfb(cfb, { type: 'buffer' });
  return toBuffer(sanitized);
}

function determineFileKind({ originalName, mimeType }) {
  const ext = typeof originalName === 'string' ? path.extname(originalName).toLowerCase() : '';
  if (SUPPORTED_EXTENSIONS.has(ext)) {
    return SUPPORTED_EXTENSIONS.get(ext);
  }
  const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  if (normalizedMime.includes('pdf')) {
    return 'pdf';
  }
  if (normalizedMime.includes('wordprocessingml') || normalizedMime.includes('docx')) {
    return 'docx';
  }
  if (normalizedMime.includes('msword')) {
    return 'doc';
  }
  return undefined;
}

export async function stripUploadMetadata({ buffer, mimeType, originalName }) {
  const resolvedBuffer = toBuffer(buffer);
  if (resolvedBuffer.length === 0) {
    return resolvedBuffer;
  }
  const kind = determineFileKind({ originalName, mimeType });
  if (!kind) {
    return resolvedBuffer;
  }
  try {
    if (kind === 'pdf') {
      return await stripPdfMetadata(resolvedBuffer);
    }
    if (kind === 'docx') {
      return await stripDocxMetadata(resolvedBuffer);
    }
    if (kind === 'doc') {
      return stripDocMetadata(resolvedBuffer);
    }
  } catch (err) {
    // On any sanitisation failure we fall back to the original buffer
    return resolvedBuffer;
  }
  return resolvedBuffer;
}

export default {
  stripUploadMetadata,
};
