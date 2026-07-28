import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import { getSchoolLevelSnapshot, syncSchoolLevel } from '@/lib/api/levels';
import { recordAdminAuditLog } from '@/lib/api/admin';

const LevelSyncSchema = z.object({
  schoolId: z.string().uuid(),
  cumulativeXp: z.number().int().nonnegative().safe(),
});

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  return await verifySessionToken(token, adminPassword);
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = LevelSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { schoolId, cumulativeXp } = parsed.data;

  // before/after는 각각 별도 시점의 조회일 뿐이다. before SELECT와 syncSchoolLevel
  // 내부 처리 사이에 동시 요청이 개입할 수 있으므로, before !== after가 "이번 요청이
  // 실제 UPDATE를 수행했다"는 뜻은 아니다 — 초기 조회 상태와 동기화 후 최종 저장
  // 상태의 차이만을 의미한다.
  const before = await getSchoolLevelSnapshot(schoolId);
  if (!before) {
    return NextResponse.json({ error: 'Snapshot failed' }, { status: 500 });
  }

  const after = await syncSchoolLevel(schoolId, cumulativeXp);
  if (!after) {
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }

  if (!(await recordAdminAuditLog({
    action: 'school_level_sync',
    targetTable: 'schools',
    targetId: schoolId,
    metadata: { cumulative_xp: cumulativeXp },
  }))) {
    return NextResponse.json({ error: 'Audit log failed' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    schoolId,
    cumulativeXp,
    before,
    after,
  });
}
