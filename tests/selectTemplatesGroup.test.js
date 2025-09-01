import { selectTemplates, CV_TEMPLATES, CV_TEMPLATE_GROUPS } from '../server.js';

describe('selectTemplates enforces ucmo presence', () => {
  test.each(CV_TEMPLATES)('includes ucmo when both templates are %s', (tpl) => {
    const { template1, template2 } = selectTemplates({ template1: tpl, template2: tpl });
    expect([template1, template2]).toContain('ucmo');
    const other = template1 === 'ucmo' ? template2 : template1;
    expect(other).not.toBe('ucmo');
    expect(CV_TEMPLATE_GROUPS[other]).not.toBe(CV_TEMPLATE_GROUPS['ucmo']);
  });

  test('overrides when neither input is ucmo', () => {
    const { template1, template2 } = selectTemplates({
      template1: 'modern',
      template2: 'professional'
    });
    expect([template1, template2]).toContain('ucmo');
    const other = template1 === 'ucmo' ? template2 : template1;
    expect(other).not.toBe('ucmo');
    expect(CV_TEMPLATE_GROUPS[other]).not.toBe(CV_TEMPLATE_GROUPS['ucmo']);
  });
});
