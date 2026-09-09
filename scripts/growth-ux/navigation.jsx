export const useRouter=()=>({push(url){history.pushState(null,'',url);window.dispatchEvent(new Event('ux-route'))},refresh(){window.dispatchEvent(new Event('ux-route'))},replace(url){history.replaceState(null,'',url);window.dispatchEvent(new Event('ux-route'))}})
export const usePathname=()=>location.pathname
export const useSearchParams=()=>new URLSearchParams(location.search)
export const notFound=()=>{throw Error('fixture school not found')}
export const redirect=url=>useRouter().push(url)
