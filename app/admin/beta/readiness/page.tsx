import AdminBetaPage,{privateAdminMetadata} from '../_components/AdminBetaPage'
export const dynamic='force-dynamic';export const metadata={...privateAdminMetadata,title:'중단과 준비도'}
export default function Page(){return <AdminBetaPage view="readiness" title="중단 조건·베타 준비도"/>}
