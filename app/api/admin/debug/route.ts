import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasAdminPassword = !!process.env.ADMIN_PASSWORD;

  // 키의 첫 10자만 표시 (전체 노출 방지)
  const serviceRoleKeyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10) + '...'
    : 'NOT SET';

  const serviceRoleKeyLength = process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0;

  // 실제 Supabase 호출 테스트
  let adminTestResult = 'not tested';
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const admin = getSupabaseAdmin();
    const { data, error, count } = await admin
      .from('reports')
      .select('*', { count: 'exact', head: true });

    if (error) {
      adminTestResult = `ERROR: ${error.message}`;
    } else {
      adminTestResult = `SUCCESS: count=${count}`;
    }
  } catch (e: any) {
    adminTestResult = `EXCEPTION: ${e.message}`;
  }

  return NextResponse.json({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: hasUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: hasAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: hasServiceRoleKey,
      ADMIN_PASSWORD: hasAdminPassword,
    },
    serviceRoleKeyPrefix,
    serviceRoleKeyLength,
    adminTestResult,
  });
}
