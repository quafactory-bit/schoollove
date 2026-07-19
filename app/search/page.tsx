import type { Metadata } from 'next'
import SchoolSearchResults from '@/components/SchoolSearchResults'

// PHASE 7B — 글로벌 인물 검색(searchProfiles/searchAll)은 FROZEN이 "하지 않는 것"으로
// 명시한 항목이라 제거된 상태를 유지한다(사람 이름 검색은 Year Hub 내부에서만 동작).
//
// PHASE 7B COMPLETION PATCH — SCHOOL SEARCH CONTINUITY
// 이 페이지는 searchParams(?q=)를 받지 않는다 — 검색어를 URL에 노출하지 않는다는 고정
// 결정에 따라, 학교 검색어는 SearchBar가 sessionStorage에 저장하고
// components/SchoolSearchResults.tsx가 마운트 시 그 값을 읽어 학교 검색만 수행한다. title도
// 항상 고정값이라 쿼리가 title/canonical/redirect 어디에도 반영되지 않는다.
export const metadata: Metadata = {
  title: '학교 검색',
  robots: { index: false },
}

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <SchoolSearchResults />
    </main>
  )
}
