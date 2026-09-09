export const school={id:'11111111-1111-4111-8111-111111111111',school_name:'예시푸른고등학교',slug:'example-school',school_type:'high',sido:'예시시',sigungu:'예시구'}
export const launch={state:'open',privateProfileEnabled:true,schoolMembershipEnabled:true,registrationEnabled:true,emergencyStopped:false}
export const fixture=window.__ux={mode:new URLSearchParams(location.search).get('mode')||'guest',requests:[],school,launch}
export const profile={id:'22222222-2222-4222-8222-222222222222',owner_user_id:'33333333-3333-4333-8333-333333333333',display_name:'로컬 예시 사용자',instagram_handle:null,introduction:null,profile_visibility:'private',status:'active'}
fixture.state={adultEligible:fixture.mode!=='new',consentsComplete:fixture.mode!=='new',consentTypes:[],profile:fixture.mode==='new'?null:profile,memberships:fixture.mode==='member'?[{id:'44444444-4444-4444-8444-444444444444',school_id:school.id,school,graduation_year:2018,class_number:null,class_history:[]}]:[],deletionStatus:null,deletionRequested:false}
const chain={select(){return this},eq(){return this},limit(){return this},then(resolve){resolve({data:fixture.state.memberships})}}
export const getAuthenticatedServerContext=async()=>fixture.mode==='guest'?null:{user:{id:profile.owner_user_id},client:{from:()=>chain}}
export const getPublicAccountLaunchState=async()=>launch
export const recordPublicAccountActivity=async()=>{}
export const getSchoolGrowth=async(id)=>({status:'ok',schools:id?[{schoolId:school.id,schoolName:school.school_name,slug:school.slug,level:1,progress:0,rank:null,lastLevelUp:null}]:[]})
export const getOwnSchoolGrowth=async()=>({schoolId:school.id,schoolName:school.school_name,slug:school.slug,level:1,progress:0,ownContributionXp:0})
export const getSchoolBySlug=async slug=>slug===school.slug?school:null
export const getSchoolPageMetadata=()=>({})
export const hasBetaFeatureAccess=async()=>false
export const getPublicPromotion=async()=>null
export const loadUserLoginBrokerConfig=()=>({})
export const searchSchools=async q=>{const r=await fetch('/mock/full?q='+encodeURIComponent(q));if(!r.ok)throw Error('search unavailable');return r.json()}
export const searchSchoolsForAutocomplete=async q=>{const r=await fetch('/mock/autocomplete?q='+encodeURIComponent(q));if(!r.ok)throw Error('autocomplete unavailable');return r.json()}
export const buildSchoolPath = slug => `/school/${encodeURIComponent(slug)}`
export const buildYearPath = (slug,year) => `${buildSchoolPath(slug)}/${year}`
export const buildClassPath = (slug,year,number) => `${buildYearPath(slug,year)}/${number}`
