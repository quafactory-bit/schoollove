param(
  [Parameter(Mandatory=$true)][string]$ContainerName,
  [Parameter(Mandatory=$true)][string]$DatabaseName
)
$ErrorActionPreference='Stop'
function Start-Sql([string]$inputPath,[string]$outputPath){
  Start-Process -FilePath 'docker.exe' -ArgumentList @(
    'exec','-i',$ContainerName,'psql','-U','postgres','-d',$DatabaseName,'-v','ON_ERROR_STOP=1','-q'
  ) -RedirectStandardInput $inputPath -RedirectStandardOutput $outputPath -RedirectStandardError ($outputPath+'.err') -WindowStyle Hidden -PassThru
}
function Test-SqlSucceeded([string]$errorPath){
  (Test-Path -LiteralPath $errorPath) -and ((Get-Item -LiteralPath $errorPath).Length -eq 0)
}
$temporaryRoot=Join-Path $env:TEMP ('schoollove-onboarding-race-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot|Out-Null
try{
  $claimA=Start-Sql (Resolve-Path 'scripts/controlled-beta-onboarding/claim-race-a.sql').Path (Join-Path $temporaryRoot 'claim-a.out')
  $claimB=Start-Sql (Resolve-Path 'scripts/controlled-beta-onboarding/claim-race-b.sql').Path (Join-Path $temporaryRoot 'claim-b.out')
  $claimA.WaitForExit();$claimB.WaitForExit();$claimA.Refresh();$claimB.Refresh()
  $claimAError=Join-Path $temporaryRoot 'claim-a.out.err'
  $claimBError=Join-Path $temporaryRoot 'claim-b.out.err'
  if((-not (Test-SqlSucceeded $claimAError)) -or (-not (Test-SqlSucceeded $claimBError))){
    Get-Content -LiteralPath (Join-Path $temporaryRoot 'claim-a.out') -ErrorAction SilentlyContinue
    Get-Content -LiteralPath (Join-Path $temporaryRoot 'claim-b.out') -ErrorAction SilentlyContinue
    Get-Content -LiteralPath (Join-Path $temporaryRoot 'claim-a.out.err') -ErrorAction SilentlyContinue
    Get-Content -LiteralPath (Join-Path $temporaryRoot 'claim-b.out.err') -ErrorAction SilentlyContinue
    throw 'Concurrent claim processes failed.'
  }
  $finalizeA=Start-Sql (Resolve-Path 'scripts/controlled-beta-onboarding/finalize-race.sql').Path (Join-Path $temporaryRoot 'finalize-a.out')
  $finalizeB=Start-Sql (Resolve-Path 'scripts/controlled-beta-onboarding/finalize-race.sql').Path (Join-Path $temporaryRoot 'finalize-b.out')
  $finalizeA.WaitForExit();$finalizeB.WaitForExit();$finalizeA.Refresh();$finalizeB.Refresh()
  $finalizeAError=Join-Path $temporaryRoot 'finalize-a.out.err'
  $finalizeBError=Join-Path $temporaryRoot 'finalize-b.out.err'
  if((-not (Test-SqlSucceeded $finalizeAError)) -or (-not (Test-SqlSucceeded $finalizeBError))){
    Get-Content -LiteralPath (Join-Path $temporaryRoot 'finalize-a.out') -ErrorAction SilentlyContinue
    Get-Content -LiteralPath (Join-Path $temporaryRoot 'finalize-b.out') -ErrorAction SilentlyContinue
    Get-Content -LiteralPath (Join-Path $temporaryRoot 'finalize-a.out.err') -ErrorAction SilentlyContinue
    Get-Content -LiteralPath (Join-Path $temporaryRoot 'finalize-b.out.err') -ErrorAction SilentlyContinue
    throw 'Concurrent finalize processes failed.'
  }
}finally{
  if(Test-Path -LiteralPath $temporaryRoot){Remove-Item -LiteralPath $temporaryRoot -Recurse -Force}
}
