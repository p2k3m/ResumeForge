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
    const expectedCover = ['classic', 'professional'].includes(template1)
      ? 'cover_classic'
      : 'cover_modern';
    expect(coverTemplate1).toBe(expectedCover);
  });

  test('uses explicit template1 when no preference supplied', () => {
    const { template1, template2, coverTemplate1, coverTemplates } = selectTemplates({
      template1: 'ats',
    });
    expect(template1).toBe('ats');
    expect(template2).not.toBe('ats');
    expect(CV_TEMPLATE_GROUPS[template2]).not.toBe(CV_TEMPLATE_GROUPS['ats']);
    expect(coverTemplate1).toBe('cover_modern');
    expect(coverTemplates[0]).toBe('cover_modern');
  });

  test('derives cover template from resume style when not provided', () => {
    const { coverTemplate1, coverTemplates } = selectTemplates({
      template1: 'classic',
    });
    expect(coverTemplate1).toBe('cover_classic');
    expect(coverTemplates[0]).toBe('cover_classic');
  });

  test('respects explicit cover template selection', () => {
    const { coverTemplate1 } = selectTemplates({
      template1: 'classic',
      coverTemplate1: 'cover_modern',
    });
    expect(coverTemplate1).toBe('cover_modern');
  });

  test('defaults to modern when nothing provided', () => {
    const { template1, template2, coverTemplate1 } = selectTemplates();
    expect(template1).toBe('modern');
    expect(template2).not.toBe('modern');
    expect(CV_TEMPLATES).toContain(template2);
    expect(CV_TEMPLATE_GROUPS[template2]).not.toBe(CV_TEMPLATE_GROUPS['modern']);
    expect(coverTemplate1).toBe('cover_modern');
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
