'use client'
import { useEffect,useRef } from 'react'
import { usePathname } from 'next/navigation'
import { sendFunnelEvent,sendLandingOnce } from '@/lib/part2FunnelClient'
export default function FunnelTracker() {
  const pathname=usePathname()
  const previous=useRef<string|null>(null)
  useEffect(()=>{
    if (previous.current===pathname) return
    previous.current=pathname
    if (pathname==='/'||pathname==='/search'||pathname==='/login'||pathname?.startsWith('/school/')) sendLandingOnce()
    if (pathname==='/') sendFunnelEvent('home_viewed')
  },[pathname])
  return null
}
export function SchoolFunnelView({schoolId}:{schoolId:string}) {
  const previous=useRef('')
  useEffect(()=>{if(previous.current!==schoolId){previous.current=schoolId;sendFunnelEvent('school_detail_viewed',schoolId)}},[schoolId])
  return null
}
