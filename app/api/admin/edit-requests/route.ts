import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import {
  markRequestAsDone,
  markRequestAsPending,
  getEditRequestDetail,
  applyProfileInstagramEdit,
  recordAdminAuditLog,
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

  if (status === 'done') {
    const detail = await getEditRequestDetail(id);
    if (!detail) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // PHASE 7A ADMIN MUTATION AUTHORITY PATCH — 두 UPDATE(profiles.instagram_id,
    // reports.status)에 새 RPC/migration 없이는 완전한 트랜잭션을 만들 수 없다(범위 밖).
    // 대신 순서를 명확히 해 잘못된 'done' 상태를 방지한다: profiles 반영이 먼저
    // 성공해야만 reports를 done으로 표시한다. profiles 반영 자체가 실패하면 reports는
    // 절대 done으로 바뀌지 않는다(재시도 시 다시 반영을 시도할 수 있음). profiles
    // 반영은 성공했는데 reports.status 갱신만 실패하면, 실제 인스타그램은 이미
    // 바뀌었지만 요청은 여전히 'pending'으로 남는 "부분 성공" 상태가 된다 — 이 경우
    // 클라이언트에는 내부 DB 내용을 노출하지 않는 일반 500만 반환하고, 서버 로그에는
    // 어느 단계까지 성공했는지 명확히 남겨 관리자가 reports.status만 수동으로 다시
    // 'done' 처리하면 되는 상태임을 알 수 있게 한다(profiles를 다시 UPDATE할 필요는
    // 없음 — 이미 반영됐으므로 재적용은 안전하지만 필수는 아니다).
    const applied = await applyProfileInstagramEdit(detail.profileId, detail.requestedInstagramId);
    if (!applied) {
      console.error('PATCH /api/admin/edit-requests: profiles 반영 실패, reports는 done 처리하지 않음', {
        reportId: id,
      });
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }

    const reportDone = await markRequestAsDone(id);
    if (!reportDone) {
      console.error(
        'PATCH /api/admin/edit-requests: profiles 반영은 성공했지만 reports.status=done 갱신 실패(부분 성공) — 수동 확인 필요',
        { reportId: id, profileId: detail.profileId }
      );
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
  } else {
    const reportPending = await markRequestAsPending(id);
    if (!reportPending) {
      return NextResponse.json({ error: 'Revert failed' }, { status: 500 });
    }
  }

  if (!(await recordAdminAuditLog({
    action: status === 'done' ? 'edit_request_complete' : 'edit_request_reopen',
    targetTable: 'reports',
    targetId: id,
    metadata: { status },
  }))) {
    return NextResponse.json({ error: 'Audit log failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
