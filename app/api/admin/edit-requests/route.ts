import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import {
  applyAdminModerationAction,
} from '@/lib/api/admin';

// PHASE 7A COMPLETION PATCH — type='edit' 요청을 실제로 조회·처리할 수 있는 관리자 API.
// app/api/admin/delete-requests/route.ts와 동일한 구조(요청 인증 → validation →
// 상태별 분기 → 기존 lib/api/admin.ts 함수 호출)를 그대로 따른다. profileId나
// requested_instagram_id를 클라이언트에서 받지 않고, 서버가 reports 행에서 다시
// 읽어 그 값만 적용한다(관리자 화면에 표시된 값과 실제 반영값이 어긋날 수 없게 함).

const PatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'done']),
});

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  return await verifySessionToken(token, adminPassword);
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { id, status } = parsed.data;

  const success = await applyAdminModerationAction(
    status === 'done' ? 'edit_request_complete' : 'edit_request_reopen',
    id
  );
  if (!success) {
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
