import { readFileSync } from 'node:fs';import { join } from 'node:path';import { describe,expect,it } from 'vitest'
const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8')

describe('PHASE 10I route and privacy boundaries',()=>{
  it('protects every admin API internally and disables caching',()=>{for(const path of ['app/api/admin/beta/route.ts','app/api/admin/beta/report/route.ts','app/api/admin/beta/synthetic/route.ts']){const value=source(path);expect(value).toContain('requireAdminSession');expect(value).toContain('no-store')}})
  it('returns 404 before auth when synthetic mode is not explicitly allowed',()=>{const route=source('app/api/admin/beta/synthetic/route.ts');expect(route.indexOf('if(!isSyntheticModeAllowed())')).toBeLessThan(route.indexOf("if(!(await requireAdminSession(request)))"));expect(route).toContain("status:404")})
  it('keeps feedback owner-scoped and identifier filtered',()=>{const route=source('app/api/beta/feedback/route.ts');expect(route).toContain(".eq('owner_user_id',auth.user.id)");expect(route).toContain('BetaFeedbackSchema');expect(source('lib/policy/betaOperations.ts')).toContain('PERSONAL_OR_EXTERNAL_IDENTIFIER_NOT_ALLOWED')})
  it('keeps all operator pages private',()=>{for(const page of ['setup','users','schools','advertisers','tasks','readiness','report'])expect(source(`app/admin/beta/${page}/page.tsx`)).toContain('privateAdminMetadata')})
  it('never exposes raw identity fields from the admin aggregation layer',()=>{const helper=source('lib/betaOperations.ts');expect(helper).not.toMatch(/\.select\([^)]*(email|instagram|display_name|search_query|message|ip_address)/i);expect(helper).toContain('safeRef')})
  it('neutralizes CSV formulas through the established csvSafe helper',()=>{const helper=source('lib/betaOperations.ts');expect(helper).toContain("import { csvSafe }");expect(helper).toContain('row.map(csvSafe)')})
})
