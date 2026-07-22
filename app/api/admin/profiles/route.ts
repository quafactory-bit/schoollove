import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import { getAdminProfiles, hideProfile, unhideProfile } from '@/lib/api/admin';

const PatchSchema = z.object({
  id: z.string().uuid(),
  is_hidden: z.boolean(),
});

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  return await verifySessionToken(token, adminPassword);
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get('q') ?? '';
  const result = await getAdminProfiles(1, query, 0);

  if (result.error) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  return NextResponse.json({ profiles: result.profiles, total: result.total });
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

  const { id, is_hidden } = parsed.data;
  const success = is_hidden
    ? await hideProfile(id)
    : await unhideProfile(id);

  if (!success) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
