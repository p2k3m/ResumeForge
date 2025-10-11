import {
  API_ERROR_CONTRACTS,
  CV_GENERATION_ERROR_MESSAGE,
  DOWNLOAD_SESSION_EXPIRED_MESSAGE,
  GEMINI_ENHANCEMENT_ERROR_MESSAGE,
  LAMBDA_PROCESSING_ERROR_MESSAGE,
  S3_CHANGE_LOG_ERROR_MESSAGE,
  S3_STORAGE_ERROR_MESSAGE,
  buildServiceErrorFallbackMessages,
  COVER_LETTER_GENERATION_ERROR_MESSAGE
} from '../../client/src/shared/serviceErrorContracts.js'
import {
  FRIENDLY_ERROR_MESSAGES,
  SERVICE_ERROR_SOURCE_BY_CODE,
  SERVICE_ERROR_STEP_BY_CODE,
  SERVICE_ERROR_STEP_BY_SOURCE,
  deriveServiceContextFromError,
  resolveApiError
} from '../../client/src/shared/apiErrorHandling.js'

describe('service error contract', () => {
  const expectedCodes = [
    'INITIAL_UPLOAD_FAILED',
    'STORAGE_UNAVAILABLE',
    'CHANGE_LOG_PERSISTENCE_FAILED',
    'DOCUMENT_GENERATION_FAILED',
    'PROCESSING_FAILED',
    'GENERATION_FAILED',
    'PDF_GENERATION_FAILED',
    'COVER_LETTER_GENERATION_FAILED',
    'AI_RESPONSE_INVALID',
    'DOWNLOAD_SESSION_EXPIRED'
  ]

  it('lists all expected error codes', () => {
    expect(Object.keys(API_ERROR_CONTRACTS).sort()).toEqual(expectedCodes.sort())
  })

  it('exposes stable friendly messages for each code', () => {
    const fallbackMessages = buildServiceErrorFallbackMessages(API_ERROR_CONTRACTS)
    expect(fallbackMessages).toEqual(FRIENDLY_ERROR_MESSAGES)
    expect(FRIENDLY_ERROR_MESSAGES).toMatchObject({
      INITIAL_UPLOAD_FAILED: S3_STORAGE_ERROR_MESSAGE,
      STORAGE_UNAVAILABLE: S3_STORAGE_ERROR_MESSAGE,
      CHANGE_LOG_PERSISTENCE_FAILED: S3_CHANGE_LOG_ERROR_MESSAGE,
      DOCUMENT_GENERATION_FAILED: LAMBDA_PROCESSING_ERROR_MESSAGE,
      PROCESSING_FAILED: LAMBDA_PROCESSING_ERROR_MESSAGE,
      GENERATION_FAILED: LAMBDA_PROCESSING_ERROR_MESSAGE,
      PDF_GENERATION_FAILED: CV_GENERATION_ERROR_MESSAGE,
      COVER_LETTER_GENERATION_FAILED: COVER_LETTER_GENERATION_ERROR_MESSAGE,
      AI_RESPONSE_INVALID: GEMINI_ENHANCEMENT_ERROR_MESSAGE,
      DOWNLOAD_SESSION_EXPIRED: DOWNLOAD_SESSION_EXPIRED_MESSAGE
    })
  })

  describe.each(Object.entries(API_ERROR_CONTRACTS))(
    '%s contract behaviour',
    (code, contract) => {
      const status = code === 'DOWNLOAD_SESSION_EXPIRED' ? 410 : 503

      it('maps service metadata consistently', () => {
        expect(SERVICE_ERROR_SOURCE_BY_CODE[code]).toBe(contract.service)
        expect(SERVICE_ERROR_STEP_BY_CODE[code]).toBe(contract.step)
        expect(SERVICE_ERROR_STEP_BY_SOURCE[contract.service]).toBeDefined()
      })

      it('derives service context from API error payload', () => {
        expect(deriveServiceContextFromError({ code })).toEqual({
          source: contract.service,
          code
        })
      })

      it('resolves UI error messaging for API response', () => {
        const result = resolveApiError({
          data: { error: { code } },
          fallback: 'fallback message',
          status
        })

        expect(result).toMatchObject({
          code,
          source: contract.service,
          message: contract.friendlyMessage
        })
        expect(result.isFriendly).toBe(true)
      })
    }
  )
})
