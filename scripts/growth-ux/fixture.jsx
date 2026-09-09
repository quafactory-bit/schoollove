import React from 'react'
import {createRoot} from 'react-dom/client'
import Home from '@/app/page'
import School from '@/app/school/[slug]/page'
import Login from '@/app/login/page'
import Account from '@/app/account/AccountClient'
import Onboarding from '@/app/onboarding/OnboardingClient'
import Connections from '@/app/connections/ConnectionsClient'
import Results from '@/components/SchoolSearchResults'
import Footer from '@/components/Footer'
import TabBar from '@/components/TabBar'
import DesktopNav from '@/components/DesktopNav'
import '@/app/globals.css'
import {fixture,school,launch} from './data'
const root=createRoot(document.getElementById('root'))
async function resolve(element){
  if(!React.isValidElement(element))return element
  if(typeof element.type==='function'&&element.type.constructor.name==='AsyncFunction')return resolve(await element.type(element.props))
  const children=element.props.children
  if(children===undefined)return element
  return React.cloneElement(element,{},...(await Promise.all(React.Children.toArray(children).map(resolve))))
}
async function render(){
 if(location.pathname==='/account'&&fixture.mode==='guest')history.replaceState(null,'','/login')
 const path=location.pathname
 const el=path==='/search'?<Results/>:path.startsWith('/school/')?await School({params:Promise.resolve({slug:school.slug})}):path==='/login'?<Login/>:path==='/onboarding'?<Onboarding/>:path==='/connections'?<Connections peopleSearchEnabled={false}/>:path==='/account'?<Account selectionOwner="33333333-3333-4333-8333-333333333333" state={fixture.state} launch={launch} controlledBetaAccess={false} peopleSearchBetaAccess={false} instagramBetaAccess={false} betaOnboardingState="none" currentYear={2026}/>:await Home()
 root.render(<><DesktopNav/><div key={path} style={{paddingBottom:64}}>{await resolve(el)}<Footer/></div><TabBar/></>)
}
window.addEventListener('ux-route',()=>void render()); await render()
