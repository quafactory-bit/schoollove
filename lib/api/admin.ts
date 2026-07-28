import { getSupabaseAdmin } from '@/lib/supabase';

// PHASE 7A ADMIN MUTATION AUTHORITY PATCH — 이 모듈의 mutation 함수와 일부 조회 함수는
// service-role 클라이언트(getSupabaseAdmin())를 사용한다. 원격 권한 조회로 확인한 사실:
// anon/authenticated는 profiles에 UPDATE 권한이 전혀 없고, reports에는 INSERT 외
// 어떤 테이블 권한도 없다(SELECT조차 없음) — RLS 정책도 profiles_read(SELECT,
// is_hidden=false만)/profiles_insert/reports_insert 세 개뿐이다. 그래서 이 모듈의
// admin 전용 함수는 반드시 인증된 관리자 API route에서만 호출돼야 한다.
//
// 이 파일은 client component에서 "타입만"(`import type { AdminReport, AdminProfile }`)
// 가져다 쓴다 — TypeScript type-only import는 컴파일 시 완전히 제거되므로 이 파일의
// 런타임 코드(서비스 롤 키를 사용하는 함수 포함)는 클라이언트 번들에 절대 포함되지
// 않는다(저장소에 'server-only' 패키지가 설치돼 있지 않아 새 의존성을 추가하는 대신
// 이 방식으로 경계를 유지한다 — 기존 deleteProfileCompletely()의 주석 관례와 동일).
// 새 함수를 이 파일에 추가할 때도 절대 client component에서 값(런타임)을 import하지
// 않는다.
function tryGetAdminClient(): ReturnType<typeof getSupabaseAdmin> | null {
  try {
    return getSupabaseAdmin();
  } catch (error) {
    console.error('getSupabaseAdmin() failed:', error);
    return null;
  }
}

export async function recordAdminAuditLog(input: {
  action: string;
  targetTable?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<boolean> {
  const admin = tryGetAdminClient();
  if (!admin) return false;

  const { error } = await admin.from('admin_audit_logs').insert({
    actor_type: 'admin',
    action: input.action,
    target_table: input.targetTable ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.error('recordAdminAuditLog failed:', { action: input.action });
    return false;
  }
  return true;
}

export type DashboardStats = {
  totalProfiles: number;
  todayProfiles: number;
  pendingReports: number;
  pendingDeleteRequests: number;
};

export type AdminReport = {
  id: string;
  type: 'report' | 'edit' | 'delete';
  reason: string | null;
  status: 'pending' | 'done';
  created_at: string;
  requested_instagram_id: string | null;
  is_self_claimed: boolean;
  profile: {
    id: string;
    nickname: string;
    instagram_id: string | null;
    graduation_year: number;
    grade: number | null;
    class_number: number | null;
    school: {
      id: string;
      school_name: string;
      slug: string;
    } | null;
  } | null;
};

/**
 * 관리자 대시보드용 통계 4종 집계.
 * PHASE 10A에서 profiles 공개 SELECT가 제거됐으므로 모든 관리자 집계는 인증된 관리자
 * route 내부의 service-role 클라이언트만 사용한다. 관리자 클라이언트를 만들 수 없으면
 * 공개 클라이언트로 우회하지 않고 0으로 fail-closed 한다.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const kstMidnight = new Date(
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate(),
      0,
      0,
      0
    )
  );
  const todayStartUtc = new Date(
    kstMidnight.getTime() - kstOffset
  ).toISOString();

  const admin = tryGetAdminClient();

  if (!admin) {
    return {
      totalProfiles: 0,
      todayProfiles: 0,
      pendingReports: 0,
      pendingDeleteRequests: 0,
    };
  }

  const [totalResult, todayResult, reportsResult, deleteRequestsResult] =
    await Promise.all([
      admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_hidden', false),
      admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_hidden', false)
        .gte('created_at', todayStartUtc),
      admin
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'report')
        .eq('status', 'pending'),
      admin
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'delete')
        .eq('status', 'pending'),
    ]);

  if (totalResult.error) console.error('getDashboardStats (profiles) error:', totalResult.error);
  if (todayResult.error) console.error('getDashboardStats (today profiles) error:', todayResult.error);
  if (reportsResult.error) console.error('getDashboardStats (reports) error:', reportsResult.error);
  if (deleteRequestsResult.error)
    console.error('getDashboardStats (delete requests) error:', deleteRequestsResult.error);

  return {
    totalProfiles: totalResult.count ?? 0,
    todayProfiles: todayResult.count ?? 0,
    pendingReports: reportsResult.count ?? 0,
    pendingDeleteRequests: deleteRequestsResult.count ?? 0,
  };
}

/**
 * 신고/수정/삭제 요청 목록 조회.
 * reports 테이블은 anon/authenticated에 SELECT 권한 자체가 없어(원격 확인) service-role이
 * 반드시 필요하다.
 */
export async function getRecentRequests(
  type: 'report' | 'edit' | 'delete',
  limit = 20
): Promise<AdminReport[]> {
  const admin = tryGetAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from('reports')
    .select(
      `
      id,
      type,
      reason,
      status,
      created_at,
      requested_instagram_id,
      is_self_claimed,
      profile:profiles (
        id,
        nickname,
        instagram_id,
        graduation_year,
        grade,
        class_number,
        school:schools (
          id,
          school_name,
          slug
        )
      )
    `
    )
    .eq('type', type)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getRecentRequests error:', error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    type: row.type,
    reason: row.reason,
    status: row.status,
    created_at: row.created_at,
    requested_instagram_id: row.requested_instagram_id,
    is_self_claimed: row.is_self_claimed,
    profile: row.profile
      ? {
          id: row.profile.id,
          nickname: row.profile.nickname,
          instagram_id: row.profile.instagram_id,
          graduation_year: row.profile.graduation_year,
          grade: row.profile.grade,
          class_number: row.profile.class_number,
          school: row.profile.school
            ? {
                id: row.profile.school.id,
                school_name: row.profile.school.school_name,
                slug: row.profile.school.slug,
              }
            : null,
        }
      : null,
  })) as AdminReport[];
}

