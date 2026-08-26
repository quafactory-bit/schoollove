param([Parameter(Mandatory=$true)][string]$Project)
$ErrorActionPreference='Stop'
& powershell -ExecutionPolicy Bypass -File scripts/phase10n/run-auth-playwright.ps1 `
  -Project $Project `
  -Spec e2e/phase10v-people.spec.ts `
  -ExtraMigration supabase/migrations/20260826061123_people_discovery_safety_hardening.sql
if($LASTEXITCODE-ne 0){throw "PHASE 10V Playwright failed: $LASTEXITCODE"}
Write-Output "PHASE10V_GOOGLE_PEOPLE_PLAYWRIGHT_PROJECT_OK $Project"
