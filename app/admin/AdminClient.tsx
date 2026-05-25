'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Stats { total: number; today: number; reports: number; deletes: number }
interface Profile {
  id: string
  nickname: string
  instagram_id: string | null
  graduation_year: number
  grade: number | null
  class_number: number | null
  created_at: string
  schools: { school_name: string } | null
}
interface Report {
  id: string
  type: string
  reason: string
  created_at: string
  requested_instagram_id: string | null
  is_self_claimed: boolean
  profiles: {
    id: string
    nickname: string
    instagram_id: string | null
    schools: { school_name: string } | null
  } | null
}

export default function AdminClient({ stats, profiles, reports }: { stats: Stats; profiles: Profile[]; reports: Report[] }) {
  const [tab, setTab] = useState<'dashboard' | 'profiles' | 'reports'>('dashboard')
  const [localReports, setLocalReports] = useState(reports)
  const [localProfiles, setLocalProfiles] = useState(profiles)
  const [search, setSearch] = useState('')

  const hideProfile = async (id: string) => {
    if (!confirm('이 프로필을 숨기겠습니까?')) return
    await supabase.from('profiles').update({ is_hidden: true }).eq('id', id)
    setLocalProfiles(p => p.filter(x => x.id !== id))
  }

  const resolveReport = async (id: string, action?: string, profileId?: string) => {
    await supabase.from('reports').update({ status: 'done' }).eq('id', id)
    if (action === 'delete' && profileId) {
      await supabase.from('profiles').update({ is_hidden: true }).eq('id', profileId)
    }
    setLocalReports(r => r.filter(x => x.id !== id))
  }

  const applyEdit = async (report: Report) => {
    if (!report.profiles?.id || !report.requested_instagram_id) return
    await supabase.from('profiles').update({ instagram_id: report.requested_instagram_id }).eq('id', report.profiles.id)
    await supabase.from('reports').update({ status: 'done' }).eq('id', report.id)
    setLocalReports(r => r.filter(x => x.id !== report.id))
  }

  const filteredProfiles = localProfiles.filter(p =>
    p.nickname.includes(search) ||
    p.schools?.school_name.includes(search) ||
    p.instagram_id?.includes(search)
  )

  const tabLabels = { dashboard: '대시보드', profiles: '등록 데이터', reports: '신고·요청' }

  const typeLabel = (type: string) => {
    if (type === 'report') return { label: '신고', className: 'bg-orange-100 text-orange-600' }
    if (type === 'delete') return { label: '삭제 요청', className: 'bg-red-100 text-red-600' }
    return { label: '수정 요청', className: 'bg-blue-100 text-blue-600' }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <h1 className="font-bold text-lg text-gray-900">스쿨러브아이 관리자</h1>
        <div className="flex gap-2 ml-4">
          {(['dashboard', 'profiles', 'reports'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {tabLabels[t]}
              {t === 'reports' && localReports.length > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {localReports.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* 대시보드 */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: '총 등록 수', value: stats.total, color: 'text-blue-600' },
                { label: '오늘 등록', value: stats.today, color: 'text-green-600' },
                { label: '신고 수', value: stats.reports, color: 'text-orange-500' },
                { label: '삭제 요청', value: stats.deletes, color: 'text-red-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-sm text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* 최근 신고 */}
            {localReports.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">미처리 신고·요청</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {localReports.slice(0, 5).map(r => {
                    const { label, className } = typeLabel(r.type)
                    return (
                      <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>{label}</span>
                          <span className="text-sm font-medium">{r.profiles?.nickname}</span>
                          <span className="text-xs text-gray-400">{r.profiles?.schools?.school_name}</span>
                        </div>
                        <button onClick={() => setTab('reports')} className="text-xs text-blue-500 hover:underline">처리하기</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 등록 데이터 */}
        {tab === 'profiles' && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="이름, 학교명, 인스타 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
            <p className="text-xs text-gray-400">{filteredProfiles.length}명</p>
            <div className="space-y-2">
              {filteredProfiles.map(p => (
                <div key={p.id} className="bg-white rounded-xl p-4 border border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                      {p.nickname[0]}
                    </div>
                    <div>
                      <span className="font-medium text-sm">{p.nickname}</span>
                      <span className="text-xs text-gray-400 ml-2">{p.schools?.school_name} · {p.graduation_year}년</span>
                      {p.grade && <span className="text-xs text-gray-400"> · {p.grade}학년 {p.class_number}반</span>}
                      {p.instagram_id && <div className="text-blue-500 text-xs mt-0.5">@{p.instagram_id}</div>}
                    </div>
                  </div>
                  <button onClick={() => hideProfile(p.id)} className="text-xs text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition">
                    숨김
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 신고·요청 */}
        {tab === 'reports' && (
          <div className="space-y-3">
            {localReports.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-2xl mb-2">✅</p>
                <p>처리할 신고·요청이 없습니다</p>
              </div>
            )}
            {localReports.map(r => {
              const { label, className } = typeLabel(r.type)
              return (
                <div key={r.id} className="bg-white rounded-xl p-4 border border-gray-100">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>{label}</span>
                        <span className="font-medium text-sm">{r.profiles?.nickname}</span>
                        <span className="text-xs text-gray-400">{r.profiles?.schools?.school_name}</span>
                        {r.is_self_claimed && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">본인확인</span>}
                      </div>
                      <p className="text-sm text-gray-600">{r.reason}</p>
                      {r.profiles?.instagram_id && (
                        <p className="text-xs text-gray-400">현재: @{r.profiles.instagram_id}</p>
                      )}
                      {r.requested_instagram_id && (
                        <p className="text-xs text-blue-500">수정 요청 ID: @{r.requested_instagram_id}</p>
                      )}
                      <p className="text-xs text-gray-300">{new Date(r.created_at).toLocaleDateString('ko-KR')}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {r.type === 'edit' && r.requested_instagram_id && (
                        <button onClick={() => applyEdit(r)} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition">
                          수정 적용
                        </button>
                      )}
                      {r.type === 'delete' && (
                        <button onClick={() => resolveReport(r.id, 'delete', r.profiles?.id)} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition">
                          삭제 처리
                        </button>
                      )}
                      <button onClick={() => resolveReport(r.id)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition">
                        무시
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
