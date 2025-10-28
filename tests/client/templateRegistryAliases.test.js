import { describe, it, expect } from '@jest/globals'
import { canonicalizeTemplateId } from '../../client/src/templateRegistry.js'

describe('templateRegistry aliases', () => {
  const cases = [
    ['futuristic', '2025'],
    ['Futuristic', '2025'],
    ['resume_futuristic', '2025'],
    ['resume-futuristic', '2025'],
    ['Future Vision 2025', '2025'],
    ['futurevision2025', '2025']
  ]

  cases.forEach(([input, expected]) => {
    it(`normalises "${input}" to ${expected}`, () => {
      expect(canonicalizeTemplateId(input)).toBe(expected)
    })
  })
})
