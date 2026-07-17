import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { supabaseServer } from '@/lib/supabase';
import { revalidateHomeFeed } from '@/lib/api/homeFeedCache';
import { z } from 'zod';

const redis = Redis.fromEnv();

// IP당 60초 5개 (profiles보다 빡빡하게 — 흔적은 한 줄이라 남발 쉬움)
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  analytics: true,
  prefix: 'schoollove:trace',
});

const Schema = z.object({
  school_id: z.string().uuid(),
  graduation_year: z.number().int().min(1990).max(2035).nullable().optional(),
  grade: z.number().int().min(1).max(6).nullable().optional(),
  class_number: z.number().int().min(1).max(30).nullable().optional(),
  message: z.string().min(1).max(40),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return NextResponse.json(
      { error: '잠시 후 다시 남겨주세요.' },
      { status: 429 }
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

  const trace = parsed.data;
  const message = trace.message.trim().replace(/\s+/g, ' ');

  // 같은 IP가 같은 학교에 같은 문구 연속 등록 차단 (10분).
  // "내가 1등!" 한 명이 도배하는 것 방지. 다른 사람이 같은 문구 쓰는 건 OK.
  const dedupeKey = `schoollove:trace:dedupe:${ip}:${trace.school_id}:${message}`;
  try {
    const exists = await redis.get(dedupeKey);
    if (exists) {
      return NextResponse.json(
        { error: '방금 같은 글을 남겼어요.' },
        { status: 409 }
      );
    }
    await redis.set(dedupeKey, '1', { ex: 600 });
  } catch (e) {
    console.error('trace dedupe error:', e);
    // dedupe 실패해도 등록은 진행 (Rate Limit이 1차 방어선)
  }

  const { data, error } = await supabaseServer
    .from('traces')
    .insert({ ...trace, message, report_count: 0, is_hidden: false })
    .select()
    .single();

  if (error) {
    console.error('POST /api/traces error:', error);
    return NextResponse.json({ error: '등록 중 오류가 발생했습니다.' }, { status: 500 });
  }

  // Phase 4B(docs/decisions/2026-07-17-home-feed-freshness.md) — 등록이 이미 성공했으므로
  // 최종 성공 응답을 반환하기 직전에만 홈을 재검증한다.
  revalidateHomeFeed();

  return NextResponse.json({ data }, { status: 201 });
}
