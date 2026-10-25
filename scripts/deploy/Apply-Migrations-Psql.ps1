<#
.SYNOPSIS
  Applies 20261024_discovery_review_queue.sql then 20261025_reject_open_candidate.sql
  to the Supabase database as EXACT files with psql (Docker's PostgreSQL 17),
  each behind a read-only gate. DRY RUN unless -Apply is given.

.DESCRIPTION
  Why psql and not the Management API: the API's handling of SQL errors inside
  an explicit BEGIN ... COMMIT is undocumented. psql's is documented:
  ON_ERROR_STOP=1 stops at the first error and exits 3, and a statement that
  fails before COMMIT aborts the transaction. A lost connection, a cancel or
  an interrupted run does NOT prove a rollback, because COMMIT may already have
  run. So the outcome is never inferred from an exit code: it is established
  read-only by supabase/POST-MIGRATION-GATE-READONLY.sql (see
  scripts/deploy/apply-sequence.sh for the sequence and its exit codes), and
  nothing is retried. Each migration sets its own transaction-local
  lock_timeout (5 s) and statement_timeout (60 s).

  -Inspect runs only the three gates, read-only, and reports which state the
  database is in (exit 40/41/42; 49 = none). Use it after any interrupted or
  uncertain run, before deciding anything else.

  Exact bytes: the three files' SHA-256 values are recorded below. They are
  checked in the repo, copied into a fresh run folder outside the repo and
  OneDrive, checked again there, mounted read-only, and checked a third time
  inside the container just before psql reads them.

  Secrets: as Backup-Public.ps1. The password is read with Read-Host
  -AsSecureString (not echoed) and reaches Docker only by NAME
  (`docker run -e PGPASSWORD`), never on a command line; it is removed and its
  plain-text copy zeroed in a `finally` block. While the container runs,
  `docker inspect` on this machine can show it; the container is --rm.

  NOT done: migration history (supabase_migrations.schema_migrations) is not
  written. Recording it is a separate, explicit decision.

.EXAMPLE
  # Dry run (no Docker, no network, no password):
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\Apply-Migrations-Psql.ps1 `
    -PoolerHost aws-0-eu-central-1.pooler.supabase.com -DbUser postgres.xutjahmbyrvifcltpxxu `
    -RecordDir C:\Users\safad\OrthoBackups `
    -ExpectGuidelines '231:460c6075209bfb1ed989032dac7e8950' -ExpectChangelog '0:d41d8cd98f00b204e9800998ecf8427e' `
    -ExpectStaged 0 -ExpectEditors 1
  # Then the same with:  -Apply -ConfirmProject xutjahmbyrvifcltpxxu
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $PoolerHost,
  [Parameter(Mandatory = $true)] [string] $DbUser,
  [Parameter(Mandatory = $true)] [string] $RecordDir,
  # Expected unchanged values, from the step-0 preflight (P10, P5, P9) in the deployment record.
  [Parameter(Mandatory = $true)] [string] $ExpectGuidelines,
  [Parameter(Mandatory = $true)] [string] $ExpectChangelog,
  [Parameter(Mandatory = $true)] [int] $ExpectStaged,
  [Parameter(Mandatory = $true)] [int] $ExpectEditors,
  [switch] $Apply,
  # Read-only: run gates 0, 1 and 2 and report the state. Sends no migration.
  [switch] $Inspect,
  [string] $ConfirmProject = '',
  [int] $Port = 5432,
  [string] $Database = 'postgres',
  [ValidateSet('require', 'disable')] [string] $SslMode = 'require',
  [string] $Image = 'public.ecr.aws/supabase/postgres:17.11.0.004',
  # Only for a LOCAL rehearsal against the disposable stack; refused for a remote host.
  [System.Management.Automation.PSCredential] $Credential,
  # Only for the offline tests (a copy with a changed byte must be refused). Defaults to this repo.
  [string] $SourceRoot = ''
)
$ErrorActionPreference = 'Stop'

$PROJECT_REF = 'xutjahmbyrvifcltpxxu'
$FILES = [ordered]@{
  'supabase/migrations/20261024_discovery_review_queue.sql' = '61ca5eab301a037a024bab5ae85084dcb46c9b00e38eefa00f2b84c4e20f3be1'
  'supabase/migrations/20261025_reject_open_candidate.sql'  = 'a21ae5561ce588da64daf2b7df9eea52021185aec4302419024dabd23030e030'
  'supabase/POST-MIGRATION-GATE-READONLY.sql'               = 'b56ee2ab76b18f2d83c638b0bcba9cdc232865616dbd9899420dae62baafb2f6'
}

