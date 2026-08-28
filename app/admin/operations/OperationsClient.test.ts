import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8')

describe('controlled beta invitation operations UI',()=>{
  it('derives invite eligibility from the shared controlled-beta contract policy',()=>{
    const beta=source('lib/beta.ts')
    expect(beta).toContain('assessControlledBetaInvitationEligibility')
    expect(beta).toContain('snapshotFeatures')
    expect(beta).not.toContain("enabled[0]==='account_registration'")
  })

  it('makes every eligible program selectable and keeps ineligible programs out of the invitation action',()=>{
    const client=source('app/admin/operations/OperationsClient.tsx')
    expect(client).toContain('state.programs.filter((program) => program.invite_eligible)')
    expect(client).toContain('invitePrograms.map((program)')
    expect(client).toContain("action:'issue_invite'")
    expect(client).toContain("fetch('/api/admin/operations',{method:'PATCH'")
  })
})
