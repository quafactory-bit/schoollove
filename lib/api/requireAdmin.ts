import type { NextRequest } from 'next/server'
import { ADMIN_COOKIE_NAME, verifySessionToken } from '@/lib/admin-auth'

export async function requireAdminSession(request: NextRequest): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  return Boolean(password && token && await verifySessionToken(token, password))
}
