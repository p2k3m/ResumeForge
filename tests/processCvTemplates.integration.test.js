import request from 'supertest';
import { setupTestServer, primeSuccessfulAi } from './utils/testServer.js';

const MANUAL_JOB_DESCRIPTION = `
Design performant distributed systems, mentor engineers, and collaborate with cross-functional partners.
Lead delivery of resilient services while continuously improving developer experience.
`;

describe('template coverage for /api/process-cv', () => {
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
        (entry) => entry.templateType === 'resume' && entry.type !== 'original_upload'
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
        pdfCommands.some((command) => command.input.Key.includes(`enhanced_${templateId}`))
      ).toBe(true);
      expect(
        pdfCommands.every((command) => command.input?.ContentType === 'application/pdf')
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
});
