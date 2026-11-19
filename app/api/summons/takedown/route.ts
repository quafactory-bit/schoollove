import type { NextRequest } from 'next/server'
import { handlePublicSummonsAction } from '@/lib/part2SummonsPublicAction'

// "내 이름이 올라갔어요 · 내려 주세요" → hidden immediately, recorded for the admin.
export async function POST(request: NextRequest) {
  return handlePublicSummonsAction(request, 'takedown')
}
