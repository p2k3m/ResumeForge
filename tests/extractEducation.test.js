import { extractEducation } from '../server.js';

describe('extractEducation', () => {
  test('extracts bullet items from resume text', () => {
    const text = 'Education\n- BSc Computer Science - MIT, GPA 3.8\n\nExperience';
    expect(extractEducation(text)).toEqual([
      { entry: 'BSc Computer Science - MIT', gpa: '3.8' }
    ]);
  });

  test('extracts from array inputs', () => {
    const arr = ['Harvard University, GPA: 4.0', 'MIT'];
    expect(extractEducation(arr)).toEqual([
      { entry: 'Harvard University', gpa: '4.0' },
      { entry: 'MIT', gpa: null },
    ]);
  });
});
