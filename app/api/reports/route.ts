import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { supabaseServer } from '@/lib/supabase';
import { z } from 'zod';

// PHASE 7A — 신고/수정/삭제 요청을 서버 API 경유로 전환.
// ReportButton.tsx/EditDeleteModal.tsx가 anon 키로 reports를 직접 INSERT하던 경로를
// 제거하고, 이 route가 validation + Rate Limit을 거쳐 동일한 reports 테이블에 삽입한다.
// DB trigger(handle_report_count, 원격에만 존재)와 RLS(20260717130000 마이그레이션)는
// 이번 변경으로 건드리지 않는다 — 신고 3회 자동 hidden은 그 트리거가 계속 책임진다.
//
// reports 테이블에 대한 anon INSERT 컬럼 권한은 profile_id/type/reason/
// requested_instagram_id/is_self_claimed 뿐이다(원격 확인 완료). status/id/created_at은
// 컬럼 권한이 없어 INSERT 문에 포함하면 permission denied가 난다 — 그래서 이 route는
// status를 절대 포함하지 않고 컬럼 DEFAULT('pending')에 맡긴다. supabaseServer는
// service role이 아니라 기존 anon 키 기반 클라이언트이므로 이 RLS/컬럼 권한을 그대로 받는다.

const REPORT_REASONS = ['잘못된 정보', '사칭', '부적절한 내용', '기타'] as const;

const ReportRequestSchema = z
  .object({
    type: z.literal('report'),
    profile_id: z.string().uuid(),
    reason: z.enum(REPORT_REASONS),
  })
  .strict();

const EditRequestSchema = z
  .object({
    type: z.literal('edit'),
    profile_id: z.string().uuid(),
    requested_instagram_id: z.string().trim().min(1).max(30),
  })
  .strict();

const DeleteRequestSchema = z
  .object({
    type: z.literal('delete'),
    profile_id: z.string().uuid(),
  })
  .strict();

// type을 판별자로 쓰는 discriminated union — 요청 종류마다 별도 route를 만들지 않고
// 하나의 route에서 명시적으로 분기한다(reports 테이블 자체가 이미 type으로 세 요청을
// 통합하고 있어 API도 같은 경계를 따르는 것이 더 단순하고, 세 route가 거의 동일한
// Rate Limit/에러 처리 코드를 반복하지 않아도 된다).
const RequestSchema = z.discriminatedUnion('type', [
  ReportRequestSchema,
  EditRequestSchema,
  DeleteRequestSchema,
]);

type ParsedRequest = z.infer<typeof RequestSchema>;

// ─── Rate Limit ──────────────────────────────────────────────────
// app/api/profiles/route.ts의 checkRateLimit() 패턴(Upstash 미설정 시
// production은 fail-closed, development/test는 우회)을 그대로 재사용한다.
//
// 신고/수정/삭제는 등록보다 훨씬 드문 1회성 행동이라 traces(5/60s, "더 빡빡하게")와
// 비슷한 강도의 IP 기준 한도(ACTOR)를 쓰고, 여기에 더해 "같은 IP가 같은 프로필에
// 같은 action을 반복 제출"하는 것을 별도로 강하게 제한하는 TARGET 한도를 둔다 —
// V1.0 감사에서 발견된 실제 공격 시나리오(신고 3건을 빠르게 반복 삽입해 즉시 hidden
// 처리)를 이 TARGET 한도가 직접 차단한다. 두 한도 모두 명시된 FROZEN 수치가 없어
// 보수적인 기본값을 새로 선택했다.
const ACTOR_LIMIT = 5;
const ACTOR_WINDOW = '60 s';
const TARGET_LIMIT = 1;
const TARGET_WINDOW = '600 s';

type RateLimitCheck =
  | { outcome: 'allow' }
  | { outcome: 'block'; status: 429 | 500 | 503; body: { error: string } };

