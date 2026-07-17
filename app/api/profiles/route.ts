import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { supabaseServer } from '@/lib/supabase';
import { getSchoolProfileCount } from '@/lib/api/profiles';
import { syncSchoolLevel } from '@/lib/api/levels';
import { revalidateHomeFeed } from '@/lib/api/homeFeedCache';
import { z } from 'zod';

// Upstash rate limit 설정 누락 처리.
// - production: 설정 누락을 우회하지 않고 명확한 500으로 fail-closed한다
//   (lib/admin-auth.ts 경유 app/api/admin/auth/route.ts의 ADMIN_PASSWORD 누락 처리와 동일 관례).
// - development/test: 로컬 개발과 smoke test가 막히지 않도록 서버 경고만 남기고 통과시킨다.
// - 실제 UPSTASH_REDIS_REST_URL/TOKEN 값은 로그에 남기지 않는다(존재 여부만 확인).
type RateLimitCheck =
  | { outcome: 'allow' }
  | {
      outcome: 'block';
      status: 429 | 500;
      body: { error: string };
      headers?: Record<string, string>;
    };

async function checkRateLimit(ip: string): Promise<RateLimitCheck> {
  const upstashConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  if (!upstashConfigured) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        'POST /api/profiles: Upstash rate limit이 설정되지 않았습니다 (UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN 누락). production에서는 설정 누락을 우회하지 않습니다.'
      );
      return { outcome: 'block', status: 500, body: { error: '서버 설정 오류입니다.' } };
    }
    console.warn(
      'POST /api/profiles: Upstash rate limit 환경변수가 없어 development/test 환경에서 rate limit을 건너뜁니다.'
    );
    return { outcome: 'allow' };
  }

  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(20, '60 s'),
    analytics: true,
    prefix: 'schoollove:submit',
  });

  const { success, limit, reset, remaining } = await ratelimit.limit(ip);
  if (!success) {
    return {
      outcome: 'block',
      status: 429,
      body: { error: '잠시 후 다시 시도해주세요. (요청 한도 초과)' },
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    };
  }

  return { outcome: 'allow' };
}

const Schema = z.object({
  school_id: z.string().uuid(),
  // app/submit/page.tsx의 YEARS 드롭다운이 실제로 1970~2032년을 제공한다.
  // 기존 1990~2035 범위는 1970~1989년 졸업자를 서버에서 거부해 기존 UX를 깨뜨리므로 실제 범위에 맞춘다.
  graduation_year: z.number().int().min(1970).max(2032),
  grade: z.number().int().min(1).max(6).nullable().optional(),
  class_number: z.number().int().min(1).max(30).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  student_year: z.number().int().nullable().optional(),
  nickname: z.string().min(1).max(50),
  instagram_id: z.string().max(30).nullable().optional(),
  is_self: z.boolean().optional(),
  // app/submit/page.tsx의 message textarea는 maxLength={30}로 제한된다.
  message: z.string().max(30).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  const rateLimitResult = await checkRateLimit(ip);
  if (rateLimitResult.outcome === 'block') {
    return NextResponse.json(rateLimitResult.body, {
      status: rateLimitResult.status,
      headers: rateLimitResult.headers,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const profile = parsed.data;
  const nickname = profile.nickname.trim().replace(/\s+/g, ' ');

  const { data, error } = await supabaseServer
    .from('profiles')
    .insert({
      ...profile,
      nickname,
      is_self: profile.is_self ?? false,
      report_count: 0,
      is_hidden: false,
    })
    .select()
    .single();

  if (error) {
    console.error('POST /api/profiles error:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 등록된 정보입니다.' }, { status: 409 });
    }
    return NextResponse.json({ error: '등록 중 오류가 발생했습니다.' }, { status: 500 });
  }

  // Register Flow → Level 연결 (docs/decisions/2026-07-14-register-flow-level-connection-phase0.md)
  // 프로필 insert가 이미 성공했으므로, 이 단계의 실패는 등록 성공 응답(201)을 취소하지 않는다.
  // XP Source는 여전히 미확정(잠정 정책)이라 cumulativeXp는 학교의 실제 visible profile 수를 그대로 사용한다.
  try {
    const cumulativeXp = await getSchoolProfileCount(profile.school_id);
    const syncResult = await syncSchoolLevel(profile.school_id, cumulativeXp);
    if (!syncResult) {
      console.error('POST /api/profiles level sync failed:', {
        schoolId: profile.school_id,
        cumulativeXp,
      });
    }
  } catch (syncError) {
    console.error('POST /api/profiles level sync threw:', {
      schoolId: profile.school_id,
      error: syncError,
    });
  }

  // Phase 4B(docs/decisions/2026-07-17-home-feed-freshness.md) — 등록이 이미 성공했으므로
  // 최종 성공 응답을 반환하기 직전에만 홈을 재검증한다.
  revalidateHomeFeed();

  return NextResponse.json({ data }, { status: 201 });
}