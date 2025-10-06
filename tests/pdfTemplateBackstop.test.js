import { backstopPdfTemplates } from '../scripts/pdf-template-backstop.mjs';

describe('pdf template backstop', () => {
  test('renders mock content for 2025 variants', async () => {
    const results = await backstopPdfTemplates({ logger: null });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    results.forEach((entry) => {
      expect(entry).toHaveProperty('templateId');
      expect(entry.templateId).toMatch(/^2025/);
      expect(entry.bytes).toBeGreaterThan(0);
    });
  });
});