/**
 * 신고/요청 상태를 'done'으로 변경.
 * reports UPDATE는 anon/authenticated에 권한이 없어(원격 확인) service-role이 필요하다.
 */
export async function markRequestAsDone(id: string): Promise<boolean> {
  const admin = tryGetAdminClient();
  if (!admin) return false;

  const { error } = await admin
    .from('reports')
    .update({ status: 'done' })
    .eq('id', id);

  if (error) {
    console.error('markRequestAsDone error:', error);
    return false;
  }
  return true;
}

/**
 * 신고/요청 상태를 'pending'으로 되돌림.
 */
export async function markRequestAsPending(id: string): Promise<boolean> {
  const admin = tryGetAdminClient();
  if (!admin) return false;

  const { error } = await admin
    .from('reports')
    .update({ status: 'pending' })
    .eq('id', id);

  if (error) {
    console.error('markRequestAsPending error:', error);
    return false;
  }
  return true;
}

/**
 * PHASE 7A COMPLETION PATCH — 수정(edit) 요청 처리에 필요한 최소 정보 조회.
 * 클라이언트가 보낸 값을 그대로 반영하지 않고, 서버가 reports 행에 실제 저장된
 * profile_id/requested_instagram_id를 다시 읽어 그 값만 적용한다.
 */
export async function getEditRequestDetail(
  id: string
): Promise<{ profileId: string; requestedInstagramId: string } | null> {
  const admin = tryGetAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('reports')
    .select('profile_id, requested_instagram_id')
    .eq('id', id)
    .eq('type', 'edit')
    .single();

  if (error || !data) {
    console.error('getEditRequestDetail error:', error);
    return null;
  }

  const row = data as { profile_id: string; requested_instagram_id: string | null };
  if (!row.requested_instagram_id) return null;

  return { profileId: row.profile_id, requestedInstagramId: row.requested_instagram_id };
}

/**
 * 수정 요청을 실제로 반영 — profiles.instagram_id를 요청된 값으로 갱신한다.
 * (수정 요청 처리 시 호출)
 */
export async function applyProfileInstagramEdit(
  profileId: string,
  instagramId: string
): Promise<boolean> {
  const admin = tryGetAdminClient();
  if (!admin) return false;

  const { error } = await admin
    .from('profiles')
    .update({ instagram_id: instagramId })
    .eq('id', profileId);

  if (error) {
    console.error('applyProfileInstagramEdit error:', error);
    return false;
  }
  return true;
}

/**
 * 프로필 숨김 처리 (삭제 요청 처리 시 호출).
 * profiles UPDATE는 anon/authenticated에 권한이 없어(원격 확인) service-role이 필요하다.
 */
export async function hideProfile(profileId: string): Promise<boolean> {
  const admin = tryGetAdminClient();
  if (!admin) return false;

  const { error } = await admin
    .from('profiles')
    .update({ is_hidden: true })
    .eq('id', profileId);

  if (error) {
    console.error('hideProfile error:', error);
    return false;
  }
  return true;
}

/**
 * 프로필 숨김 해제 (되돌리기).
 */
export async function unhideProfile(profileId: string): Promise<boolean> {
  const admin = tryGetAdminClient();
  if (!admin) return false;

  const { error } = await admin
    .from('profiles')
    .update({ is_hidden: false })
    .eq('id', profileId);

  if (error) {
    console.error('unhideProfile error:', error);
    return false;
  }
  return true;
}

export type AdminProfile = {
  id: string;
  nickname: string;
  instagram_id: string | null;
  graduation_year: number;
  grade: number | null;
  class_number: number | null;
  department: string | null;
  report_count: number;
  is_hidden: boolean;
  created_at: string;
  school: {
    id: string;
    school_name: string;
    slug: string;
    school_type: string;
  } | null;
};

export type ProfilesResult = {
  profiles: AdminProfile[];
  total: number;
  error: boolean;
};

const ADMIN_PROFILE_SELECT = `
  id,
  nickname,
  instagram_id,
  graduation_year,
  grade,
  class_number,
  department,
  report_count,
  is_hidden,
  created_at,
  school:schools (
    id,
    school_name,
    slug,
    school_type
  )
`;

