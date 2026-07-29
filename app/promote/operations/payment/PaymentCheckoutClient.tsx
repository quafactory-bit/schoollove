'use client'

import Script from 'next/script'
import { useEffect, useMemo, useState } from 'react'

type PortOneWindow = Window & { PortOne?: { requestPayment(input: Record<string,unknown>): Promise<{ code?: string; message?: string } | undefined> } }
type Payment = { id:string; order_id:string; provider:string; provider_payment_id:string; status:string; order_number:string; amount_krw:number; currency:'KRW' }

export default function PaymentCheckoutClient() {
  const paymentId = useMemo(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('paymentId') ?? '', [])
  const callbackState = useMemo(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('state') ?? '', [])
  const [payment,setPayment]=useState<Payment|null>(null)
  const [message,setMessage]=useState('결제 정보를 확인하고 있습니다.')
  useEffect(() => { if(!paymentId) return; void fetch(`/api/payments?paymentId=${encodeURIComponent(paymentId)}`,{cache:'no-store'}).then(async r=>{ if(!r.ok) throw new Error(); const body=await r.json(); setPayment(body.payments?.[0]??null); setMessage('결제 전 주문번호와 금액을 확인하세요.') }).catch(()=>setMessage('결제 정보를 불러올 수 없습니다.')) },[paymentId])
  async function start() {
    if(!payment || payment.provider!=='portone_sandbox' || !callbackState) return setMessage('Sandbox 결제 설정이 필요합니다.')
    const PortOne=(window as PortOneWindow).PortOne
    if(!PortOne) return setMessage('결제 모듈을 불러오지 못했습니다.')
    const result=await PortOne.requestPayment({
      storeId: process.env.NEXT_PUBLIC_PORTONE_SANDBOX_STORE_ID, channelKey: process.env.NEXT_PUBLIC_PORTONE_SANDBOX_CHANNEL_KEY,
      paymentId: payment.provider_payment_id, orderName:`스쿨러브아이 광고 ${payment.order_number}`, totalAmount:payment.amount_krw,
      currency:'KRW',payMethod:'CARD',redirectUrl:`${window.location.origin}/promote/operations/payment?paymentId=${encodeURIComponent(payment.provider_payment_id)}&state=${encodeURIComponent(callbackState)}`,
      noticeUrls:[`${window.location.origin}/api/payments/webhooks/portone`],
    })
    if(result?.code) return setMessage('결제가 완료되지 않았습니다.')
    const verified=await fetch('/api/payments/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payment_id:payment.provider_payment_id,callback_state:callbackState})})
    setMessage(verified.ok?'서버에서 결제를 확인했습니다.':'서버 결제 확인이 필요합니다.')
  }
  return <main className="mx-auto max-w-xl px-5 py-12"><Script src="https://cdn.portone.io/v2/browser-sdk.js" strategy="afterInteractive" /><h1 className="text-3xl font-bold">광고 결제</h1><p className="mt-3 text-sm text-gray-600">Sandbox 전용입니다. 실제 카드 결제와 Production webhook은 활성화되지 않았습니다.</p>{payment?<section className="mt-8 border p-5"><p className="font-bold">{payment.order_number}</p><p className="mt-2 text-2xl font-bold">{payment.amount_krw.toLocaleString('ko-KR')}원</p><p className="mt-2 text-sm text-gray-600">서버 저장 금액과 PG 조회 금액이 일치할 때만 결제 완료됩니다.</p><button onClick={()=>void start()} className="mt-5 min-h-12 w-full bg-gray-950 px-4 font-semibold text-white">Sandbox 결제 열기</button></section>:null}<p role="status" className="mt-5 border p-3 text-sm">{message}</p></main>
}
