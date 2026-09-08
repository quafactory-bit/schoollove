import React from 'react'
import { createRoot } from 'react-dom/client'
import AccountClient from '@/app/account/AccountClient'
import ConnectionsClient from '@/app/connections/ConnectionsClient'

const params=new URLSearchParams(location.search)
const scenario=params.get('scenario')??'new'
// Loopback-only fixture; it never reads cookies or calls remote services.
window.fetch=async(input)=>{
  const url=new URL(String(input),location.origin)
  if(url.origin!==location.origin)throw new Error('REMOTE_FORBIDDEN')
  if(scenario==='error')return Response.json({error:'SAFE_FIXTURE_ERROR'},{status:503})
  return Response.json({received:[],sent:[],connections:[],notifications:[]})
}
createRoot(document.getElementById('root')!).render(location.pathname==='/connections'
  ? <ConnectionsClient peopleSearchEnabled={params.get('search')==='1'}/>
  : <AccountClient state={{adultEligible:false,consentsComplete:false,consentTypes:[],profile:null,memberships:[],deletionRequested:false,deletionStatus:null}}
      launch={{state:'open',registrationEnabled:true,privateProfileEnabled:true,schoolMembershipEnabled:true,emergencyStopped:false}}
      controlledBetaAccess={false} peopleSearchBetaAccess={false} instagramBetaAccess={false} betaOnboardingState="none" currentYear={2026}/>)
