import AdminBetaPage,{privateAdminMetadata} from '../_components/AdminBetaPage'
export const dynamic='force-dynamic';export const metadata={...privateAdminMetadata,title:'제한 베타 시작 마법사'}
export default function Page(){return <AdminBetaPage view="setup" title="제한 베타 시작 마법사"/>}
