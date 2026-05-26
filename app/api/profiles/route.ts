import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { supabaseServer } from '@/lib/supabase';
import { z } from 'zod';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '60 s'),
  analytics: true,
  prefix: 'schoollove:submit',
});

const Schema = z.object({
  school_id: z.string().uuid(),
  graduation_year: z.number().int().min(1990).max(2035),
  grade: z.number().int().min(1).max(6).nullable().optional(),
  class_number: z.number().int().min(1).max(30).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  student_year: z.number().int().nullable().optional(),
  nickname: z.string().min(1).max(50),
  instagram_id: z.string().max(30).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  const { success, limit, reset, remaining } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: '잠시 후 다시 시도해주세요. (요청 한도 초과)' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const profile = parsed.data;
  const nickname = profile.nickname.trim().replace(/\s+/g, ' ');

  const { data, error } = await supabaseServer
    .from('profiles')
    .insert({ ...profile, nickname, report_count: 0, is_hidden: false })
    .select()
    .single();

  if (error) {
    console.error('POST /api/profiles error:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 등록된 정보입니다.' }, { status: 409 });
    }
    return NextResponse.json({ error: '등록 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}