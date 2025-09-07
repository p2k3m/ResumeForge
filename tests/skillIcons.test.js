import { getSkillIcon, FALLBACK_SKILL_ICON, DEFAULT_SKILL_ICONS } from '../skillIcons.js'

describe('getSkillIcon', () => {
  test('returns icon for known skill', () => {
    expect(getSkillIcon('javascript')).toBe(DEFAULT_SKILL_ICONS.javascript)
  })

  test('returns fallback for unknown skill', () => {
    expect(getSkillIcon('unknown-skill')).toBe(FALLBACK_SKILL_ICON)
  })
})

