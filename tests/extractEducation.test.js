import { extractEducation } from '../server.js';

describe('extractEducation', () => {
  test('extracts bullet items from resume text', () => {
    const text = 'Education\n- BSc Computer Science - MIT\n\nExperience';
    expect(extractEducation(text)).toEqual(['BSc Computer Science - MIT']);
  });

  test('extracts from array inputs', () => {
    const arr = ['Harvard University, MBA', 'MIT, BSc'];
    expect(extractEducation(arr)).toEqual(arr);
  });
});
