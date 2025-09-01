import { selectTemplates, CV_TEMPLATES, CV_TEMPLATE_GROUPS } from '../server.js';

describe('selectTemplates group enforcement', () => {
  test.each(CV_TEMPLATES)('replaces second template when both are %s', (tpl) => {
    const { template1, template2 } = selectTemplates({ template1: tpl, template2: tpl });
    expect(template1).toBe(tpl);
    expect(template2).not.toBe(tpl);
    expect(CV_TEMPLATE_GROUPS[template1]).not.toBe(CV_TEMPLATE_GROUPS[template2]);
  });

  test('defaults template1 to ucmo and contrasts with provided template2', () => {
    const { template1, template2 } = selectTemplates({ template2: 'ucmo' });
    expect(template1).toBe('ucmo');
    expect(template2).not.toBe('ucmo');
    expect(CV_TEMPLATE_GROUPS[template1]).not.toBe(CV_TEMPLATE_GROUPS[template2]);
  });
});
