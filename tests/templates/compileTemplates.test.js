import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import Handlebars from '../../lib/handlebars.js';

const templates = [
  '2025',
  'cover_classic',
  'cover_modern',
  'modern',
  'professional',
  'ucmo',
  'vibrant',
  'sleek'
];

describe('handlebars template compilation', () => {
  test.each(templates)('%s template compiles without leftover helpers', async (tpl) => {
    const src = await fs.readFile(path.resolve('templates', `${tpl}.html`), 'utf8');
    const data = {
      name: 'Jane Doe',
      phone: '555-555-5555',
      email: 'jane@example.com',
      cityState: 'Nowhere, XX',
      linkedin: 'linkedin.com/in/jane',
      sections: [
        { heading: 'Heading', items: ['First item', 'Second item'] }
      ]
    };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const html = Handlebars.compile(src)(data);
    warnSpy.mockRestore();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(html).not.toMatch(/{{[^}]+}}/);
  });
});
