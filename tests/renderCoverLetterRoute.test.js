import { jest } from '@jest/globals'
import request from 'supertest'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import app, {
  setGeneratePdf,
  generatePdf,
  setPlainPdfFallbackOverride,
  setMinimalPlainPdfBufferGenerator,
  setS3Client
} from '../server.js'

const PDF_STUB = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF')

jest.setTimeout(20000)

describe('render cover letter route', () => {
  const originalGeneratePdf = generatePdf
  let s3SendMock

  beforeEach(() => {
    s3SendMock = jest.fn().mockResolvedValue({})
    setS3Client({
      send: s3SendMock,
      config: { requestHandler: { handle: jest.fn() } }
    })
  })

  afterEach(() => {
    setGeneratePdf(originalGeneratePdf)
    setPlainPdfFallbackOverride()
    setMinimalPlainPdfBufferGenerator()
    s3SendMock.mockReset()
  })

  afterAll(() => {
    setS3Client(null)
  })

  it('renders a cover letter PDF using the requested template', async () => {
    setGeneratePdf(async (text, templateId) => {
      expect(templateId).toBe('cover_classic')
      return PDF_STUB
    })

    const response = await request(app)
      .post('/api/render-cover-letter')
      .send({
        jobId: 'job-123',
        text: 'Jane Candidate\n\nDear Hiring Manager,\nThank you.\n\nSincerely,\nJane Candidate',
        templateId: 'cover_classic',
        variant: 'cover_letter1'
      })
      .expect(200)

    expect(response.headers['content-type']).toMatch(/application\/pdf/)
    expect(Buffer.isBuffer(response.body)).toBe(true)
    expect(Buffer.from(response.body)).toEqual(PDF_STUB)
    expect(response.headers['x-template-id']).toBe('cover_classic')
    expect(typeof response.headers['x-artifact-key']).toBe('string')

    expect(s3SendMock).toHaveBeenCalledTimes(1)
    const [command] = s3SendMock.mock.calls[0]
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect(command.input.Bucket).toBe(process.env.S3_BUCKET)
    expect(command.input.ContentType).toBe('application/pdf')
    expect(Buffer.compare(command.input.Body, PDF_STUB)).toBe(0)
    expect(command.input.Key).toMatch(/^cv\//)
    expect(command.input.Key.endsWith('.pdf')).toBe(true)
    expect(response.headers['x-artifact-key']).toBe(command.input.Key)
  })

  it('rejects when cover letter text is missing', async () => {
    const response = await request(app)
      .post('/api/render-cover-letter')
      .send({ jobId: 'job-456' })
      .expect(400)

    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'COVER_LETTER_TEXT_REQUIRED'
        })
      })
    )
  })

  it('returns failure summary when PDF generation cannot recover', async () => {
    setGeneratePdf(async () => {
      throw new Error('Renderer offline')
    })
    setPlainPdfFallbackOverride(() => {
      throw new Error('Plain fallback unavailable')
    })
    setMinimalPlainPdfBufferGenerator(() => {
      throw new Error('Minimal fallback unavailable')
    })

    const response = await request(app)
      .post('/api/render-cover-letter')
      .send({
        jobId: 'job-789',
        text: 'Dear Hiring Manager,\n\nThank you for your consideration.\n\nSincerely,\nJane Candidate',
        templateId: 'cover_modern',
        variant: 'cover_letter1'
      })
      .expect(500)

    const expectedSummary =
      'Unable to generate cover letter PDF. Tried templates: Modern Cover Letter, Classic Cover Letter, Professional Cover Letter, ATS Cover Letter, and Future Vision 2025 Cover Letter. Last error: Minimal fallback unavailable'

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        messages: expect.arrayContaining([
          expect.stringContaining('Could not generate PDF for Modern Cover Letter template'),
          expectedSummary
        ]),
        error: expect.objectContaining({
          code: 'COVER_LETTER_GENERATION_FAILED',
          message: expectedSummary,
          jobId: 'job-789',
          requestId: expect.any(String),
          details: expect.objectContaining({
            source: 'lambda',
            documentType: 'cover_letter',
            templates: expect.arrayContaining([
              'cover_modern',
              'cover_classic',
              'cover_professional',
              'cover_ats',
              'cover_2025'
            ]),
            messages: expect.arrayContaining([
              expect.stringContaining('Could not generate PDF for Modern Cover Letter template'),
              expectedSummary
            ]),
            summary: expectedSummary,
            reason: 'Minimal fallback unavailable',
            lastTemplate: 'cover_2025',
            actions: expect.arrayContaining(['retry'])
          })
        })
      })
    )
  })
})
