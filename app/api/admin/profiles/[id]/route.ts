import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import { deleteProfileCompletely, recordAdminAuditLog } from '@/lib/api/admin';

const IdSchema = z.string().uuid();

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  return await verifySessionToken(token, adminPassword);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid profile id' },
      { status: 400 }
    );
  }

  const success = await deleteProfileCompletely(parsed.data);
  if (!success) {
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500 }
    );
  }


  if (!(await recordAdminAuditLog({
    action: 'profile_delete',
    targetTable: 'profiles',
    targetId: parsed.data,
  }))) {
    return NextResponse.json({ error: 'Audit log failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
