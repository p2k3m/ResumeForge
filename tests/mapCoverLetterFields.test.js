import { mapCoverLetterFields } from '../server.js'

describe('mapCoverLetterFields', () => {
  test('extracts structured contact, job, and motivation data', () => {
    const text = [
      'Dear Hiring Manager,',
      'I am excited to apply for the Senior Software Engineer role at your company.',
      'In my previous role I led cross-functional teams using JavaScript and AWS to ship secure APIs.',
      'Thank you for your consideration.',
      'Sincerely,',
      'Jane Candidate'
    ].join('\n\n')

    const contactDetails = {
      email: 'jane@example.com',
      phone: '+1 555-123-4567',
      linkedin: 'https://linkedin.com/in/janecandidate',
      cityState: 'Austin, TX',
      contactLines: [
        'Email: jane@example.com',
        'Phone: +1 555-123-4567',
        'LinkedIn: https://linkedin.com/in/janecandidate'
      ]
    }

    const result = mapCoverLetterFields({
      text,
      contactDetails,
      jobTitle: 'Senior Software Engineer',
      jobDescription:
        'Design and build scalable services. Collaborate across teams to deliver secure APIs for customers.',
      jobSkills: ['JavaScript', 'AWS', 'TypeScript'],
      applicantName: 'Jane Candidate',
      letterIndex: 1
    })

    expect(result.raw).toContain('excited to apply')
    expect(result.greeting).toMatch(/^Dear Hiring Manager/i)
    expect(result.contact.email).toBe('jane@example.com')
    expect(result.contact.lines).toContain('Phone: +1 555-123-4567')
    expect(result.job.title).toBe('Senior Software Engineer')
    expect(result.job.skills).toEqual(expect.arrayContaining(['JavaScript', 'AWS', 'TypeScript']))
    expect(result.job.summary).toContain('Design and build scalable services')
    expect(result.motivation.paragraph).toMatch(/excited to apply/i)
    expect(result.motivation.keywords).toContain('excited')
    expect(result.motivation.matchedSkills).toContain('JavaScript')
    expect(result.closing.salutation).toMatch(/^Sincerely/i)
    expect(result.closing.signature).toMatch(/Jane Candidate/) 
    expect(result.metadata.letterIndex).toBe(1)
    expect(result.metadata.paragraphCount).toBeGreaterThan(0)
  })

  test('returns defaults when cover letter text is missing', () => {
    const result = mapCoverLetterFields({
      text: '',
      contactDetails: {},
      jobTitle: 'Product Manager',
      jobDescription: 'Lead product strategy.',
      jobSkills: ['Roadmaps'],
      applicantName: 'Alex Doe',
      letterIndex: 2
    })

    expect(result.raw).toBe('')
    expect(result.paragraphs).toEqual([])
    expect(result.contact.email).toBe('')
    expect(result.job.title).toBe('Product Manager')
    expect(result.job.skills).toEqual(['Roadmaps'])
    expect(result.motivation.paragraph).toBe('')
    expect(result.metadata.letterIndex).toBe(2)
  })
})
