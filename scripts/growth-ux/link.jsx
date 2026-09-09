import {useRouter} from './navigation'
export default function Link({href,onClick,prefetch:_,...props}) { return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&!e.ctrlKey&&!e.metaKey){e.preventDefault();useRouter().push(href)}}}/> }
