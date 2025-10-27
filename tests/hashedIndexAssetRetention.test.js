import {
  DEFAULT_STALE_INDEX_RETENTION_MS,
  resolveHashedIndexAssetRetentionMs,
  categorizeStaleHashedIndexAssets,
  formatDurationForLog,
  formatAssetAgeForLog,
} from '../lib/static/hashedIndexAssetRetention.js'

describe('resolveHashedIndexAssetRetentionMs', () => {
  test('returns default when env is undefined', () => {
    expect(resolveHashedIndexAssetRetentionMs(undefined)).toBe(DEFAULT_STALE_INDEX_RETENTION_MS)
  })

  test('prefers millisecond override when provided', () => {
    const env = { STATIC_VERIFY_STALE_INDEX_RETENTION_MS: '60000' }
    expect(resolveHashedIndexAssetRetentionMs(env)).toBe(60000)
  })

  test('falls back to hours when millisecond override is absent', () => {
    const env = { STATIC_VERIFY_STALE_INDEX_RETENTION_HOURS: '2' }
    expect(resolveHashedIndexAssetRetentionMs(env)).toBe(2 * 60 * 60 * 1000)
  })

  test('falls back to days when other overrides are invalid', () => {
    const env = {
      STATIC_VERIFY_STALE_INDEX_RETENTION_MS: 'not-a-number',
      STATIC_VERIFY_STALE_INDEX_RETENTION_HOURS: '-5',
      STATIC_VERIFY_STALE_INDEX_RETENTION_DAYS: '3',
    }
    expect(resolveHashedIndexAssetRetentionMs(env)).toBe(3 * 24 * 60 * 60 * 1000)
  })

  test('treats zero as immediate deletion window', () => {
    const env = { STATIC_VERIFY_STALE_INDEX_RETENTION_MS: '0' }
    expect(resolveHashedIndexAssetRetentionMs(env)).toBe(0)
  })
})

describe('categorizeStaleHashedIndexAssets', () => {
  const now = Date.now()

  test('excludes assets that are still referenced by the manifest', () => {
    const result = categorizeStaleHashedIndexAssets({
      hashedAssets: ['assets/index-active.js'],
      candidates: [
        { key: 'assets/index-active.js', lastModified: new Date(now - 10 * 60 * 1000) },
        { key: 'assets/index-old.js', lastModified: new Date(now - 5 * 24 * 60 * 60 * 1000) },
      ],
      now,
      retentionMs: 72 * 60 * 60 * 1000,
    })

    expect(result.eligibleForDeletion.map((entry) => entry.key)).toEqual(['assets/index-old.js'])
    expect(result.protectedByRetention).toHaveLength(0)
  })

  test('retains assets that fall within the retention window', () => {
    const result = categorizeStaleHashedIndexAssets({
      hashedAssets: [],
      candidates: [
        { key: 'assets/index-recent.js', lastModified: new Date(now - 2 * 60 * 60 * 1000) },
        { key: 'assets/index-aged.css', lastModified: new Date(now - 10 * 24 * 60 * 60 * 1000) },
      ],
      now,
      retentionMs: 72 * 60 * 60 * 1000,
    })

    expect(result.protectedByRetention.map((entry) => entry.key)).toEqual(['assets/index-recent.js'])
    expect(result.eligibleForDeletion.map((entry) => entry.key)).toEqual(['assets/index-aged.css'])
  })

  test('treats assets with unknown lastModified as eligible for deletion', () => {
    const result = categorizeStaleHashedIndexAssets({
      hashedAssets: [],
      candidates: [{ key: 'assets/index-unknown.js' }],
      now,
      retentionMs: 72 * 60 * 60 * 1000,
    })

    expect(result.eligibleForDeletion.map((entry) => entry.key)).toEqual(['assets/index-unknown.js'])
    expect(result.protectedByRetention).toHaveLength(0)
  })

  test('allows immediate deletion when retention is zero', () => {
    const result = categorizeStaleHashedIndexAssets({
      hashedAssets: [],
      candidates: [
        { key: 'assets/index-recent.js', lastModified: new Date(now - 30 * 60 * 1000) },
      ],
      now,
      retentionMs: 0,
    })

    expect(result.protectedByRetention).toHaveLength(0)
    expect(result.eligibleForDeletion.map((entry) => entry.key)).toEqual(['assets/index-recent.js'])
  })
})

describe('formatDurationForLog', () => {
  test('formats hours cleanly', () => {
    expect(formatDurationForLog(2 * 60 * 60 * 1000)).toBe('2h')
  })

  test('formats multi-day durations with hour remainder', () => {
    const twoAndHalfDays = 2.5 * 24 * 60 * 60 * 1000
    expect(formatDurationForLog(twoAndHalfDays)).toBe('2 days 12h')
  })
})

describe('formatAssetAgeForLog', () => {
  test('describes recent uploads as minutes', () => {
    expect(formatAssetAgeForLog(5 * 60 * 1000)).toBe('5m old')
  })

  test('describes old assets in days', () => {
    expect(formatAssetAgeForLog(7 * 24 * 60 * 60 * 1000)).toBe('7 days old')
  })
})
