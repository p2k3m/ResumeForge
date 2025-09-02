import { jest } from '@jest/globals';

export const filesCreate = jest.fn(async () => ({ id: 'file-id' }));
export const responsesCreate = jest.fn(async () => ({
  output_text: JSON.stringify({
    cv_version1: 'v1',
    cv_version2: 'v2',
    cover_letter1: 'cl1',
    cover_letter2: 'cl2',
    original_score: 40,
    enhanced_score: 80,
    skills_added: ['skill1'],
    improvement_summary: 'summary'
  })
}));

export default class OpenAI {
  constructor() {
    this.files = { create: filesCreate };
    this.responses = { create: responsesCreate };
  }
}
