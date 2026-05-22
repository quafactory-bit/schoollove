import { supabase } from '@/lib/supabase'
import AdminClient from './AdminClient'

export const metadata = { robots: 'noindex' }

export default async function AdminPage() {
  const [profiles, reports, todayProfiles] = await Promise.all([
    supabase.from('profiles').select('*, schools(school_name)').eq('is_hidden', false).order('created_at', { ascending: false }),
    supabase.from('reports').select('*, profiles(nickname, instagram_id, schools(school_name))').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id').gte('created_at', new Date().toISOString().split('T')[0]),
  ])

  const stats = {
    total: profiles.count || profiles.data?.length || 0,
    today: todayProfiles.data?.length || 0,
    reports: reports.data?.filter(r => r.type === 'report').length || 0,
    deletes: reports.data?.filter(r => r.type === 'delete').length || 0,
  }

  return <AdminClient stats={stats} profiles={profiles.data || []} reports={reports.data || []} />
}