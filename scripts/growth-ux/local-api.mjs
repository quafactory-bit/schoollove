// Synthetic data for interactive LOCAL previews; never loaded by the production app.
export function localApi(req,res,next){
 const url=new URL(req.url,'http://127.0.0.1:3117')
 if(!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/mock/'))return next()
 const school={id:'11111111-1111-4111-8111-111111111111',school_name:'예시푸른고등학교',slug:'example-school',school_type:'high',sido:'예시시',sigungu:'예시구'}
 let body={}
 if(url.pathname.startsWith('/mock/'))body=[school]
 else if(url.pathname==='/api/schools/selection')body={school:url.searchParams.get('slug')===school.slug?school:null}
 else if(url.pathname==='/api/account/growth')body={contribution:{xp:0,contributed:false},growth:{schoolId:school.id,schoolName:school.school_name,slug:school.slug,level:1,progress:0,ownContributionXp:0}}
 else if(url.pathname==='/api/onboarding')body={state:{stage:'school_required',adultReady:true,consentsReady:true,profileReady:true,schoolReady:false}}
 else if(url.pathname.includes('notifications'))body={items:[],unreadCount:0,notifications:[]}
 else if(url.pathname==='/api/connections')body={connections:[]}
 else if(url.pathname==='/api/connections/requests')body={received:[],sent:[]}
 else if(url.pathname==='/api/connections/fixture')body={connection:{id:'fixture',status:'active',displayName:'예시 친구'},capabilities:{messaging:false,instagramPermission:true}}
 else if(url.pathname==='/api/connections/fixture/instagram')body={instagramHandle:'synthetic_friend',myInstagramConfigured:true,myInstagramVisible:false}
 else if(url.pathname==='/api/growth/referral')body={token:'a'.repeat(64),expiresIn:604800}
 else {res.statusCode=404;body={error:'LOCAL_PREVIEW_ONLY'}}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))
}
