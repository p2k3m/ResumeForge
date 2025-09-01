import { analyzeJobDescription } from '../server.js';

describe('analyzeJobDescription', () => {
  test('includes skills that appear once', () => {
    const html = '<p>Proficiency in JavaScript is required.</p>';
    const { skills } = analyzeJobDescription(html);
    expect(skills).toContain('javascript');
  });

  test('pads skills list to five items', () => {
    const html = '<p>JavaScript and Python are needed.</p>';
    const { skills } = analyzeJobDescription(html);
    expect(skills.slice(0, 2)).toEqual(['javascript', 'python']);
    expect(skills).toHaveLength(5);
  });
});
