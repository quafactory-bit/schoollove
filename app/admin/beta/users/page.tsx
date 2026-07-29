import AdminBetaPage,{privateAdminMetadata} from '../_components/AdminBetaPage'
export const dynamic='force-dynamic';export const metadata={...privateAdminMetadata,title:'베타 사용자 운영'}
export default function Page(){return <AdminBetaPage view="users" title="실제 베타 사용자 운영"/>}
