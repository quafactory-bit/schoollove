$ErrorActionPreference='Stop'
$env:PHASE10O_G_ACCEPTANCE='1'
& powershell -ExecutionPolicy Bypass -File scripts/phase10o-f/run-isolated-db.ps1
exit $LASTEXITCODE
