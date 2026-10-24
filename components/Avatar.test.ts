import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVATAR_COLORS, avatarColor, avatarInitial } from './Avatar'

describe('v2-03 Avatar', () => {
  it('uses only the six approved colors and keeps a name on the same color', () => {
    expect(AVATAR_COLORS).toEqual(['#5b8def', '#e8803a', '#8e5bd1', '#3aa876', '#d65a7c', '#4c9fc0'])
    for (const name of ['최유진', '김민수', '이서연', '박지훈', 'A']) {
      expect(AVATAR_COLORS).toContain(avatarColor(name))
      expect(avatarColor(name)).toBe(avatarColor(` ${name} `))
    }
    expect(new Set(['최유진', '김민수', '이서연', '박지훈', '정우성', '한지민'].map(avatarColor)).size).toBeGreaterThan(1)
  })

  it('shows the first character only and never an image', () => {
    expect(avatarInitial('최유진')).toBe('최')
    expect(avatarInitial('  ')).toBe('?')
    expect(readFileSync(join(__dirname, 'Avatar.tsx'), 'utf8')).not.toMatch(/<img|next\/image/)
  })
})

describe('v2-03 BrandMark', () => {
  const source = readFileSync(join(__dirname, 'BrandMark.tsx'), 'utf8')
  it('is a green rounded square with a white check and uses the v2-10 name', () => {
    expect(source).toContain('bg-sl-brand')
    expect(source).toContain('stroke="#ffffff"')
    expect(source).toContain("BRAND_NAME = '출석부'")
    expect(source).not.toMatch(/heart|Heart|pink/)
  })
})
