import { beforeAll, describe, expect, test } from '@jest/globals'

let parseWatchArguments
let formatChangeSummary
let normalizeRelativePath
let uniqueStrings
let DEFAULT_WATCH_GLOBS
let DEFAULT_DEBOUNCE_MS
let parseInteger

beforeAll(async () => {
  ;({
    parseWatchArguments,
    formatChangeSummary,
    normalizeRelativePath,
    uniqueStrings,
    DEFAULT_WATCH_GLOBS,
    DEFAULT_DEBOUNCE_MS,
    parseInteger,
  } = await import('../scripts/watch-cloudfront-shared.mjs'))
})

describe('watch-cloudfront-assets CLI parsing', () => {
  test('throws when no stack name is supplied', () => {
    expect(() => parseWatchArguments([], {})).toThrow(
      'Set RESUMEFORGE_STACK_NAME or pass --stack <stack-name>',
    )
  })

  test('parses options using environment defaults', () => {
    const options = parseWatchArguments(
      ['--skip-initial', '--debounce', '2500', '--watch', 'templates/**/*', '--skip-verify'],
      { RESUMEFORGE_STACK_NAME: 'ResumeForgeProd' },
    )

    expect(options.stackName).toBe('ResumeForgeProd')
    expect(options.skipInitial).toBe(true)
    expect(options.debounceMs).toBe(2500)
    expect(options.additionalWatch).toEqual(['templates/**/*'])
    expect(options.forwardArgs).toEqual(['--skip-verify'])
  })

  test('prefers explicit stack option and forwards additional arguments', () => {
    const options = parseWatchArguments(
      ['--stack', 'ResumeForgeStaging', '--watch', 'client/styles/**/*.css', '--skip-upload'],
      { RESUMEFORGE_STACK_NAME: 'ResumeForgeProd' },
    )

    expect(options.stackName).toBe('ResumeForgeStaging')
    expect(options.additionalWatch).toEqual(['client/styles/**/*.css'])
    expect(options.forwardArgs).toEqual(['--skip-upload'])
  })

  test('supports forwarding arguments after a double dash separator', () => {
    const options = parseWatchArguments(['--stack', 'ResumeForge', '--', '--skip-verify', '--foo'], {})

    expect(options.stackName).toBe('ResumeForge')
    expect(options.forwardArgs).toEqual(['--skip-verify', '--foo'])
  })

  test('deduplicates additional watch globs via helper utilities', () => {
    const values = uniqueStrings([...DEFAULT_WATCH_GLOBS, 'client/src/**/*', ' templates/**/* '])
    expect(values).toContain('templates/**/*')
    expect(values.filter((glob) => glob === 'client/src/**/*').length).toBe(1)
  })

  test('normalizes relative paths and produces readable change summaries', () => {
    const normalized = normalizeRelativePath('client\\src/main.jsx')
    expect(normalized).toBe('client/src/main.jsx')

    const summary = formatChangeSummary(['client/src/main.jsx', 'client/index.html'], [])
    expect(summary).toBe('2 files')

    const initialSummary = formatChangeSummary([], ['initial'])
    expect(initialSummary).toBe('initial run')
  })

  test('uses numeric fallback parsing for debounce handling', () => {
    expect(parseInteger('2000', DEFAULT_DEBOUNCE_MS)).toBe(2000)
    expect(parseInteger('not-a-number', 500)).toBe(500)
  })
})
