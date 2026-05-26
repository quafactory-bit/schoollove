import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import {
  markRequestAsDone,
  markRequestAsPending,
  hideProfile,
  unhideProfile,
} from '@/lib/api/admin';

const PatchSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
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
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
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

  const { id, profileId, status } = parsed.data;

  if (status === 'done') {
    // 삭제 요청 처리: report를 done으로 + 프로필 숨김
    const [reportDone, profileHidden] = await Promise.all([
      markRequestAsDone(id),
      hideProfile(profileId),
    ]);

    if (!reportDone || !profileHidden) {
      return NextResponse.json(
        { error: 'Processing failed' },
        { status: 500 }
      );
    }
  } else {
    // 되돌리기: report를 pending으로 + 프로필 숨김 해제
    const [reportPending, profileUnhidden] = await Promise.all([
      markRequestAsPending(id),
      unhideProfile(profileId),
    ]);

    if (!reportPending || !profileUnhidden) {
      return NextResponse.json(
        { error: 'Revert failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
