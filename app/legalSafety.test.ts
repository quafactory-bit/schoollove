import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const privacy = readFileSync(join(process.cwd(), 'app/privacy/page.tsx'), 'utf8')
const terms = readFileSync(join(process.cwd(), 'app/terms/page.tsx'), 'utf8')
const invite = readFileSync(join(process.cwd(), 'app/invite/page.tsx'), 'utf8')
const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')

describe('PHASE 10A public notices', () => {
  it('states the actual public-list and registration suspension', () => {
    expect(privacy).toContain('공개 명단과 사람 검색을 중단했습니다')
    expect(privacy).toContain('성인 비공개 계정은 launch 상태가 별도로 승인된 때에만 시작')
    expect(terms).toContain('공개 개인 명단과 사람 이름 검색은 제공하지 않습니다')
    expect(terms).toContain('별도로 공개 계정 launch가 승인된 경우')
  })

  it('documents the 19+ self-only future boundary and deletion contact', () => {
    for (const source of [privacy, terms]) {
      expect(source).toContain('만 19세 이상')
      expect(source).toContain('본인 정보')
      expect(source).toContain('schoollove.contact@gmail.com')
    }
  })

  it('does not present either notice as completed legal advice', () => {
    expect(privacy).toContain('최종 법률 검토를 대체하지 않습니다')
    expect(terms).toContain('최종 법률 검토를 대체하지 않습니다')
  })

  it('keeps the public Google-branding notice paths as rendered Next pages and links to those exact canonical paths from Home', () => {
    for (const source of [privacy, terms]) {
      expect(source).toContain('export default function')
      expect(source).not.toMatch(/notFound\(|redirect\(/)
    }
    expect(home).toContain('href="/privacy"')
    expect(home).toContain('href="/terms"')
  })

  it('disables the former invite/share registration funnel', () => {
    expect(invite).toContain('초대 기능을 잠시 중단했습니다')
    expect(invite).not.toMatch(/navigator\.share|navigator\.clipboard|\/submit/)
  })
})
