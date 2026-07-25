import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { supabaseServer } from '@/lib/supabase';
import { getSchoolProfileCount } from '@/lib/api/profiles';
import { syncSchoolLevel, getSchoolLevelSnapshot } from '@/lib/api/levels';
import { revalidateRegistrationContext } from '@/lib/api/homeFeedCache';
import { getSchoolById } from '@/lib/api/schools';
import { calculateSchoolGrowthSnapshot } from '@/lib/policy/schoolGrowth';
import { classifyRegistrationGrowthOutcome } from '@/lib/policy/registrationGrowthReward';
import { verifyCaptchaToken } from '@/lib/security/captcha';
import { z } from 'zod';
import type { SchoolGrowthSnapshot } from '@/types/schoolGrowth';
import type { RegistrationGrowthReward, RegistrationGrowthSnapshot } from '@/types/registration';

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
  // PHASE 9 — Cloudflare Turnstile client 위젯이 발급한 1회용 토큰. 빈 문자열 거부,
  // 비정상적으로 긴 값 방어(실제 토큰은 이보다 훨씬 짧음). DB에는 저장하지 않으므로
  // 아래 insert 페이로드를 만들 때 반드시 분리해서 제외한다.
  captchaToken: z.string().trim().min(1).max(2048),
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

  // PHASE 9 — CAPTCHA 검증은 full Zod validation 이후, DB insert 이전에 수행한다. 이 순서는
  // 문서가 제시한 예시(Rate Limit → CAPTCHA → 전체 Zod 검증)와 다르지만, CAPTCHA 실패
  // 요청이 DB 쓰기/growth 로직에 도달하지 않는다는 핵심 요건은 그대로 지키면서, 애초에
  // Zod를 통과하지 못할 요청(예: school_id가 UUID가 아님)에 대해 외부 Cloudflare API
  // 호출을 낭비하지 않는다 — 현재 코드 구조상 더 단순하고 안전한 순서로 판단해 선택했다.
  const { captchaToken, ...profile } = parsed.data;

  const captchaResult = await verifyCaptchaToken(captchaToken, ip);
  if (!captchaResult.verified) {
    return NextResponse.json(captchaResult.body, { status: captchaResult.status });
  }

  const nickname = profile.nickname.trim().replace(/\s+/g, ' ');

  const { data, error } = await supabaseServer
    .from('profiles')
    .insert({
      ...profile,
      nickname,
      is_self: profile.is_self ?? false,
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
  //
  // PHASE 6A(등록 후 성장 보상) — 이 insert는 DB 기본값으로 is_hidden=false가 적용되므로
  // (성공한 insert 1건 = visible profile count +1) 별도 count 쿼리 없이
  // afterVisibleProfileCount - 1을 beforeVisibleProfileCount로 산술 역산한다.
  // before/after 성장 스냅샷 계산·outcome 판정 전체를 best-effort로 다뤄, 실패해도
  // 프로필 등록 성공 응답(201 { data })은 그대로 유지한다(growthReward만 생략된다).
  let growthReward: RegistrationGrowthReward | undefined;

  try {
    const afterVisibleProfileCount = await getSchoolProfileCount(profile.school_id);
    const beforeVisibleProfileCount = Math.max(0, afterVisibleProfileCount - 1);

    const beforeLevelSnapshot = await getSchoolLevelSnapshot(profile.school_id);
    const syncResult = await syncSchoolLevel(profile.school_id, afterVisibleProfileCount);

    if (!syncResult) {
      console.error('POST /api/profiles level sync failed:', {
        schoolId: profile.school_id,
        cumulativeXp: afterVisibleProfileCount,
      });
    }

    if (beforeLevelSnapshot && syncResult) {
      const before = toGrowthSnapshot(
        calculateSchoolGrowthSnapshot({
          schoolId: profile.school_id,
          schoolName: '',
          slug: '',
          visibleProfileCount: beforeVisibleProfileCount,
          storedCurrentLevel: beforeLevelSnapshot.current_level,
          levelUpdatedAt: beforeLevelSnapshot.level_updated_at,
        })
      );
      const after = toGrowthSnapshot(
        calculateSchoolGrowthSnapshot({
          schoolId: profile.school_id,
          schoolName: '',
          slug: '',
          visibleProfileCount: afterVisibleProfileCount,
          storedCurrentLevel: syncResult.current_level,
          levelUpdatedAt: syncResult.level_updated_at,
        })
      );

      growthReward = {
        schoolId: profile.school_id,
        before,
        after,
        outcome: classifyRegistrationGrowthOutcome(before, after),
      };
    }
  } catch (syncError) {
    console.error('POST /api/profiles level sync threw:', {
      schoolId: profile.school_id,
      error: syncError,
    });
  }

  // 등록이 이미 성공했으므로 최종 응답 직전에만 실제 제출 context의 캐시를 갱신한다.
  // school slug는 client payload가 아니라 서버의 school row에서 읽는다. 조회 실패 시에도
  // Home activity freshness는 유지되며, 이미 성공한 등록 응답은 실패로 바뀌지 않는다.
  let schoolSlug: string | undefined;
  try {
    schoolSlug = (await getSchoolById(profile.school_id))?.slug;
  } catch (schoolLookupError) {
    console.error('POST /api/profiles school lookup threw:', {
      schoolId: profile.school_id,
      error: schoolLookupError,
    });
  }
  revalidateRegistrationContext({
    schoolSlug,
    graduationYear: profile.graduation_year,
    grade: profile.grade,
    classNumber: profile.class_number,
  });

  return NextResponse.json({ data, growthReward }, { status: 201 });
}

// calculateSchoolGrowthSnapshot()의 출력 중 클라이언트에 보낼 필드만 추린다.
// schoolName/slug는 계산에 쓰이지 않는 pass-through 입력이라 응답에 포함하지 않는다
// (app/submit/page.tsx가 이미 선택된 학교 정보를 갖고 있음).
function toGrowthSnapshot(snapshot: SchoolGrowthSnapshot): RegistrationGrowthSnapshot {
  const { visibleProfileCount, effectiveLevel, nextLevel, remainingToNext, progressPercent, isNearLevelUp } =
    snapshot;
  return { visibleProfileCount, effectiveLevel, nextLevel, remainingToNext, progressPercent, isNearLevelUp };
}
