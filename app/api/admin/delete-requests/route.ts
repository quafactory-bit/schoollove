import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import {
  applyAdminModerationAction,
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

  const { id, status } = parsed.data;
  // profileId remains accepted for backward-compatible clients but is never trusted. The
  // transaction RPC derives the linked profile from the authenticated admin's report row.
  const success = await applyAdminModerationAction(
    status === 'done' ? 'deletion_request_complete' : 'deletion_request_reopen',
    id
  );
  if (!success) {
    return NextResponse.json(
      { error: status === 'done' ? 'Processing failed' : 'Revert failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
