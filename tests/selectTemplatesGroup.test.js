import { selectTemplates, CV_TEMPLATES, CV_TEMPLATE_GROUPS } from '../server.js';
import fs from 'fs/promises';
import path from 'path';

describe('selectTemplates respects preferred templates and contrast', () => {
  test.each(CV_TEMPLATES)('prioritises preferred template %s', (tpl) => {
    const { template1, template2, coverTemplate1 } = selectTemplates({
      preferredTemplate: tpl,
    });
    expect(template1).toBe(tpl);
    expect(template2).not.toBe(template1);
    expect(CV_TEMPLATES).toContain(template2);
    expect(CV_TEMPLATE_GROUPS[template1]).not.toBe(
      CV_TEMPLATE_GROUPS[template2]
    );
    const expectedCover = ['classic', 'professional', 'ucmo'].includes(template1)
      ? 'cover_classic'
      : 'cover_modern';
    expect(coverTemplate1).toBe(expectedCover);
  });

  test('uses explicit template1 when no preference supplied', () => {
    const { template1, template2, coverTemplate1 } = selectTemplates({
      template1: 'vibrant',
    });
    expect(template1).toBe('vibrant');
    expect(template2).not.toBe('vibrant');
    expect(CV_TEMPLATE_GROUPS[template2]).not.toBe(CV_TEMPLATE_GROUPS['vibrant']);
    expect(coverTemplate1).toBe('cover_modern');
  });

  test('defaults to ucmo when nothing provided', () => {
    const { template1, template2, coverTemplate1 } = selectTemplates();
    expect(template1).toBe('ucmo');
    expect(template2).not.toBe('ucmo');
    expect(CV_TEMPLATES).toContain(template2);
    expect(CV_TEMPLATE_GROUPS[template2]).not.toBe(CV_TEMPLATE_GROUPS['ucmo']);
    expect(coverTemplate1).toBe('cover_classic');
  });

  test('heading styles are bold across templates', async () => {
    const styles = {};
    for (const tpl of CV_TEMPLATES) {
      const htmlPath = path.resolve('templates', `${tpl}.html`);
      let src = await fs.readFile(htmlPath, 'utf8');
      let match = src.match(/h2\s*{[^}]*}/i);
      if (!match) {
        try {
          const css = await fs.readFile(path.resolve('templates', `${tpl}.css`), 'utf8');
          match = css.match(/h2\s*{[^}]*}/i);
        } catch {}
      }
      styles[tpl] = match ? match[0] : '';
      expect(styles[tpl]).toMatch(/font-weight:\s*700/);
    }
  });
});
