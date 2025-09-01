import { selectTemplates, CV_TEMPLATES, CV_TEMPLATE_GROUPS } from '../server.js';
import fs from 'fs/promises';
import path from 'path';

describe('selectTemplates enforces ucmo and distinct groups', () => {
  test.each(CV_TEMPLATES)('includes ucmo when both templates are %s', (tpl) => {
    const { template1, template2 } = selectTemplates({ template1: tpl, template2: tpl });
    expect([template1, template2]).toContain('ucmo');
    expect(CV_TEMPLATE_GROUPS[template1]).not.toBe(
      CV_TEMPLATE_GROUPS[template2]
    );
  });

  test('overrides when neither input is ucmo', () => {
    const { template1, template2 } = selectTemplates({
      template1: 'modern',
      template2: 'professional'
    });
    expect([template1, template2]).toContain('ucmo');
    expect(CV_TEMPLATE_GROUPS[template1]).not.toBe(
      CV_TEMPLATE_GROUPS[template2]
    );
  });

  test('random selection yields ucmo and distinct groups', () => {
    for (let i = 0; i < 20; i++) {
      const { template1, template2 } = selectTemplates();
      expect([template1, template2]).toContain('ucmo');
      expect(CV_TEMPLATE_GROUPS[template1]).not.toBe(
        CV_TEMPLATE_GROUPS[template2]
      );
    }
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
