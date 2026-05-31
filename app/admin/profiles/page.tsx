'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Profile {
  id: string
  nickname: string
  instagram_id: string | null
  graduation_year: number
  grade: number | null
  class_number: number | null
  report_count: number
  is_hidden: boolean
  created_at: string
  schools: {
    school_name: string
    school_type: string
  }
}

export default function AdminProfilesPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchProfiles()
  }, [])

  async function fetchProfiles(query = '') {
    let q = supabase
      .from('profiles')
      .select('*, schools(school_name, school_type)')
      .order('created_at', { ascending: false })

    if (query) {
      q = q.or(`nickname.ilike.%${query}%,schools.school_name.ilike.%${query}%`)
    }

    const { data } = await q
    setProfiles(data || [])
    setLoading(false)
  }

  async function toggleHidden(id: string, current: boolean) {
    setActionLoading(id + '-hide')
    const { error } = await supabase
      .from('profiles')
      .update({ is_hidden: !current })
      .eq('id', id)
    if (error) {
      alert('숨김 처리 실패: ' + error.message)
      setActionLoading(null)
      return
    }
    await fetchProfiles(search)
    setActionLoading(null)
  }

  async function deleteProfile(id: string, nickname: string) {
    if (!confirm(`"${nickname}" 을(를) 완전히 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return
    setActionLoading(id + '-delete')

    try {
      const res = await fetch(`/api/admin/profiles/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert('삭제 실패: ' + (body.error || res.statusText))
        setActionLoading(null)
        return
      }

      await fetchProfiles(search)
    } catch (e) {
      alert('네트워크 오류: ' + (e instanceof Error ? e.message : 'unknown'))
    } finally {
      setActionLoading(null)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    fetchProfiles(search)
  }

  const schoolTypeLabel: Record<string, string> = {
    elementary: '초',
    middle: '중',
    high: '고',
    university: '대',
    college: '전',
  }

  if (loading) return <div className="p-8 text-center">로딩 중...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/admin')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 대시보드
          </button>
          <h1 className="text-xl font-bold text-gray-900">등록 데이터 관리</h1>
          <span className="ml-auto text-sm text-gray-500">총 {profiles.length}명</span>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 학교명 검색"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            검색
          </button>
        </form>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">이름/별명</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">학교</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">정보</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">인스타</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">신고</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">등록일</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">상태</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {profiles.map((p) => (
                <tr key={p.id} className={p.is_hidden ? 'bg-gray-50 opacity-60' : ''}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.nickname}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="text-xs text-gray-400 mr-1">
                      {schoolTypeLabel[p.schools?.school_type] || ''}
                    </span>
                    {p.schools?.school_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.graduation_year}년
                    {p.grade && p.class_number ? ` · ${p.grade}-${p.class_number}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    {p.instagram_id ? (
                      <span className="text-blue-600">@{p.instagram_id}</span>
                    ) : (
                      <span className="text-gray-400">미등록</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.report_count}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${p.is_hidden ? 'text-gray-400' : 'text-green-600'}`}>
                      {p.is_hidden ? '숨김' : '공개'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleHidden(p.id, p.is_hidden)}
                        disabled={actionLoading === p.id + '-hide'}
                        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {actionLoading === p.id + '-hide' ? '...' : p.is_hidden ? '복원' : '숨김'}
                      </button>
                      <button
                        onClick={() => deleteProfile(p.id, p.nickname)}
                        disabled={actionLoading === p.id + '-delete'}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {actionLoading === p.id + '-delete' ? '...' : '삭제'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {profiles.length === 0 && (
            <div className="text-center py-12 text-gray-400">등록된 데이터가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  )
}
