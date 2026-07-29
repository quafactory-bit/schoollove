import AdminBetaPage,{privateAdminMetadata} from '../_components/AdminBetaPage'
export const dynamic='force-dynamic';export const metadata={...privateAdminMetadata,title:'피드백과 운영 작업'}
export default function Page(){return <AdminBetaPage view="tasks" title="피드백·운영 작업 큐"/>}
