import type { NextRequest } from 'next/server'
import { handlePublicSummonsAction } from '@/lib/part2SummonsPublicAction'

// Report a summons card. The third report hides it (DB rule); the admin can also take it down.
export async function POST(request: NextRequest) {
  return handlePublicSummonsAction(request, 'report')
}
