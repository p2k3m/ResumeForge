import { jest } from '@jest/globals';
import { generateProjectSummary } from '../server.js';

describe('generateProjectSummary', () => {
  test('returns sentence from generative model', async () => {
    const generativeModel = {
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'Led a project using Node.js to improve efficiency by 20%.' }
      })
    };

    const summary = await generateProjectSummary(
      'Improve efficiency by 20% (optimize loops) ```console.log("hi")``` {test}',
      ['Node.js'],
      [],
      generativeModel
    );

    expect(generativeModel.generateContent).toHaveBeenCalledTimes(1);
    const prompt = generativeModel.generateContent.mock.calls[0][0];
    expect(prompt).toContain('Improve efficiency by 20% optimize loops test');
    expect(prompt).toContain('Node.js');

    expect(summary).toBe(
      'Led a project using Node.js to improve efficiency by 20%.'
    );
    expect(summary).not.toMatch(/[(){}]/);
    const periods = summary.match(/\.(?:\s|$)/g) || [];
    expect(periods.length).toBe(1);
  });

  test('falls back when generative model fails', async () => {
    const generativeModel = {
      generateContent: jest.fn().mockRejectedValue(new Error('fail'))
    };

    const summary = await generateProjectSummary(
      'Improve efficiency by 20% (optimize loops) ```console.log("hi")``` {test}',
      ['Node.js'],
      [],
      generativeModel
    );

    expect(summary).toBe(
      'Led a project using Node.js to improve efficiency by 20% optimize loops test.'
    );
    expect(summary).not.toMatch(/[(){}]/);
    const periods = summary.match(/\.(?:\s|$)/g) || [];
    expect(periods.length).toBe(1);
    expect(generativeModel.generateContent).toHaveBeenCalled();
  });
});

