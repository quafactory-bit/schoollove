import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PeopleSearchClient from '@/app/people/search/PeopleSearchClient'
import AccountClient from '@/app/account/AccountClient'
import type { OwnClassDiscoveryChoice } from '@/lib/peopleDiscoveryHistory'
import type { SchoolMembership } from '@/lib/account'

// Synthetic loopback-only data. No real accounts, schools, sessions or search service.
const schoolId = '00000000-0000-4000-8000-000000000001'
const schoolName = '아주긴합성학교이름으로모바일줄바꿈경계를검증하는테스트고등학교'
const globals = window as unknown as { historyFixture: (count: number, status?: 'ok' | 'unavailable') => void; accountHistoryFixture: (people: boolean, rows: boolean, kind?: string, deletion?: boolean, emergency?: boolean) => void }
function Fixture() {
  const [count, setCount] = useState(3)
  const [status, setStatus] = useState<'ok' | 'unavailable'>('ok')
  const [version, setVersion] = useState(0)
  const [account, setAccount] = useState<{ people: boolean; rows: boolean; kind: string; deletion: boolean; emergency: boolean } | null>(null)
  globals.historyFixture = (nextCount, nextStatus = 'ok') => { setCount(nextCount); setStatus(nextStatus); setAccount(null); setVersion(n => n + 1) }
  globals.accountHistoryFixture = (people, rows, kind = 'high', deletion = false, emergency = false) => { setAccount({ people, rows, kind, deletion, emergency }); setVersion(n => n + 1) }
  const choices: OwnClassDiscoveryChoice[] = Array.from({ length: count }, (_, index) => ({
    schoolId, schoolName, schoolType: 'high', region: '합성시 합성구', graduationYear: 2016, gradeNumber: index + 1, classNumber: 1,
  }))
  if (!account) return <PeopleSearchClient key={version} historyChoices={choices} historyStatus={status} />
  const membership: SchoolMembership = {
    id: '00000000-0000-4000-8000-000000000002', school_id: schoolId, graduation_year: 2016, class_number: null,
    class_history: account.rows ? [{ grade_number: 3, class_number: 1 }] : [],
    school: { id: schoolId, school_name: schoolName, school_type: account.kind, sido: '합성시', sigungu: '합성구', slug: 'synthetic-school' },
  }
  return <AccountClient key={version} state={{ adultEligible: true, consentsComplete: true,
    consentTypes: ['terms', 'privacy_collection', 'adult_confirmation', 'private_by_default'],
    deletionRequested: account.deletion, deletionStatus: account.deletion ? 'pending' : null,
    profile: { id: membership.id, owner_user_id: membership.id, display_name: 'Synthetic', instagram_handle: null, introduction: null, profile_photo_url: null, profile_visibility: 'private', status: 'active', created_at: '', updated_at: '' }, memberships: [membership] }}
    launch={{ state: account.emergency ? 'emergency_stopped' : 'closed', emergencyStopped: account.emergency, registrationEnabled: false, privateProfileEnabled: false, schoolMembershipEnabled: false }}
    controlledBetaAccess={false} peopleSearchBetaAccess={account.people} instagramBetaAccess={false} betaOnboardingState="active" currentYear={2026} />
}
createRoot(document.getElementById('root')!).render(<Fixture />)
