import { generateProjectSummary } from '../server.js';

describe('generateProjectSummary', () => {
  test('sanitizes code-like input and removes symbols', () => {
    const summary = generateProjectSummary(
      'Improve efficiency by 20% (optimize loops) ```console.log("hi")``` {test}',
      ['Node.js']
    );
    expect(summary).toBe(
      'Led a project using Node.js to improve efficiency by 20% optimize loops test.'
    );
    expect(summary).not.toMatch(/[(){}]/);
    expect(summary).not.toMatch(/console\.log/);
    const periods = summary.match(/\.(?:\s|$)/g) || [];
    expect(periods.length).toBe(1);
  });

  test('uses business impact template with skills list', () => {
    const summary = generateProjectSummary(
      'Boost revenue by 30% through automation and analytics',
      ['Python', 'SQL', 'Docker', 'AWS']
    );
    expect(summary).toBe(
      'Led a project using Python, SQL, Docker to boost revenue by 30% through automation and analytics.'
    );
    const periods = summary.match(/\.(?:\s|$)/g) || [];
    expect(periods.length).toBe(1);
  });
});

