import { calculateMetrics, compareMetrics } from '../services/atsMetrics.js';

describe('ATS metric calculations', () => {
  test('calculateMetrics returns scores within 0-100', () => {
    const text = 'Managed project.\n- Improved efficiency\n- Led team';
    const metrics = calculateMetrics(text);
    expect(Object.keys(metrics)).toEqual([
      'layoutSearchability',
      'atsReadability',
      'impact',
      'crispness',
      'keywordDensity',
      'sectionHeadingClarity',
      'contactInfoCompleteness',
    ]);
    for (const score of Object.values(metrics)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  test('compareMetrics generates improvement table', () => {
    const original = 'Managed project.';
    const improved = 'Managed project and improved efficiency.\n- Led team to success.';
    const { table } = compareMetrics(original, improved);
    expect(table.length).toBeGreaterThan(0);
    const impactRow = table.find((r) => r.metric === 'impact');
    expect(impactRow.improved).toBeGreaterThanOrEqual(impactRow.original);
    expect(typeof impactRow.improvement).toBe('number');
  });
});
