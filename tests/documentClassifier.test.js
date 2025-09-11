import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('documentClassifier', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('falls back to OpenAI when Gemini is unavailable', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    const classifyDocument = jest.fn().mockResolvedValue('essay');
    jest.unstable_mockModule('../openaiClient.js', () => ({ classifyDocument }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const result = await describeDocument('sample text');
    expect(classifyDocument).toHaveBeenCalled();
    expect(result).toBe('essay');
  });

  test('uses keyword heuristic when both Gemini and OpenAI are unavailable', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const result = await describeDocument('This is my Resume for the job');
    expect(result).toBe('resume');
  });

  test('classifies resumes by common section headings', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const sample = `Experience:\nWorked as engineer.\nEducation:\nUniversity.\nSkills:\nJavaScript and Python.`;
    const result = await describeDocument(sample);
    expect(result).toBe('resume');
  });

  test('uses local classifier when heuristic sections are absent', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const text = `Dear Hiring Manager,\nI am excited to apply for the role.\nSincerely,\nJane Doe`;
    const result = await describeDocument(text);
    expect(result).toBe('cover letter');
  });

  test('classifies PDF resumes without explicit keywords', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const { default: PDFDocument } = await import('pdfkit');
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const pdfBuffer = await new Promise((resolve) => {
      const doc = new PDFDocument();
      const chunks = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.text('Work Experience');
      doc.text('Professional Summary');
      doc.text('Education');
      doc.text('Skills');
      doc.end();
    });
    const { text } = await pdfParse(pdfBuffer);
    const result = await describeDocument(text);
    expect(result).toBe('resume');
  });

  test('classifies DOCX resumes without explicit keywords', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const { Document, Packer, Paragraph } = await import('docx');
    const mammoth = (await import('mammoth')).default;
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph('Professional Summary'),
            new Paragraph('Work Experience'),
            new Paragraph('Education'),
            new Paragraph('Skills'),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);
    const { value: text } = await mammoth.extractRawText({ buffer });
    const result = await describeDocument(text);
    expect(result).toBe('resume');
  });

  test('classifies based on content, not filename', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-classifier-'));

    const resumeOriginal = path.join(dir, 'resume.pdf');
    await fs.writeFile(resumeOriginal, 'Work Experience\nEducation\nSkills');
    const misnamedResume = path.join(dir, 'coverletter.pdf');
    await fs.rename(resumeOriginal, misnamedResume);
    const resumeText = await fs.readFile(misnamedResume, 'utf8');
    const resumeResult = await describeDocument(resumeText);
    expect(resumeResult).toBe('resume');

    const letterOriginal = path.join(dir, 'letter.txt');
    await fs.writeFile(
      letterOriginal,
      'Dear Hiring Manager,\nI am excited to apply.\nSincerely, Jane'
    );
    const misnamedLetter = path.join(dir, 'resume.pdf');
    await fs.rename(letterOriginal, misnamedLetter);
    const letterText = await fs.readFile(misnamedLetter, 'utf8');
    const letterResult = await describeDocument(letterText);
    expect(letterResult).toBe('cover letter');
  });

  test('defaults to unknown when no classifier succeeds', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const result = await describeDocument('unclassifiable text');
    expect(result).toBe('unknown');
  });
});

