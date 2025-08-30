import { generateContentMock } from './generateContentMock.js';
export class GoogleGenerativeAI {
  constructor() {}
  getGenerativeModel() {
    return { generateContent: generateContentMock };
  }
}
