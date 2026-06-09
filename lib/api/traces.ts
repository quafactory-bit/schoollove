import { supabaseServer } from '@/lib/supabase';

// traces 테이블 타입 (간단해서 여기 인라인. 나중에 /types/trace.ts로 빼도 됨)
export interface Trace {
  id: string;
  school_id: string;
  graduation_year: number | null;
  grade: number | null;
  class_number: number | null;
  message: string;
  report_count: number;
  is_hidden: boolean;
  created_at: string;
}

export interface TraceInsert {
  school_id: string;
  graduation_year?: number | null;
  grade?: number | null;
  class_number?: number | null;
  message: string;
}

const TRACE_LIMIT = 20;

// 학교 단위 최근 흔적 (학교 페이지에서 사용)
export async function getTracesBySchool(
  schoolId: string,
  limit = TRACE_LIMIT
): Promise<Trace[]> {
  const { data, error } = await supabaseServer
    .from('traces')
    .select('*')
    .eq('school_id', schoolId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getTracesBySchool error:', error);
    return [];
  }
  return data || [];
}

// 흔적 개수 (드롭다운 순서 분기용: 0이면 "내가 1등!"을 맨 위로)
export async function getTraceCountBySchool(schoolId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from('traces')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('is_hidden', false);

  if (error) {
    console.error('getTraceCountBySchool error:', error);
    return 0;
  }
  return count || 0;
}

// 흔적 등록: Rate Limit 위해 API Route 경유 (insertProfile과 동일 패턴)
export async function insertTrace(
  trace: TraceInsert
): Promise<{ data: Trace | null; error: string | null }> {
  try {
    const res = await fetch('/api/traces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trace),
    });

    const result = await res.json();

    if (!res.ok) {
      return { data: null, error: result.error ?? '등록 중 오류가 발생했습니다.' };
    }
    return { data: result.data, error: null };
  } catch {
    return { data: null, error: '네트워크 오류가 발생했습니다.' };
  }
}
