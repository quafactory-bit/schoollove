import { describe, expect, it, vi } from 'vitest'
import { executeShareButton } from '@/lib/schoolShare'

const origin = 'https://preview.schoollove.kr'

describe('ShareButton mode selection', () => {
  it.each(['', '   '])('schoolName mode의 빈 이름 %j은 legacy mode로 폴백하지 않는다', async (schoolName) => {
    const share = vi.fn(async () => undefined)
    const writeClipboard = vi.fn(async () => undefined)

    await expect(executeShareButton(
      { schoolName, url: '/school/test-school' },
      { origin, share, writeClipboard },
    )).resolves.toBe('unavailable')

    expect(share).not.toHaveBeenCalled()
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('valid schoolName mode는 같은 origin의 정확한 절대 학교 URL을 공유한다', async () => {
    const share = vi.fn(async () => undefined)

    await expect(executeShareButton(
      { schoolName: '테스트고등학교', url: '/school/test-school' },
      { origin, share },
    )).resolves.toBe('shared')

    expect(share).toHaveBeenCalledWith({
      title: '스쿨러브아이',
      text: '스쿨러브아이에서 테스트고등학교 학교 정보를 확인해 보세요.',
      url: 'https://preview.schoollove.kr/school/test-school',
    })
  })

  it('legacy text/url mode는 기존 payload와 clipboard 동작을 유지한다', async () => {
    const writeClipboard = vi.fn(async () => undefined)

    await expect(executeShareButton(
      { text: '기존 공유 문구', url: '/legacy-share' },
      { origin, writeClipboard },
    )).resolves.toBe('copied')

    expect(writeClipboard).toHaveBeenCalledWith('기존 공유 문구\n/legacy-share')
  })

  it('schoolName mode의 AbortError는 clipboard로 폴백하지 않는다', async () => {
    const share = vi.fn(async () => { throw { name: 'AbortError' } })
    const writeClipboard = vi.fn(async () => undefined)

    await expect(executeShareButton(
      { schoolName: '테스트고등학교', url: '/school/test-school' },
      { origin, share, writeClipboard },
    )).resolves.toBe('cancelled')

    expect(writeClipboard).not.toHaveBeenCalled()
  })
})
