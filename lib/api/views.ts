import { Redis } from '@upstash/redis';

// Upstash 환경변수가 없으면 client를 만들지 않는다.
// Redis.fromEnv()는 URL/TOKEN이 없어도 경고만 찍고 baseUrl="" client를 반환하는데,
// @upstash/redis는 기본적으로 auto-pipelining을 켜고 있어(enableAutoPipelining 기본값 true)
// incr/get 같은 단일 명령도 내부적으로 pipeline.exec()를 거쳐 `${baseUrl}/pipeline`을 fetch한다.
// baseUrl이 빈 문자열이면 그 fetch가 상대경로("/pipeline")로 실행되어
// "TypeError: Failed to parse URL from /pipeline"이 나므로, 애초에 client 생성을 막는다.
const upstashConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = upstashConfigured ? Redis.fromEnv() : null;

let warnedMissingConfig = false;
function warnMissingConfigOnce() {
  if (warnedMissingConfig) return;
  warnedMissingConfig = true;
  console.warn(
    'lib/api/views.ts: Upstash 환경변수(UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN)가 없어 방문자 카운트를 건너뜁니다.'
  );
}

// 학교 페이지 누적 방문자 수.
// 표시는 누적(콜드스타트엔 "이번 주" 0명이 죽은 사이트 인증이 되므로).
// 키: schoollove:views:school:{schoolId}

const VIEW_PREFIX = 'schoollove:views:school:';

// 방문 시 +1 하고 누적값 반환. 실패해도 페이지는 떠야 하므로 에러는 삼킴.
export async function incrSchoolView(schoolId: string): Promise<number> {
  if (!redis) {
    warnMissingConfigOnce();
    return 0;
  }
  try {
    return await redis.incr(`${VIEW_PREFIX}${schoolId}`);
  } catch (e) {
    console.error('incrSchoolView error:', e);
    return 0;
  }
}

// 읽기 전용 (카운트 안 올리고 값만). 지금은 안 쓰지만 년도/반 페이지용으로 남겨둠.
export async function getSchoolView(schoolId: string): Promise<number> {
  if (!redis) {
    warnMissingConfigOnce();
    return 0;
  }
  try {
    const v = await redis.get<number>(`${VIEW_PREFIX}${schoolId}`);
    return v ?? 0;
  } catch (e) {
    console.error('getSchoolView error:', e);
    return 0;
  }
}
