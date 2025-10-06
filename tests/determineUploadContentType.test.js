import { determineUploadContentType } from '../server.js';

describe('determineUploadContentType', () => {
  const buildFile = (overrides = {}) => ({
    mimetype: '',
    buffer: Buffer.alloc(0),
    originalname: 'document.pdf',
    ...overrides,
  });

  it('detects PDF content regardless of declared type', () => {
    const buffer = Buffer.from('%PDF-1.7\n%âãÏÓ');
    const type = determineUploadContentType(
      buildFile({ mimetype: 'text/plain', buffer, originalname: 'resume.txt' })
    );

    expect(type).toBe('application/pdf');
  });

  it('normalizes declared PDF types with parameters', () => {
    const buffer = Buffer.from('%PDF-1.4\n');
    const type = determineUploadContentType(
      buildFile({ mimetype: 'application/pdf; charset=utf-8', buffer })
    );

    expect(type).toBe('application/pdf');
  });

  it('falls back when the PDF signature is missing', () => {
    const buffer = Buffer.from('not-a-pdf');
    const type = determineUploadContentType(
      buildFile({ mimetype: 'application/pdf', buffer })
    );

    expect(type).toBe('application/octet-stream');
  });

  it('derives Word content types from the file extension when mime is generic', () => {
    const type = determineUploadContentType(
      buildFile({
        mimetype: 'application/octet-stream',
        originalname: 'resume.docx',
      })
    );

    expect(type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('retains explicit non-generic MIME declarations', () => {
    const type = determineUploadContentType(
      buildFile({ mimetype: 'text/plain; charset=utf-8', originalname: 'notes.txt' })
    );

    expect(type).toBe('text/plain');
  });
});
