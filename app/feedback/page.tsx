import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import FeedbackClient from './FeedbackClient'

export const dynamic='force-dynamic'
export const metadata:Metadata={title:'제한 베타 피드백',robots:{index:false,follow:false,nocache:true,noarchive:true}}

export default async function FeedbackPage(){
  const auth=await getAuthenticatedServerContext();if(!auth)redirect('/login?next=/account')
  const {data}=await auth.client.from('beta_members').select('program_id').eq('user_id',auth.user.id).eq('status','active').limit(10)
  const programs=(data??[]).map((item:any,index:number)=>({id:item.program_id,name:`제한 베타 ${index+1}`}))
  return <main className="mx-auto min-h-screen max-w-2xl bg-gray-50 px-4 py-8"><h1 className="text-3xl font-black">제한 베타 피드백</h1><p className="mb-6 mt-2 text-gray-600">내가 직접 작성한 최소 정보만 운영팀에 전달합니다.</p>{programs.length?<FeedbackClient programs={programs}/>:<p className="rounded-xl border bg-white p-5">활성 제한 베타 권한이 없습니다.</p>}</main>
}
