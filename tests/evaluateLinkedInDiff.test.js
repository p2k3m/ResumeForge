import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn().mockResolvedValue({ data: '' }) }
}));

jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
  default: jest
    .fn()
    .mockResolvedValue({ text: 'Experience\n- Engineer at Company\nEducation\n- Uni\nCertifications\n- CertA - OrgA' })
}));

jest.unstable_mockModule('mammoth', () => ({
  default: { extractRawText: jest.fn().mockResolvedValue({ value: '' }) }
}));

jest.unstable_mockModule('../services/dynamo.js', () => ({
  logEvaluation: jest.fn().mockResolvedValue()
}));

const serverModule = await import('../server.js');
const app = serverModule.default;
jest
  .spyOn(serverModule, 'fetchLinkedInProfile')
  .mockResolvedValue({
    experience: [
      { title: 'Engineer', company: 'Company' },
      { title: 'Manager', company: 'AnotherCo' }
    ],
    education: ['Uni', 'Masters Uni'],
    certifications: [
      { name: 'CertA', provider: 'OrgA' },
      { name: 'CertB', provider: 'OrgB' }
    ]
  });

jest
  .spyOn(serverModule, 'fetchCredlyProfile')
  .mockResolvedValue([
    { name: 'CertA', provider: 'OrgA' },
    { name: 'CertB', provider: 'OrgB' }
  ]);

describe('/api/evaluate LinkedIn diff', () => {
  test('returns missing LinkedIn items', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .field('jobDescriptionUrl', 'https://example.com/job')
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .field('credlyProfileUrl', 'https://credly.com/u/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.missingExperience).toEqual(['Manager at AnotherCo']);
    expect(res.body.missingEducation).toEqual(['Masters Uni']);
    expect(res.body.missingCertifications).toEqual([
      { name: 'CertB', provider: 'OrgB' }
    ]);
  });
});
