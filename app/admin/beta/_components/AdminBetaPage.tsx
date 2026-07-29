import type { Metadata } from 'next'
import ControlledBetaConsole from './ControlledBetaConsole'

export const privateAdminMetadata:Metadata={robots:{index:false,follow:false,nocache:true,noarchive:true}}
export default function AdminBetaPage({view,title}:{view:'setup'|'users'|'schools'|'advertisers'|'tasks'|'readiness'|'report';title:string}){return <main className="mx-auto min-h-screen max-w-7xl bg-gray-50 px-4 py-8 sm:px-6"><h1 className="text-3xl font-black">{title}</h1><p className="mb-7 mt-2 text-gray-600">개인정보 최소화·성인 제한·fail-closed 원칙으로 운영합니다.</p><ControlledBetaConsole view={view}/></main>}
