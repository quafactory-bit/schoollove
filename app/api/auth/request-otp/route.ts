import { NextResponse } from 'next/server'

/** Supabase email OTP is intentionally not a deployed user-login surface. */
export async function POST() { return new NextResponse(null, { status: 404 }) }
