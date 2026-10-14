import AdminBetaPage,{privateAdminMetadata} from '../_components/AdminBetaPage'
export const dynamic='force-dynamic';export const metadata={...privateAdminMetadata,title:'초대 프로그램 시작 마법사'}
export default function Page(){return <AdminBetaPage view="setup" title="초대 프로그램 시작 마법사"/>}
