'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Stats { total: number; today: number; reports: number; deletes: number }
interface Profile { id: string; nickname: string; instagram_id: string | null; graduation_year: number; grade: number | null; class_number: number | null; created_at: string; schools: { school_name: string } | null }
interface Report { id: string; type: string; reason: string; created_at: string; requested_instagram_id: string | null; is_self_claimed: boolean; profiles: { nickname: string; instagram_id: string | null; schools: { school_name: string } | null } | null }

export default function AdminClient({ stats, profiles, reports }: { stats: Stats; profiles: Profile[]; reports: Report[] }) {
  const [tab, setTab] = useState<'dashboard' | 'profiles' | 'reports'>('dashboard')
  const [localReports, setLocalReports] = useState(reports)
  const [localProfiles, setLocalProfiles] = useState(profiles)

  const hideProfile = async (id: string) => {
    await supabase.from('profiles').update({ is_hidden: true }).eq('id', id)
    setLocalProfiles(p => p.filter(x => x.id !== id))
  }

  const resolveReport = async (id: string, profileId?: string, action?: string) => {
    await supabase.from('reports').update({ status: 'done' }).eq('id', id)
    if (action === 'delete' && profileId) await supabase.from('profiles').update({ is_hidden: true }).eq('id', profileId)
    setLocalReports(r => r.filter(x => x.id !== id))
  }

  const statCards = [
    { label: 'Total profiles', value: stats.total, color: 'text-blue-600' },
    { label: 'Today', value: stats.today, color: 'text-green-600' },
    { label: 'Reports', value: stats.reports, color: 'text-orange-500' },
    { label: 'Delete requests', value: stats.deletes, color: 'text-red-600' },
  ]

  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='bg-white border-b px-6 py-4 flex items-center gap-4'>
        <h1 className='font-bold text-lg'>Admin</h1>
        {(['dashboard', 'profiles', 'reports'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={'px-3 py-1 rounded-full text-sm ' + (tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>{t}</button>
        ))}
      </div>
      <div className='max-w-5xl mx-auto px-4 py-6'>
        {tab === 'dashboard' && (
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {statCards.map(s => (
              <div key={s.label} className='bg-white rounded-xl p-4 border border-gray-100'>
                <div className={'text-3xl font-bold ' + s.color}>{s.value}</div>
                <div className='text-sm text-gray-500 mt-1'>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'profiles' && (
          <div className='space-y-2'>
            {localProfiles.map(p => (
              <div key={p.id} className='bg-white rounded-xl p-4 border border-gray-100 flex items-center justify-between'>
                <div>
                  <span className='font-medium'>{p.nickname}</span>
                  <span className='text-sm text-gray-400 ml-2'>{p.schools?.school_name} {p.graduation_year}</span>
                  {p.instagram_id && <span className='text-blue-500 text-sm ml-2'>@{p.instagram_id}</span>}
                </div>
                <button onClick={() => hideProfile(p.id)} className='text-xs text-red-500 hover:bg-red-50 px-3 py-1 rounded-lg'>Hide</button>
              </div>
            ))}
          </div>
        )}
        {tab === 'reports' && (
          <div className='space-y-2'>
            {localReports.map(r => (
              <div key={r.id} className='bg-white rounded-xl p-4 border border-gray-100'>
                <div className='flex items-start justify-between gap-4'>
                  <div>
                    <span className={'text-xs font-medium px-2 py-0.5 rounded-full mr-2 ' + (r.type === 'report' ? 'bg-orange-100 text-orange-600' : r.type === 'delete' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600')}>{r.type}</span>
                    <span className='font-medium'>{r.profiles?.nickname}</span>
                    <span className='text-sm text-gray-400 ml-2'>{r.profiles?.schools?.school_name}</span>
                    <p className='text-sm text-gray-600 mt-1'>{r.reason}</p>
                    {r.requested_instagram_id && <p className='text-sm text-blue-500'>New ID: @{r.requested_instagram_id}</p>}
                  </div>
                  <div className='flex gap-2 shrink-0'>
                    <button onClick={() => resolveReport(r.id, r.profiles?.schools?.school_name, r.type)} className='text-xs bg-green-500 text-white px-3 py-1 rounded-lg'>Done</button>
                    {r.type === 'delete' && <button onClick={() => resolveReport(r.id, r.id, 'delete')} className='text-xs bg-red-500 text-white px-3 py-1 rounded-lg'>Delete</button>}
                  </div>
                </div>
              </div>
            ))}
            {localReports.length === 0 && <p className='text-gray-400 text-center py-12'>No pending reports</p>}
          </div>
        )}
      </div>
    </div>
  )
}