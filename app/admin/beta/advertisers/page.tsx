import AdminBetaPage,{privateAdminMetadata} from '../_components/AdminBetaPage'
export const dynamic='force-dynamic';export const metadata={...privateAdminMetadata,title:'첫 광고주 운영'}
export default function Page(){return <AdminBetaPage view="advertisers" title="첫 광고주 운영 보드"/>}
