import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// 학교 페이지 누적 방문자 수.
// 표시는 누적(콜드스타트엔 "이번 주" 0명이 죽은 사이트 인증이 되므로).
// 키: schoollove:views:school:{schoolId}

const VIEW_PREFIX = 'schoollove:views:school:';

// 방문 시 +1 하고 누적값 반환. 실패해도 페이지는 떠야 하므로 에러는 삼킴.
export async function incrSchoolView(schoolId: string): Promise<number> {
  try {
    return await redis.incr(`${VIEW_PREFIX}${schoolId}`);
  } catch (e) {
    console.error('incrSchoolView error:', e);
    return 0;
  }
}

// 읽기 전용 (카운트 안 올리고 값만). 지금은 안 쓰지만 년도/반 페이지용으로 남겨둠.
export async function getSchoolView(schoolId: string): Promise<number> {
  try {
    const v = await redis.get<number>(`${VIEW_PREFIX}${schoolId}`);
    return v ?? 0;
  } catch (e) {
    console.error('getSchoolView error:', e);
    return 0;
  }
}
