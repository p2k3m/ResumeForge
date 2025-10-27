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

  it('filters out test and preview entries while keeping user and auto outputs', () => {
    const input = [
      {
        type: 'original_upload',
        url: 'https://cdn.example.com/original.pdf',
        generatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        type: 'version1',
        url: 'https://cdn.example.com/enhanced.pdf',
        generatedAt: '2025-01-01T00:15:00.000Z',
      },
      {
        type: 'version1',
        url: 'https://cdn.example.com/enhanced-test.pdf',
        generatedAt: '2025-01-01T00:05:00.000Z',
        status: 'test',
      },
      {
        type: 'version2',
        url: 'https://cdn.example.com/enhanced-preview.pdf',
        generatedAt: '2025-01-01T00:10:00.000Z',
        tags: ['preview'],
      },
    ]

    const result = normalizeOutputFiles(input)

    expect(result).toHaveLength(2)
    expect(result.map((entry) => entry.url)).toEqual([
      'https://cdn.example.com/original.pdf',
      'https://cdn.example.com/enhanced.pdf',
    ])
  })

  it('prefers user-selected copies over newer auto-enhanced duplicates', () => {
    const input = [
      {
        type: 'version1',
        url: 'https://cdn.example.com/auto.pdf',
        generatedAt: '2025-01-01T00:30:00.000Z',
      },
      {
        type: 'version1',
        url: 'https://cdn.example.com/user.pdf',
        generatedAt: '2025-01-01T00:00:00.000Z',
        selected: true,
      },
    ]

    const result = normalizeOutputFiles(input)

    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://cdn.example.com/user.pdf')
  })

  it('keeps the most recent auto-enhanced copy when duplicates exist', () => {
    const input = [
      {
        type: 'version2',
        url: 'https://cdn.example.com/old.pdf',
        generatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        type: 'version2',
        url: 'https://cdn.example.com/new.pdf',
        generatedAt: '2025-01-01T00:20:00.000Z',
      },
    ]

    const result = normalizeOutputFiles(input)

    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://cdn.example.com/new.pdf')
  })

  it('returns an empty array when only stale entries are provided', () => {
    const input = [
      {
        type: 'version1',
        url: 'https://cdn.example.com/test.pdf',
        status: 'test',
      },
      {
        type: 'cover_letter1',
        url: 'https://cdn.example.com/preview.pdf',
        tags: ['preview'],
      },
    ]

    const result = normalizeOutputFiles(input)

    expect(result).toHaveLength(0)
  })

  it('strips unusable nested fields and preserves trimmed metadata', () => {
    const input = [
      {
        type: 'version1',
        url: ' https://cdn.example.com/enhanced.pdf ',
        generatedAt: '2025-01-01T00:00:00Z',
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        expiresAt: '2025-01-01T01:00:00Z',
        templateId: ' modern ',
        templateName: ' Modern Layout ',
        templateMeta: {
          id: ' modern ',
          name: ' Modern Layout ',
          description: ' Detailed info ',
          extra: 'remove',
        },
        download: {
          href: 'https://cdn.example.com/enhanced.pdf',
          text: '  Cover text  ',
        },
        payload: { debug: true },
        tags: ['preview'],
        presentation: {
          label: ' Enhanced CV ',
          badgeText: ' Primary ',
          autoPreviewPriority: 3,
          meta: { skip: true },
        },
        storageKey: ' cv/candidate/resume.pdf ',
      },
    ]

    const result = normalizeOutputFiles(input)

    expect(result).toEqual([
      {
        type: 'version1',
        url: 'https://cdn.example.com/enhanced.pdf',
        generatedAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        expiresAt: '2025-01-01T01:00:00.000Z',
        templateId: 'modern',
        templateName: 'Modern Layout',
        templateMeta: {
          id: 'modern',
          name: 'Modern Layout',
          description: 'Detailed info',
        },
        text: 'Cover text',
        presentation: {
          label: 'Enhanced CV',
          badgeText: 'Primary',
          autoPreviewPriority: 3,
        },
        storageKey: 'cv/candidate/resume.pdf',
      },
    ])

    expect(result[0]).not.toHaveProperty('download')
    expect(result[0]).not.toHaveProperty('payload')
    expect(result[0]).not.toHaveProperty('tags')
  })

  it('retains entries without URLs when allowEmptyUrls is true', () => {
    const issues = []
    const input = [
      {
        type: 'version1',
        download: { text: 'Draft copy only' },
      },
      {
        type: 'version2',
        url: 'https://cdn.example.com/final.pdf',
      },
    ]

    const result = normalizeOutputFiles(input, {
      allowEmptyUrls: true,
      onIssue: (issue) => issues.push(issue),
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ type: 'version1', url: '', __issue: 'missing_url' })
    expect(result[1]).toMatchObject({ type: 'version2', url: 'https://cdn.example.com/final.pdf' })
    expect(issues).toEqual([
      expect.objectContaining({ code: 'missing_url', type: 'version1' }),
    ])
  })

  it('preserves version metadata on download entries', () => {
    const input = [
      {
        type: 'version1',
        url: 'https://cdn.example.com/enhanced.pdf',
        versionId: '20250101-123456-abcdef123456',
        versionHash:
          'abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456',
      },
    ]

    const result = normalizeOutputFiles(input)

    expect(result).toHaveLength(1)
    expect(result[0].versionId).toBe('20250101-123456-abcdef123456')
    expect(result[0].versionHash).toBe(
      'abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456'
    )
  })
})