function Fail([string] $msg) { Write-Host "[migrate] REFUSED: $msg" -ForegroundColor Red; exit 2 }
function Sha([string] $p) { (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower() }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path.TrimEnd('\')
$src = if ($SourceRoot) { (Resolve-Path $SourceRoot).Path.TrimEnd('\') } else { $repoRoot }

# -- Target: the intended project only, or the local rehearsal --------------
$isLocalHost = $PoolerHost -match '^(localhost|127\.|host\.docker\.internal$)'
if ($isLocalHost) {
  if (-not $Credential) { Fail 'a local host is for the rehearsal only; pass -Credential for it.' }
} else {
  if ($Credential) { Fail '-Credential is for the local rehearsal only; for a real database the password is prompted for (not echoed).' }
  if ($SslMode -ne 'require') { Fail 'a remote host needs -SslMode require.' }
  if ($PoolerHost -notmatch '^aws-\d+-eu-central-1\.pooler\.supabase\.com$') { Fail "host $PoolerHost is not the eu-central-1 session pooler." }
  if ($Port -ne 5432) { Fail 'use the SESSION pooler (port 5432); the transaction pooler (6543) cannot hold a migration session.' }
  if ($DbUser -ne "postgres.$PROJECT_REF") { Fail "user $DbUser is not postgres.$PROJECT_REF." }
}
if ($ExpectGuidelines -notmatch '^\d+:[0-9a-f]{32}$' -or $ExpectChangelog -notmatch '^\d+:[0-9a-f]{32}$') {
  Fail 'expected values must look like <count>:<md5>, as recorded from the preflight.'
}

# -- Exact bytes -------------------------------------------------------------
$plan = @()
foreach ($rel in $FILES.Keys) {
  $p = Join-Path $src $rel
  if (-not (Test-Path -LiteralPath $p)) { Fail "$rel not found under $src" }
  $got = Sha $p
  if ($got -ne $FILES[$rel]) { Fail "$rel has sha256 $got; the recorded value is $($FILES[$rel])." }
  $plan += [ordered]@{ file = $rel; bytes = (Get-Item -LiteralPath $p).Length; sha256 = $got }
}

Write-Host "[migrate] Target   : $DbUser@$($PoolerHost):$Port/$Database (sslmode=$SslMode)$(if (-not $isLocalHost) { "  project $PROJECT_REF" })"
Write-Host '[migrate] Sequence : gate 0 (pre-state) -> 20261024 -> gate 1 -> 20261025 -> gate 2; stop at the first failure; no retry'
Write-Host "[migrate] Expected : guidelines $ExpectGuidelines; changelog $ExpectChangelog; staged rows $ExpectStaged; editors $ExpectEditors"
foreach ($f in $plan) { Write-Host ("[migrate]   {0}  {1,7} bytes  sha256 {2}" -f $f.file, $f.bytes, $f.sha256) }
Write-Host '[migrate] Migration history: NOT written by this route.'

if ($Apply -and $Inspect) { Fail 'use -Apply or -Inspect, not both.' }
if (-not $Apply -and -not $Inspect) {
  Write-Host '[migrate] DRY RUN: nothing was sent. No Docker container, no network, no password.' -ForegroundColor Cyan
  exit 0
}
if (-not $isLocalHost -and $ConfirmProject -ne $PROJECT_REF) { Fail "-Apply and -Inspect need -ConfirmProject $PROJECT_REF." }
$mode = if ($Inspect) { 'inspect' } else { 'apply' }

# -- Record folder: outside the repo and OneDrive ---------------------------
$dest = [System.IO.Path]::GetFullPath($RecordDir).TrimEnd('\')
foreach ($f in @($repoRoot, $env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial) | Where-Object { $_ }) {
  $ff = [System.IO.Path]::GetFullPath($f).TrimEnd('\')
  if ($dest -eq $ff -or $dest.StartsWith($ff + '\', [System.StringComparison]::OrdinalIgnoreCase)) { Fail "record folder $dest is inside $ff." }
}
if ($dest -match '\\OneDrive( - [^\\]+)?(\\|$)') { Fail "record folder $dest looks like a OneDrive folder." }
if (-not (Test-Path -LiteralPath $dest)) { Fail "record folder $dest does not exist." }

& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker is not running.' }
& docker image inspect $Image *> $null
if ($LASTEXITCODE -ne 0) { Fail "image $Image is not present locally. Nothing was installed." }

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$run = Join-Path $dest "$(if ($Inspect) { 'inspect' } else { 'migrate' })-$stamp"
if (Test-Path $run) { Fail "$run already exists" }
$sqlDir = Join-Path $run 'sql'
$logDir = Join-Path $run 'log'
New-Item -ItemType Directory -Path $sqlDir, $logDir -Force | Out-Null
& icacls.exe $run /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" *> $null
if ($LASTEXITCODE -ne 0) { Fail "could not restrict permissions on $run" }

# Copy the verified bytes, check the copies, make them read-only.
foreach ($rel in $FILES.Keys) {
  $copy = Join-Path $sqlDir (Split-Path $rel -Leaf)
  Copy-Item -LiteralPath (Join-Path $src $rel) -Destination $copy
  if ((Sha $copy) -ne $FILES[$rel]) { Fail "the copy of $rel in $sqlDir does not match; nothing was sent." }
  (Get-Item -LiteralPath $copy).IsReadOnly = $true
}

# -- The password: never echoed, never on a command line --------------------
$secure = if ($Credential) { $Credential.Password } else { Read-Host -AsSecureString -Prompt "Database password for $DbUser (not shown)" }
if ($secure.Length -eq 0) { Fail 'empty password; nothing was sent.' }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$keys = @($FILES.Keys)
$exit = 1
try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  & docker run --rm --name "ortho-migrate-$stamp" `
      --entrypoint bash `
      -e PGHOST=$PoolerHost -e PGPORT=$Port -e PGUSER=$DbUser -e PGDATABASE=$Database `
      -e PGSSLMODE=$SslMode -e PGAPPNAME=ortho-migrate -e PGPASSWORD -e "MODE=$mode" `
      -e "SHA_M1=$($FILES[$keys[0]])" -e "SHA_M2=$($FILES[$keys[1]])" -e "SHA_GATE=$($FILES[$keys[2]])" `
      -e "EXPECT_GUIDELINES=$ExpectGuidelines" -e "EXPECT_CHANGELOG=$ExpectChangelog" `
      -e "EXPECT_STAGED=$ExpectStaged" -e "EXPECT_EDITORS=$ExpectEditors" `
      -v "$($sqlDir):/sql:ro" -v "$($logDir):/record" -v "$($PSScriptRoot):/procedure:ro" `
      $Image /procedure/apply-sequence.sh
  $exit = $LASTEXITCODE
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$meaning = @{
  0 = 'both applied; gates 0, 1 and 2 passed'
  10 = 'refused before sending anything'
  11 = 'M1 failed; verified nothing of it committed; M2 not sent'
  12 = 'M1 committed but gate 1 failed; M2 not sent'
  13 = 'M1 errored but IS committed (gate 1 passes); M2 not sent'
  19 = 'M1 errored; state UNKNOWN; M2 not sent'
  21 = 'M2 failed; verified M1 committed and nothing of M2'
  22 = 'M2 committed but gate 2 failed'
  23 = 'M2 errored but IS committed (gate 2 passes)'
  29 = 'M2 errored; state UNKNOWN'
  40 = 'inspect: PRE-upgrade state (neither migration present)'
  41 = 'inspect: 20261024 committed, 20261025 not'
  42 = 'inspect: both committed (final state)'
  49 = 'inspect: state UNKNOWN (no gate passes)'
}
$record = [ordered]@{
  kind = 'ortho-guidelines-hub review-queue migration (psql, exact files)'
  mode = $mode
  startedUtc = $stamp
  target = [ordered]@{ host = $PoolerHost; port = $Port; user = $DbUser; database = $Database; sslmode = $SslMode; project = $(if ($isLocalHost) { 'local rehearsal' } else { $PROJECT_REF }) }
  tool = [ordered]@{ image = $Image; psql = (& docker run --rm --entrypoint psql $Image --version) }
  files = $plan
  expected = [ordered]@{ guidelines = $ExpectGuidelines; changelog = $ExpectChangelog; staged = $ExpectStaged; editors = $ExpectEditors }
  exitCode = $exit
  outcome = $(if ($meaning.ContainsKey($exit)) { $meaning[$exit] } else { "unexpected exit $($exit): inspect read-only" })
  migrationHistory = 'NOT written by this route'
  steps = @(if (Test-Path (Join-Path $logDir 'steps.tsv')) { Get-Content (Join-Path $logDir 'steps.tsv') | ForEach-Object { [string]$_ } })
}
$record | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $run 'record.json') -Encoding utf8
Get-ChildItem $run -File -Recurse | ForEach-Object { $_.IsReadOnly = $true }
$color = if ($exit -eq 0 -or ($Inspect -and $exit -in 40, 41, 42)) { 'Green' } else { 'Red' }
Write-Host "[migrate] exit $exit : $($record.outcome)" -ForegroundColor $color
Write-Host "[migrate] Record: $run (record.json, log\transcript.log, log\steps.tsv). No credentials are stored."
exit $exit
