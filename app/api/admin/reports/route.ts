import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  verifySessionToken,
  ADMIN_COOKIE_NAME,
} from '@/lib/admin-auth';
import {
  markRequestAsDone,
  markRequestAsPending,
  recordAdminAuditLog,
} from '@/lib/api/admin';

const PatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'done']),
});

/**
 * 관리자 인증 헬퍼.
 * 미들웨어가 이미 보호하지만, API는 직접 호출도 가능하므로 한 번 더 확인.
 */
async function requireAdmin(request: NextRequest): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;

  return await verifySessionToken(token, adminPassword);
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json(
      { error: '인증되지 않은 요청입니다.' },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: '잘못된 요청입니다.' },
      { status: 400 }
    );
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '잘못된 입력입니다.' },
      { status: 400 }
    );
  }

  const { id, status } = parsed.data;
  const success =
    status === 'done'
      ? await markRequestAsDone(id)
      : await markRequestAsPending(id);

  if (!success) {
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }


  if (!(await recordAdminAuditLog({
    action: 'report_status_change',
    targetTable: 'reports',
    targetId: id,
    metadata: { status },
  }))) {
    return NextResponse.json({ error: 'Audit log failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
