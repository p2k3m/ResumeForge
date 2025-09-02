import { jest } from '@jest/globals';

export const uploadFile = jest.fn(async () => ({ id: 'file-id' }));

export const requestEnhancedCV = jest.fn(async () =>
  JSON.stringify({
    cv_version1: 'v1',
    cv_version2: 'v2',
    cover_letter1: 'cl1',
    cover_letter2: 'cl2',
    original_score: 40,
    enhanced_score: 80,
    skills_added: ['skill1'],
    improvement_summary: 'summary',
  })
);

export default class OpenAI {
  constructor() {
    this.files = { create: uploadFile };
    this.responses = {
      create: async () => ({ output_text: await requestEnhancedCV() }),
    };
  }
}

