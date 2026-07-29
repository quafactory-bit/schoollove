import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSessionToken,
  timingSafeEqual,
  ADMIN_COOKIE_NAME,
} from '@/lib/admin-auth';
import { checkAdminLoginRateLimit } from '@/lib/security/adminRateLimit';
import { getRequestIp } from '@/lib/security/connectionRateLimit';

const LoginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const rate = await checkAdminLoginRateLimit(getRequestIp(request));
  if (!rate.allowed) {
    const response = NextResponse.json({ error: rate.status === 503 ? '관리자 로그인 보호 설정을 확인 중입니다.' : '로그인 시도가 너무 많습니다.' }, { status: rate.status });
    if ('retryAfter' in rate) response.headers.set('Retry-After', String(rate.retryAfter));
    return response;
  }
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD environment variable is not set');
    return NextResponse.json(
      { error: '서버 설정 오류입니다.' },
      { status: 500 }
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

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '비밀번호를 입력하세요.' },
      { status: 400 }
    );
  }

  if (!timingSafeEqual(parsed.data.password, adminPassword)) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return NextResponse.json(
      { error: '비밀번호가 일치하지 않습니다.' },
      { status: 401 }
    );
  }

  const token = await createSessionToken(adminPassword);

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}
