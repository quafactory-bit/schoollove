import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const mocks=vi.hoisted(()=>({auth:vi.fn(),own:vi.fn()}))
vi.mock('@/lib/user-auth',()=>({getAuthenticatedServerContext:mocks.auth}))
vi.mock('@/lib/ownerSchoolGrowth',()=>({getOwnSchoolGrowth:mocks.own}))
import MyGrowthSchools from './MyGrowthSchools'
import GrowthMeter from './GrowthMeter'
const schoolId='ee000001-0000-4000-8000-000000000001'
const growth={schoolId,schoolName:'Fixture',slug:'fixture',level:2,progress:7,nearLevelUp:false,lastLevelUp:null,ownContributionXp:150}
const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockResolvedValue({data:[{school_id:schoolId},{school_id:schoolId}],error:null})}
const client={from:()=>query}
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({user:{id:'private-owner'},client});mocks.own.mockResolvedValue(growth)})
describe('owner/public projection rendering',()=>{
  it('loads each distinct owner school using the authenticated client and live values',async()=>{
    const html=renderToStaticMarkup(await MyGrowthSchools())
    expect(mocks.own).toHaveBeenCalledExactlyOnceWith(client,schoolId)
    expect(html).toContain('Lv.2')
    expect(html).toContain('aria-valuenow="7"')
    expect(html).toContain('내 학교 실시간 성장 진행률')
    expect(html).not.toContain('private-owner')
    expect(html).not.toContain('ownContributionXp')
  })
  it('no authenticated context means no owner live read',async()=>{
    mocks.auth.mockResolvedValue(null)
    expect(await MyGrowthSchools()).toBeNull()
    expect(mocks.own).not.toHaveBeenCalled()
  })
  it('does not replace failed owner reads with delayed public levels',async()=>{
    mocks.own.mockResolvedValue(null)
    expect(await MyGrowthSchools()).toBeNull()
  })
  it('public meter keeps delayed copy; owner meter explicitly describes immediate feedback',()=>{
    const publicHtml=renderToStaticMarkup(<GrowthMeter growth={{...growth,level:1,progress:0}} />)
    const ownerHtml=renderToStaticMarkup(<GrowthMeter growth={growth} projection="owner" />)
    expect(publicHtml).toContain('공개 성장 진행률')
    expect(publicHtml).toContain('성장은 모아서 반영합니다.')
    expect(ownerHtml).toContain('내 학교의 성장을 바로 확인해요.')
    expect(ownerHtml).toContain('공개 화면에는 성장을 모아서 반영합니다.')
  })
  it('never exports owner live level via share text and discards stale account requests',()=>{
    const share=readFileSync('components/growth/GrowthShareButton.tsx','utf8')
    expect(share).not.toContain('level')
    expect(share).not.toContain('Lv.')
    const feedback=readFileSync('components/growth/OwnerGrowthFeedback.tsx','utf8')
    expect(feedback).toContain('data.growth.schoolId !== schoolId')
    expect(feedback).toContain('!controller.signal.aborted')
    expect(feedback).toContain("cache: 'no-store'")
    expect(feedback).toContain('projection="owner"')
  })
})
