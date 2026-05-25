import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  // 키 형식 정보
  const keyInfo = {
    serviceRoleKeyLength: serviceRoleKey.length,
    serviceRoleKeyPrefix: serviceRoleKey.substring(0, 15) + '...',
    serviceRoleKeyFormat: serviceRoleKey.startsWith('sb_secret_')
      ? 'new (sb_secret_)'
      : serviceRoleKey.startsWith('eyJ')
        ? 'legacy JWT'
        : 'unknown',
    anonKeyLength: anonKey.length,
    anonKeyPrefix: anonKey.substring(0, 15) + '...',
    anonKeyFormat: anonKey.startsWith('sb_publishable_')
      ? 'new (sb_publishable_)'
      : anonKey.startsWith('eyJ')
        ? 'legacy JWT'
        : 'unknown',
  };

  // 테스트 1: 기본 createClient 호출
  let test1Result: any = 'not tested';
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await admin
      .from('reports')
      .select('*', { count: 'exact', head: true });

    test1Result = {
      hasError: !!result.error,
      errorMessage: result.error?.message ?? null,
      errorCode: (result.error as any)?.code ?? null,
      errorDetails: (result.error as any)?.details ?? null,
      errorHint: (result.error as any)?.hint ?? null,
      count: result.count,
      status: result.status,
      statusText: result.statusText,
    };
  } catch (e: any) {
    test1Result = {
      exception: e.message,
      stack: e.stack?.substring(0, 200),
    };
  }

  // 테스트 2: apikey 헤더 명시
  let test2Result: any = 'not tested';
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    });
    const result = await admin
      .from('reports')
      .select('*', { count: 'exact', head: true });

    test2Result = {
      hasError: !!result.error,
      errorMessage: result.error?.message ?? null,
      errorCode: (result.error as any)?.code ?? null,
      count: result.count,
      status: result.status,
    };
  } catch (e: any) {
    test2Result = {
      exception: e.message,
    };
  }

  // 테스트 3: anon key로 같은 쿼리 (RLS 차단 확인용)
  let test3Result: any = 'not tested';
  try {
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });
    const result = await anonClient
      .from('reports')
      .select('*', { count: 'exact', head: true });

    test3Result = {
      hasError: !!result.error,
      errorMessage: result.error?.message ?? null,
      count: result.count,
      status: result.status,
    };
  } catch (e: any) {
    test3Result = {
      exception: e.message,
    };
  }

  return NextResponse.json({
    keyInfo,
    test1_basic: test1Result,
    test2_explicitHeaders: test2Result,
    test3_anonForComparison: test3Result,
  });
}
