import { mergeResumeWithLinkedIn } from '../server.js';

describe('mergeResumeWithLinkedIn', () => {
  test('overwrites most recent title with job title from JD', () => {
    const resumeText = 'Resume';
    const profile = {
      experience: [
        { company: 'Acme', title: 'Engineer', startDate: '2020', endDate: '2021' },
        { company: 'Beta', title: 'Intern', startDate: '2019', endDate: '2020' }
      ]
    };
    const merged = mergeResumeWithLinkedIn(resumeText, profile, 'Senior Engineer');
    expect(merged).toContain('LinkedIn Experience: Senior Engineer at Acme (2020 - 2021); Intern at Beta (2019 - 2020)');
  });
});
