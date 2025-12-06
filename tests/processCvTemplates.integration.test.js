import { jest } from '@jest/globals';
import request from 'supertest';
import { setupTestServer, primeSuccessfulAi } from './utils/testServer.js';

const MANUAL_JOB_DESCRIPTION = `
Design performant distributed systems, mentor engineers, and collaborate with cross-functional partners.
Lead delivery of resilient services while continuously improving developer experience.
`;

describe.skip('template coverage for /api/process-cv', () => {
  test('generates downloadable PDFs for every supported resume template', async () => {
    const { app, mocks, serverModule } = await setupTestServer();

    const seenTemplates = new Set();

    for (const templateId of serverModule.CV_TEMPLATES) {
      mocks.mockS3Send.mockClear();
      await primeSuccessfulAi();

      const response = await request(app)
        .post('/api/process-cv')
        .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
        .field('template', templateId)
        .field('templateId', templateId)
        .attach('resume', Buffer.from('dummy pdf content'), 'resume.pdf');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const resumeEntries = response.body.urls.filter(
        (entry) =>
          entry.templateType === 'resume' &&
          entry.type !== 'original_upload' &&
          entry.type !== 'original_upload_pdf'
      );

      expect(resumeEntries.length).toBeGreaterThan(0);
      expect(
        resumeEntries.some((entry) => entry.templateId === templateId && /\.pdf/.test(entry.url))
      ).toBe(true);

      const pdfCommands = mocks.mockS3Send.mock.calls
        .map(([command]) => command)
        .filter((command) => command.__type === 'PutObjectCommand')
        .filter((command) => typeof command.input?.Key === 'string' && command.input.Key.endsWith('.pdf'));

      expect(pdfCommands.length).toBeGreaterThan(0);
      expect(
        pdfCommands.some((command) => command.input.Key.includes(`/${templateId}/`))
      ).toBe(true);
      const generatedPdfCommands = pdfCommands.filter(
        (command) => !/\/incoming\//.test(String(command.input?.Key))
      );

      expect(
        generatedPdfCommands.every(
          (command) => command.input?.ContentType === 'application/pdf'
        )
      ).toBe(true);
      for (const command of pdfCommands) {
        const body = command.input?.Body;
        const byteLength = Buffer.isBuffer(body)
          ? body.length
          : typeof body === 'string'
            ? Buffer.byteLength(body)
            : typeof body?.byteLength === 'number'
              ? body.byteLength
              : 0;
        expect(byteLength).toBeGreaterThan(0);
      }

      seenTemplates.add(templateId);
    }

    expect(seenTemplates.size).toBe(serverModule.CV_TEMPLATES.length);
  });

  test('maintains fallback template mapping when primary render fails', async () => {
    const { app, serverModule } = await setupTestServer();

    await primeSuccessfulAi();

    const pdfMock = jest.fn((text, templateId) => {
      if (templateId === 'modern' || templateId === 'cover_modern') {
        throw new Error(`render failed for ${templateId}`);
      }
      return Promise.resolve(Buffer.from(`pdf:${templateId}`));
    });

    serverModule.setGeneratePdf(pdfMock);

    const response = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy pdf content'), 'resume.pdf');

    serverModule.setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const templateContext = response.body.templateContext;
    expect(templateContext).toBeDefined();
    expect(templateContext.template1).toBeDefined();
    expect(templateContext.template1).not.toBe('modern');
    expect(templateContext.selectedTemplate).toBe(templateContext.template1);
    expect(Array.isArray(templateContext.templates)).toBe(true);
    expect(templateContext.templates[0]).toBe(templateContext.template1);

    const version1Entry = response.body.urls.find((entry) => entry.type === 'version1');
    expect(version1Entry).toBeDefined();
    expect(version1Entry.templateId).toBe(templateContext.template1);

    const coverEntry = response.body.urls.find((entry) => entry.type === 'cover_letter1');
    expect(coverEntry).toBeDefined();
    expect(coverEntry.templateId).toBe(templateContext.coverTemplate1);
    expect(templateContext.coverTemplate1).not.toBe('cover_modern');

    expect(pdfMock).toHaveBeenCalledWith(expect.any(String), 'modern', expect.any(Object));
    expect(pdfMock).toHaveBeenCalledWith(expect.any(String), templateContext.template1, expect.any(Object));
    expect(pdfMock).toHaveBeenCalledWith(expect.any(String), 'cover_modern', expect.any(Object));
    expect(pdfMock).toHaveBeenCalledWith(
      expect.any(String),
      templateContext.coverTemplate1,
      expect.objectContaining({ skipRequiredSections: true })
    );
  });
});
