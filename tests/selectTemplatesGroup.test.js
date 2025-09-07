import { selectTemplates, CV_TEMPLATES, CV_TEMPLATE_GROUPS } from '../server.js';
import fs from 'fs/promises';
import path from 'path';

describe('selectTemplates defaults and overrides', () => {
  test('defaults to 2025 and a contrasting template when none provided', () => {
    const { template1, template2 } = selectTemplates();
    expect(template1).toBe('2025');
    expect(CV_TEMPLATES).toContain(template2);
    expect(template2).not.toBe('2025');
    expect(CV_TEMPLATE_GROUPS[template1]).not.toBe(
      CV_TEMPLATE_GROUPS[template2]
    );
  });

  test('overrides when templates are provided', () => {
    const { template1, template2 } = selectTemplates({
      template1: 'modern',
      template2: 'professional'
    });
    expect(template1).toBe('modern');
    expect(template2).toBe('professional');
  });

  test('single template defaults the other to a contrasting template', () => {
    const { template1, template2 } = selectTemplates({ template1: 'modern' });
    expect(template1).toBe('modern');
    expect(template2).not.toBe('modern');
    expect(CV_TEMPLATE_GROUPS[template1]).not.toBe(
      CV_TEMPLATE_GROUPS[template2]
    );
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
    expect(styles).toMatchSnapshot();
  });
});
