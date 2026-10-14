// Explicit operator-approved Preview writes only. No Google OAuth or mail delivery.
// Credentials are inherited in memory; never log tokens, session state, or raw errors.
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const ref = 'hukokfyphyrpfouazxhq'
const origin = 'https://preview.schoollove.kr'
const authUrl = `https://${ref}.supabase.co`
const probe = process.argv.includes('--probe')
const management = process.env.SCHOOLLOVE_E2E_MANAGEMENT_TOKEN
const service = process.env.SCHOOLLOVE_E2E_SERVICE_ROLE_KEY
const anon = process.env.SCHOOLLOVE_E2E_ANON_KEY
const bypass = process.env.SCHOOLLOVE_E2E_AUTOMATION_BYPASS
const manifest = process.env.SCHOOLLOVE_E2E_CLEANUP_MANIFEST
const run = randomUUID().replaceAll('-', '')
const email = `sl-attribution-${run}@example.invalid`
const attribution = {source:'threads',medium:'post_body',campaign:'automated_e2e',content:run}
const admin = createClient(authUrl, service, {auth:{persistSession:false,autoRefreshToken:false}})
const client = createClient(authUrl, anon, {auth:{persistSession:false,autoRefreshToken:false}})
let userId, browser, baseline
const safe = (message) => new Error(message)
async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method:'POST',headers:{Authorization:`Bearer ${management}`,'Content-Type':'application/json'},body:JSON.stringify({query}),
  })
  if (!response.ok) throw safe(`MANAGEMENT_SQL_HTTP_${response.status}`)
  return response.json()
}
const where = `source='threads' AND medium='post_body' AND campaign='automated_e2e' AND content='${run}'`
async function totals() {
  const rows=await sql(`SELECT coalesce(sum(count),0)::int AS total, coalesce(sum(count) FILTER (WHERE ${where}),0)::int AS test_total FROM public.signup_attribution`)
  return rows[0]
}
async function session() {
  const link = await admin.auth.admin.generateLink({type:'magiclink',email})
  if (link.error) throw safe(`ADMIN_LINK_FAILED_${link.error.code || link.error.status}`)
  const issued = await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'})
  if (issued.error || !issued.data.session) throw safe(`SESSION_FAILED_${issued.error?.code || issued.error?.status || 'MISSING'}`)
  return issued.data.session
}
async function installSession(context, value) {
  await context.addCookies([
    {name:'sl_user_access',value:value.access_token,url:origin,httpOnly:true,secure:true,sameSite:'Lax'},
    {name:'sl_user_refresh',value:value.refresh_token,url:origin,httpOnly:true,secure:true,sameSite:'Lax'},
  ])
}
;(async()=>{
  assert.ok(management && service && anon && manifest)
  assert.match(run,/^[a-f0-9]{32}$/)
  if (!probe) assert.ok(bypass)
  // Baseline reads contain counts only. Existing accounts are never enumerated.
  baseline=await totals()
  const created=await admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{schoollove_synthetic_test:'signup_attribution_e2e'}})
  if (created.error || !created.data.user) throw safe(`ADMIN_CREATE_FAILED_${created.error?.code || created.error?.status}`)
  userId=created.data.user.id
  fs.writeFileSync(manifest,JSON.stringify({project:ref,userId,run}),{mode:0o600})
  let issued=await session()
  if (probe) { console.log('PREVIEW_AUTH_PROBE_PASS admin_create session_issued no_mail'); return }
  browser=await chromium.launch({channel:'chrome',headless:true})
  const context=await browser.newContext({serviceWorkers:'block'})
  await context.route('**/*',route=>{
    const url=new URL(route.request().url())
    if (url.origin!==origin) return route.abort()
    return route.continue({headers:{...route.request().headers(),'x-vercel-protection-bypass':bypass}})
  })
  const page=await context.newPage()
  const query=new URLSearchParams(Object.entries(attribution).map(([key,value])=>[`utm_${key}`,value]))
  const landing=await page.goto(`${origin}/?${query}`,{waitUntil:'networkidle'})
  assert.equal(landing.status(),200)
  await page.waitForFunction(()=>localStorage.getItem('sl_first_touch'))
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('sl_first_touch')))
  for(const [key,value] of Object.entries(attribution)) assert.equal(first[key],value)
  await installSession(context,issued)
  await page.goto(`${origin}/account`,{waitUntil:'networkidle'})
  // Synthetic adult/consent prerequisites use real owner-checked application APIs.
  async function post(path,body) {
    return page.evaluate(async({path,body})=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status}}, {path,body})
  }
  assert.equal((await post('/api/account/eligibility',{dateOfBirth:'1990-01-01'})).status,200)
  assert.equal((await post('/api/account/consents',{terms:true,privacy_collection:true,adult_confirmation:true,private_by_default:true})).status,200)
  await page.reload({waitUntil:'networkidle'})
  async function closeGuide(){ const close=page.getByRole('button',{name:'이용 안내 닫기'});if(await close.isVisible()) await close.click() }
  await closeGuide()
  // Stable account form labels are checked from the real page, never mock responses.
  const profileForm=page.locator('form').filter({has:page.getByRole('button',{name:'내 프로필 저장',exact:true})})
  await profileForm.locator('input').first().fill('자동검증계정')
  const save=page.waitForResponse(r=>r.url()===`${origin}/api/account/profile`&&r.request().method()==='POST')
  await page.getByRole('button',{name:'내 프로필 저장',exact:true}).click()
  const saved=await save
  assert.equal(saved.status(),200)
  assert.equal((await saved.json()).attribution_recorded,true)
  assert.equal((await totals()).test_total,1)
  await page.waitForFunction(()=>localStorage.getItem('sl_first_touch')===null)
  await page.getByRole('button',{name:'로그아웃',exact:true}).click()
  await page.waitForURL('**/login')
  assert.ok(!(await context.cookies()).some(c=>c.name==='sl_user_access'&&c.value))
  issued=await session()
  await installSession(context,issued)
  await page.goto(`${origin}/account`,{waitUntil:'networkidle'})
  await closeGuide()
  assert.equal((await totals()).test_total,1)
  const editForm=page.locator('form').filter({has:page.getByRole('button',{name:'내 프로필 수정 저장',exact:true})})
  await editForm.locator('input').first().fill('자동검증수정')
  const update=page.waitForResponse(r=>r.url()===`${origin}/api/account/profile`&&r.request().method()==='POST')
  await page.getByRole('button',{name:'내 프로필 수정 저장',exact:true}).click()
  const updated=await update
  assert.equal(updated.status(),200)
  assert.equal((await updated.json()).attribution_recorded,false)
  const final=await totals()
  assert.equal(final.test_total,1)
  assert.equal(final.total,baseline.total+1)
  console.log('PREVIEW_E2E_PASS utm first_profile logout fresh_session edit SQL_test_total=1')
})().catch(error=>{console.error('PREVIEW_E2E_FAILED',String(error.message).replace(/https?:\/\/\S+|eyJ\S+/g,'[redacted]').slice(0,160));process.exitCode=1}).finally(async()=>{
  try {
    if(browser) await browser.close()
    if(userId){
      const found=await admin.auth.admin.getUserById(userId)
      if(found.error || found.data.user?.app_metadata?.schoollove_synthetic_test!=='signup_attribution_e2e') throw safe('CLEANUP_OWNER_MARKER_MISMATCH')
      assert.match(userId,/^[a-f0-9-]{36}$/i)
      // Remove only this synthetic account's three recorded milestone increments.
      await sql(`DO $$ DECLARE metric record; BEGIN
        FOR metric IN SELECT event_key, (recorded_at AT TIME ZONE 'Asia/Seoul')::date AS day
        FROM public.adult_eligibility_records adult CROSS JOIN LATERAL (VALUES
          ('adult_eligibility_completed', adult.adult_verified_at),
          ('required_consents_completed', adult.required_consents_completed_at),
          ('private_profile_created', adult.private_profile_first_created_at)
        ) AS item(event_key,recorded_at)
        WHERE adult.user_id='${userId}'::uuid AND adult.policy_version='phase10b-2026-07-28' AND recorded_at IS NOT NULL
        LOOP
          DELETE FROM public.public_account_daily_funnel WHERE metric_date=metric.day AND event_key=metric.event_key
            AND event_kind='milestone' AND source_channel='onboarding' AND event_count=1;
          IF NOT FOUND THEN
            UPDATE public.public_account_daily_funnel SET event_count=event_count-1
            WHERE metric_date=metric.day AND event_key=metric.event_key AND event_kind='milestone'
              AND source_channel='onboarding' AND event_count>1;
          END IF;
        END LOOP;
      END $$;`)
      fs.writeFileSync(manifest,JSON.stringify({project:ref,userId,run,metricsCleaned:true}),{mode:0o600})
      const removed=await admin.auth.admin.deleteUser(userId)
      if(removed.error) throw safe('CLEANUP_AUTH_FAILED')
      const checked=await admin.from('private_profiles').select('id',{count:'exact',head:true}).eq('owner_user_id',userId)
      if(checked.error || checked.count!==0) throw safe('CLEANUP_PROFILE_REMAINS')
      const eligible=await admin.from('adult_eligibility_records').select('id',{count:'exact',head:true}).eq('user_id',userId)
      const consents=await admin.from('consent_records').select('id',{count:'exact',head:true}).eq('user_id',userId)
      if(eligible.error||consents.error||eligible.count!==0||consents.count!==0) throw safe('CLEANUP_ACCOUNT_ROWS_REMAIN')
    }
    await sql(`DELETE FROM public.signup_attribution WHERE ${where}`)
    const after=await totals()
    assert.equal(after.test_total,0)
    assert.equal(after.total,baseline.total)
    if(manifest&&fs.existsSync(manifest)) fs.unlinkSync(manifest)
    console.log('PREVIEW_CLEANUP_PASS owned_auth profile aggregate baseline_restored')
  } catch { console.error('PREVIEW_CLEANUP_FAILED owned_manifest_retained');process.exitCode=1 }
})
