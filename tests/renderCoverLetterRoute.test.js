import request from 'supertest'
import app, {
  setGeneratePdf,
  generatePdf,
  setPlainPdfFallbackOverride,
  setMinimalPlainPdfBufferGenerator
} from '../server.js'

const PDF_STUB = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF')

describe('render cover letter route', () => {
  const originalGeneratePdf = generatePdf

  afterEach(() => {
    setGeneratePdf(originalGeneratePdf)
    setPlainPdfFallbackOverride()
    setMinimalPlainPdfBufferGenerator()
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

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        messages: expect.arrayContaining([
          'Unable to generate cover letter PDF. Tried templates: Modern Cover Letter. Last error: Minimal fallback unavailable'
        ]),
        error: expect.objectContaining({
          code: 'COVER_LETTER_GENERATION_FAILED',
          message: expect.stringContaining('Unable to generate cover letter PDF'),
          details: expect.objectContaining({
            source: 'lambda',
            documentType: 'cover_letter',
            templates: expect.arrayContaining(['cover_modern']),
            messages: expect.arrayContaining([
              'Unable to generate cover letter PDF. Tried templates: Modern Cover Letter. Last error: Minimal fallback unavailable'
            ])
          })
        })
      })
    )
  })
})
