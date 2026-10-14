import AdminBetaPage,{privateAdminMetadata} from '../_components/AdminBetaPage'
export const dynamic='force-dynamic';export const metadata={...privateAdminMetadata,title:'초대 프로그램 일일 보고'}
export default function Page(){return <AdminBetaPage view="report" title="초대 프로그램 일일 보고"/>}
