$ErrorActionPreference='Stop'
$env:PHASE10O_G_ACCEPTANCE='1'
$env:PHASE10O_H_ACCEPTANCE='1'
$env:PHASE10O_I_ACCEPTANCE='1'
& powershell -ExecutionPolicy Bypass -File scripts/phase10o-f/run-isolated-db.ps1
exit $LASTEXITCODE
