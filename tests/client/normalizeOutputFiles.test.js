import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { normalizeOutputFiles } from '../../client/src/utils/normalizeOutputFiles.js'

describe('normalizeOutputFiles', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('extracts nested download URLs and derives expiry from seconds', () => {
    const input = [
      {
        type: 'version1',
        download: {
          href: ' https://cdn.example.com/enhanced.pdf ',
          expiresInSeconds: 1800,
        },
      },
    ]

    const result = normalizeOutputFiles(input)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('version1')
    expect(result[0].url).toBe('https://cdn.example.com/enhanced.pdf')
    expect(result[0].expiresAt).toBe('2025-01-01T00:30:00.000Z')
  })

  it('reads expiry timestamps nested inside link metadata', () => {
    const input = {
      cover_letter1: {
        name: 'cover_letter1',
        download: {
          link: 'https://cdn.example.com/cover.pdf',
          expiresAtEpoch: 1767225600,
        },
      },
      invalid: {
        download: {},
      },
    }

    const result = normalizeOutputFiles(input)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('cover_letter1')
    expect(result[0].url).toBe('https://cdn.example.com/cover.pdf')
    expect(result[0].expiresAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('applies default expiry when response omits timestamps', () => {
    const input = [
      {
        type: 'version2',
        url: 'https://cdn.example.com/enhanced-alt.pdf',
      },
    ]

    const result = normalizeOutputFiles(input, { defaultExpiresInSeconds: 3600 })

    expect(result).toHaveLength(1)
    expect(result[0].expiresAt).toBe('2025-01-01T01:00:00.000Z')
  })
})