// .ilike()의 값으로만 검색어를 넘긴다. PostgREST OR 표현식에 사용자 입력을 직접
// 이어 붙이지 않으므로 쉼표·괄호·따옴표가 filter 문법을 깨지 않는다. SQL LIKE의
// wildcard인 %, _와 escape 문자(\\)는 리터럴 검색이 되도록 escape한다.
export function escapeLikePattern(query: string): string {
  return query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function mapAdminProfiles(rows: unknown[]): AdminProfile[] {
  return rows.map((row: any) => ({
    id: row.id,
    nickname: row.nickname,
    instagram_id: row.instagram_id,
    graduation_year: row.graduation_year,
    grade: row.grade,
    class_number: row.class_number,
    department: row.department,
    report_count: row.report_count,
    is_hidden: row.is_hidden,
    created_at: row.created_at,
    school: row.school
      ? {
          id: row.school.id,
          school_name: row.school.school_name,
          slug: row.school.slug,
          school_type: row.school.school_type,
        }
      : null,
  })) as AdminProfile[];
}

/**
 * 관리자용 전체 프로필 목록 조회 (검색, 페이지네이션).
 * anon 키(supabaseServer)는 RLS(profiles_read, is_hidden=false)로 숨김 처리된 프로필을
 * 볼 수 없다 — 신고 3회 자동 hidden으로 숨겨진 프로필을 관리자가 검토·복구하려면
 * 이 목록에서 반드시 보여야 하므로 service-role을 사용한다.
 */
export async function getAdminProfiles(
  page = 1,
  query = '',
  perPage = 20
): Promise<ProfilesResult> {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const admin = tryGetAdminClient();
  if (!admin) return { profiles: [], total: 0, error: true };

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    const pattern = `%${escapeLikePattern(trimmedQuery)}%`;

    // PostgREST는 embedded schools.school_name을 profiles의 .or() 안에서 다른
    // profiles 컬럼과 함께 지원하지 않는다. 학교 ID와 nickname을 각각 같은 서버
    // 관리자 경계에서 조회하고, profile ID로 합쳐 중복을 제거한다.
    const { data: schools, error: schoolsError } = await admin
      .from('schools')
      .select('id')
      .ilike('school_name', pattern);

    if (schoolsError) {
      console.error('getAdminProfiles school search error:', schoolsError);
      return { profiles: [], total: 0, error: true };
    }

    const schoolIds = (schools ?? [])
      .map((school: { id?: unknown }) => school.id)
      .filter((id): id is string => typeof id === 'string');

    const [nicknameResult, schoolResult] = await Promise.all([
      admin
        .from('profiles')
        .select(ADMIN_PROFILE_SELECT)
        .ilike('nickname', pattern)
        .order('created_at', { ascending: false }),
      schoolIds.length > 0
        ? admin
            .from('profiles')
            .select(ADMIN_PROFILE_SELECT)
            .in('school_id', schoolIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (nicknameResult.error || schoolResult.error) {
      console.error('getAdminProfiles profile search error:', nicknameResult.error ?? schoolResult.error);
      return { profiles: [], total: 0, error: true };
    }

    const deduplicated = new Map<string, AdminProfile>();
    for (const profile of mapAdminProfiles([...(nicknameResult.data ?? []), ...(schoolResult.data ?? [])])) {
      deduplicated.set(profile.id, profile);
    }
    const profiles = Array.from(deduplicated.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return {
      profiles: perPage > 0 ? profiles.slice(from, to + 1) : profiles,
      total: profiles.length,
      error: false,
    };
  }

  let q = admin
    .from('profiles')
    .select(ADMIN_PROFILE_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (perPage > 0) q = q.range(from, to);

  const { data, error, count } = await q;

  if (error) {
    console.error('getAdminProfiles error:', error);
    return { profiles: [], total: 0, error: true };
  }

  return {
    profiles: mapAdminProfiles(data ?? []),
    total: count ?? 0,
    error: false,
  };
}

/**
 * 프로필 영구 삭제 (삭제 요청 처리 시 사용).
 * 외래키 제약 때문에 reports → profiles 순서로 삭제.
 * service_role 키를 사용해 RLS를 우회한다.
 * 절대 클라이언트에서 호출하지 말 것. API route를 통해서만 호출.
 */
export async function deleteProfileCompletely(profileId: string): Promise<boolean> {
  const admin = tryGetAdminClient();
  if (!admin) return false;

  // 1. 이 프로필을 참조하는 모든 reports 먼저 삭제 (외래키 제약)
  const { error: reportsError } = await admin
    .from('reports')
    .delete()
    .eq('profile_id', profileId);

  if (reportsError) {
    console.error('deleteProfileCompletely (reports) error:', reportsError);
    return false;
  }

  // 2. profile 삭제
  const { error: profileError } = await admin
    .from('profiles')
    .delete()
    .eq('id', profileId);

  if (profileError) {
    console.error('deleteProfileCompletely (profile) error:', profileError);
    return false;
  }

  return true;
}