// PHASE 7A COMPLETION PATCH — Rate Limit을 "부가 방어선"이 아니라 이 route의 보안
// 경계 자체로 취급한다. app/api/traces/route.ts의 dedupe 캐시(중복 문구 방지, 실패해도
// Rate Limit이라는 1차 방어선이 남아 있어 fail-open이 안전함)와 달리, 이 route에서는
// Rate Limit 자체가 유일한 남용 방지 수단이므로 production에서 판정이 불가능하면
// 반드시 요청을 막는다(신고 3회 자동 hidden을 악용한 무단 프로필 숨김을 Rate Limit
// 하나로 막고 있다는 V1.0 감사 결론과 직접 연결됨).
async function checkReportsRateLimit(
  action: ParsedRequest['type'],
  ip: string,
  profileId: string
): Promise<RateLimitCheck> {
  const isProduction = process.env.NODE_ENV === 'production';
  const upstashConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  if (!upstashConfigured) {
    if (isProduction) {
      console.error(
        'POST /api/reports: Upstash rate limit이 설정되지 않았습니다 (UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN 누락). production에서는 설정 누락을 우회하지 않습니다.'
      );
      return { outcome: 'block', status: 500, body: { error: '서버 설정 오류입니다.' } };
    }
    console.warn(
      'POST /api/reports: Upstash rate limit 환경변수가 없어 development/test 환경에서 rate limit을 건너뜁니다.'
    );
    return { outcome: 'allow' };
  }

  try {
    const redis = Redis.fromEnv();

    const actorLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ACTOR_LIMIT, ACTOR_WINDOW),
      analytics: true,
      prefix: 'schoollove:reports:actor',
    });
    const targetLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(TARGET_LIMIT, TARGET_WINDOW),
      analytics: true,
      prefix: 'schoollove:reports:target',
    });

    // key에는 action/ip/profileId만 사용한다 — reason·닉네임·인스타 ID 같은 사용자
    // 입력 원문은 Rate Limit key에 절대 포함하지 않는다.
    const [actorResult, targetResult] = await Promise.all([
      actorLimiter.limit(`${action}:${ip}`),
      targetLimiter.limit(`${action}:${ip}:${profileId}`),
    ]);

    if (!actorResult.success || !targetResult.success) {
      return {
        outcome: 'block',
        status: 429,
        body: { error: '잠시 후 다시 시도해주세요.' },
      };
    }
    return { outcome: 'allow' };
  } catch (error) {
    console.error('POST /api/reports rate limit check failed:', error);
    // Upstash client 생성 실패, limiter.limit() 호출 예외 등 "판정 자체가 불가능한"
    // 모든 경우가 이 catch로 모인다. production에서는 판정 불가 = 차단(fail-closed).
    // development/test에서는 로컬 인프라 장애로 개발이 막히지 않도록 우회한다 —
    // 환경변수 자체가 없는 경우(위 분기)와 동일한 이유이며, 원격 서비스 신뢰성 문제일
    // 뿐 보안 경계가 아니므로 dev/test 한정으로 우회를 허용해도 프로덕션 보안에
    // 영향이 없다.
    if (isProduction) {
      return {
        outcome: 'block',
        status: 503,
        body: { error: '일시적으로 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.' },
      };
    }
    console.warn(
      'POST /api/reports: development/test 환경에서 rate limit 저장소 장애를 우회합니다.'
    );
    return { outcome: 'allow' };
  }
}

// ─── INSERT payload 조립 ──────────────────────────────────────────
// is_self_claimed/reason(edit·delete)은 클라이언트 입력을 신뢰하지 않고 서버가
// type만으로 고정 값을 결정한다 — 기존 EditDeleteModal.tsx도 실제로는 selfClaimed
// 상태값이 아니라 리터럴 true를 저장했으므로(체크박스는 제출 전 클라이언트 게이트일
// 뿐) 동작은 그대로 유지된다.
type ReportInsertPayload = {
  profile_id: string;
  type: 'report' | 'edit' | 'delete';
  reason: string;
  requested_instagram_id: string | null;
  is_self_claimed: boolean;
};

function buildInsertPayload(parsed: ParsedRequest): ReportInsertPayload {
  if (parsed.type === 'report') {
    return {
      profile_id: parsed.profile_id,
      type: 'report',
      reason: parsed.reason,
      requested_instagram_id: null,
      is_self_claimed: false,
    };
  }
  if (parsed.type === 'edit') {
    return {
      profile_id: parsed.profile_id,
      type: 'edit',
      reason: '수정 요청',
      requested_instagram_id: parsed.requested_instagram_id,
      is_self_claimed: true,
    };
  }
  return {
    profile_id: parsed.profile_id,
    type: 'delete',
    reason: '삭제 요청',
    requested_instagram_id: null,
    is_self_claimed: true,
  };
}

const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const { type, profile_id } = parsed.data;

  const rateLimitResult = await checkReportsRateLimit(type, ip, profile_id);
  if (rateLimitResult.outcome === 'block') {
    return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status });
  }

  const { data, error } = await supabaseServer
    .from('reports')
    .insert(buildInsertPayload(parsed.data))
    .select('id, status')
    .single();

  if (error) {
    if (error.code === POSTGRES_FOREIGN_KEY_VIOLATION) {
      return NextResponse.json({ error: '존재하지 않는 프로필입니다.' }, { status: 400 });
    }
    console.error('POST /api/reports error:', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ data, error: null }, { status: 201 });
}
