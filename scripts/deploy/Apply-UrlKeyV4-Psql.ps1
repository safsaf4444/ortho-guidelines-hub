<#
.SYNOPSIS
  Applies supabase/migrations/20261104_url_key_unreserved_decoding.sql (url-key v4)
  to the Supabase database as the EXACT file with psql (Docker's PostgreSQL 17),
  between two read-only gates. DRY RUN unless -Apply, -Inspect or -Rollback is given.

.DESCRIPTION
  Narrow, v4-only companion of Apply-Migrations-Psql.ps1 (which stays the
  route, and the record, for 20261024/20261025). Same safeguards:

  * Exact bytes: the migration, the gate (supabase/URL-KEY-V4-GATE-READONLY.sql)
    and the rollback (supabase/URL-KEY-V4-ROLLBACK.sql) must match the SHA-256
    values recorded below; they are copied into a fresh run folder outside
    the repo and OneDrive, checked again, mounted read-only, and checked a
    third time inside the container.
  * Target: only the eu-central-1 SESSION pooler, user postgres.<ref>, TLS;
    -ConfirmProject must name the project and -ConfirmMigration the migration.
  * Order: gate 0 (exact url-key v3 state, including "no queue row or hold
    could change key") -> migration -> gate 1 (exact v4 state). Every gate
    also checks catalogue (every column, source links included), changelog,
    queue size, holds and editor count are unchanged.
  * Errors: the outcome is never inferred from psql's exit code; after any
    non-zero exit the gates establish the actual state. No retry, no repair.
    The gates and the migration are SEPARATE transactions: a gate failing
    after the migration committed (exit 12) does not undo it. Nothing here
    reverses a committed change; withdrawing v4 is the separate -Rollback.
    The migration itself refuses (55000) if a stored key would move or two
    catalogue entries would newly collide.
  * Secrets: the password is read without echo and reaches Docker only by
    NAME (docker run -e PGPASSWORD); removed and zeroed afterwards.
  * NOT done: migration history is not written. No db push, no Management API.

  -Inspect  read-only: reports v3 (exit 40), v4 (41) or neither (49).
  -Rollback with -ConfirmRollback URL-KEY-V4-ROLLBACK and -ApplyRecord
            <record.json of the APPLY run that put this database on v4>:
            gate 1 -> the rollback file -> gate 0. The pre-v4 holds
            fingerprint is READ FROM THAT RECORD (expected.holds, verified by
            its gate 0), never typed in or recalculated from the database. The
            record must be a committed v4 apply (exit 0, 12 or 13) of these
            exact migration bytes against this same target, with no newer
            committed apply record beside it. The rollback refuses, atomically,
            if any row was filed under v4 with a key v3 would compute
            differently, or if the staging holds differ in any way from that
            recorded value (a hold stores only its key, so a v4-era hold
            cannot be checked otherwise). Separate approval only.

.EXAMPLE
  # Dry run (no Docker, no network, no password):
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\Apply-UrlKeyV4-Psql.ps1 `
    -PoolerHost aws-0-eu-central-1.pooler.supabase.com -DbUser postgres.xutjahmbyrvifcltpxxu `
    -RecordDir C:\Users\safad\OrthoBackups -ExpectGuidelines '<count:md5>' -ExpectChangelog '<count:md5>' `
    -ExpectStaged 0 -ExpectEditors 1 -ExpectHolds '<count:md5>'
  # Apply (separate approval): add  -Apply -ConfirmProject xutjahmbyrvifcltpxxu -ConfirmMigration 20261104_url_key_unreserved_decoding
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $PoolerHost,
  [Parameter(Mandatory = $true)] [string] $DbUser,
  [Parameter(Mandatory = $true)] [string] $RecordDir,
  # Expected unchanged values, from the read-only preflight (URL-KEY-V4.md, step 2).
  [Parameter(Mandatory = $true)] [string] $ExpectGuidelines,
  [Parameter(Mandatory = $true)] [string] $ExpectChangelog,
  [Parameter(Mandatory = $true)] [int] $ExpectStaged,
  [Parameter(Mandatory = $true)] [int] $ExpectEditors,
  [Parameter(Mandatory = $true)] [string] $ExpectHolds,
  [switch] $Apply,
  [switch] $Inspect,
  [switch] $Rollback,
  [string] $ConfirmProject = '',
  [string] $ConfirmMigration = '',
  [string] $ConfirmRollback = '',
  # Rollback only: path to the record.json of the APPLY run that put this database on v4.
  [string] $ApplyRecord = '',
  [int] $Port = 5432,
  [string] $Database = 'postgres',
  [ValidateSet('require', 'disable')] [string] $SslMode = 'require',
  [string] $Image = 'public.ecr.aws/supabase/postgres:17.11.0.004',
  # Only for a LOCAL rehearsal against the disposable stack; refused for a remote host.
  [System.Management.Automation.PSCredential] $Credential,
  # Only for the tests (a copy with a changed byte must be refused). Defaults to this repo.
  [string] $SourceRoot = ''
)
$ErrorActionPreference = 'Stop'

$PROJECT_REF = 'xutjahmbyrvifcltpxxu'
$MIGRATION = '20261104_url_key_unreserved_decoding'
$FILES = [ordered]@{
  'supabase/migrations/20261104_url_key_unreserved_decoding.sql' = '8c775bf8aab61b7235be7d911c8e6aa3eb310130f0e479bad590e3c1ab1e45a5'
  'supabase/URL-KEY-V4-GATE-READONLY.sql'                        = '7847d343e42ed8dc70668962a2a505eea690ef45eb319d9e60494b68d39baaa4'
  'supabase/URL-KEY-V4-ROLLBACK.sql'                             = 'f4240a9eebb8bf541cf27e9b4018cdc1cd991b30e32817a3191df7a81c806c9d'
}

function Fail([string] $msg) { Write-Host "[v4] REFUSED: $msg" -ForegroundColor Red; exit 2 }
function Sha([string] $p) { (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower() }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path.TrimEnd('\')
$src = if ($SourceRoot) { (Resolve-Path $SourceRoot).Path.TrimEnd('\') } else { $repoRoot }

# -- Target: the intended project only, or the local rehearsal --------------
# LOCAL means exactly `localhost`, exactly `host.docker.internal` (both
# case-insensitive, as host names are), or a dotted-quad IPv4 address in
# 127.0.0.0/8 with every octet 0-255 and no leading zeros. Anything else,
# including names that merely START with one of these (`localhost.prod.example`,
# `127.attacker.example`, `127.0.0.1.attacker.example`), takes the REMOTE path
# with all its checks. `\z` (true end of string), not `$`, which in .NET also
# matches before a trailing newline.
function Test-LocalHost([string] $h) {
  if ($h -ieq 'localhost' -or $h -ieq 'host.docker.internal') { return $true }
  $octet = '(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])'
  return [regex]::IsMatch($h, "\A127\.$octet\.$octet\.$octet\z")
}
$isLocalHost = Test-LocalHost $PoolerHost
if ($isLocalHost) {
  if (-not $Credential) { Fail 'a local host is for the rehearsal only; pass -Credential for it.' }
} else {
  if ($Credential) { Fail '-Credential is for the local rehearsal only; for a real database the password is prompted for (not echoed).' }
  if ($SslMode -ne 'require') { Fail 'a remote host needs -SslMode require.' }
  if (-not [regex]::IsMatch($PoolerHost, '\Aaws-[0-9]+-eu-central-1\.pooler\.supabase\.com\z')) { Fail "host $PoolerHost is not the eu-central-1 session pooler." }
  if ($Port -ne 5432) { Fail 'use the SESSION pooler (port 5432); the transaction pooler (6543) cannot hold a migration session.' }
  if ($DbUser -ne "postgres.$PROJECT_REF") { Fail "user $DbUser is not postgres.$PROJECT_REF." }
}
foreach ($pair in @(@('ExpectGuidelines', $ExpectGuidelines), @('ExpectChangelog', $ExpectChangelog), @('ExpectHolds', $ExpectHolds))) {
  if ($pair[1] -notmatch '^\d+:[0-9a-f]{32}$') { Fail "$($pair[0]) must look like <count>:<md5>, as recorded from the preflight." }
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

$modes = @($Apply, $Inspect, $Rollback) | Where-Object { $_ }
if ($modes.Count -gt 1) { Fail 'use only one of -Apply, -Inspect, -Rollback.' }
$mode = if ($Apply) { 'apply' } elseif ($Rollback) { 'rollback' } elseif ($Inspect) { 'inspect' } else { 'dry-run' }

Write-Host "[v4] Target   : $DbUser@$($PoolerHost):$Port/$Database (sslmode=$SslMode)$(if (-not $isLocalHost) { "  project $PROJECT_REF" })"
Write-Host "[v4] Mode     : $mode"
Write-Host '[v4] apply    : gate 0 (url-key v3 state) -> 20261104 -> gate 1 (url-key v4 state); stop at the first failure; no retry'
Write-Host "[v4] Expected : guidelines $ExpectGuidelines; changelog $ExpectChangelog; staged rows $ExpectStaged; editors $ExpectEditors; holds $ExpectHolds"
foreach ($f in $plan) { Write-Host ("[v4]   {0}  {1,7} bytes  sha256 {2}" -f $f.file, $f.bytes, $f.sha256) }
Write-Host '[v4] Migration history: NOT written by this route.'

if ($mode -eq 'dry-run') {
  Write-Host '[v4] DRY RUN: nothing was sent. No Docker container, no network, no password.' -ForegroundColor Cyan
  exit 0
}
if (-not $isLocalHost -and $ConfirmProject -ne $PROJECT_REF) { Fail "-$((Get-Culture).TextInfo.ToTitleCase($mode)) needs -ConfirmProject $PROJECT_REF." }
if ($mode -eq 'apply' -and $ConfirmMigration -ne $MIGRATION) { Fail "-Apply needs -ConfirmMigration $MIGRATION." }
if ($mode -eq 'rollback' -and $ConfirmRollback -ne 'URL-KEY-V4-ROLLBACK') { Fail '-Rollback needs -ConfirmRollback URL-KEY-V4-ROLLBACK.' }

# -- Rollback: the pre-v4 holds come ONLY from the original apply record -----
# Not a typed value and not recalculated: a value recalculated from the
# database now would match the current holds by construction and defeat the
# rollback's holds check (Codex P2 on #323).
$preV4Holds = ''
$applyRecordPath = $null
if ($mode -eq 'rollback') {
  if (-not $ApplyRecord) { Fail '-Rollback needs -ApplyRecord <record.json of the APPLY run that put this database on v4>.' }
  if (-not (Test-Path -LiteralPath $ApplyRecord -PathType Leaf)) { Fail "apply record $ApplyRecord not found." }
  $applyRecordPath = (Resolve-Path -LiteralPath $ApplyRecord).Path
  try { $ar = Get-Content -Raw -Encoding UTF8 -LiteralPath $applyRecordPath | ConvertFrom-Json } catch { Fail "apply record $applyRecordPath is not valid JSON." }
  $targetLabel = if ($isLocalHost) { 'local rehearsal' } else { $PROJECT_REF }
  $committedExits = @(0, 12, 13)
  $migRel = 'supabase/migrations/20261104_url_key_unreserved_decoding.sql'
  if ($ar.kind -ne 'ortho-guidelines-hub url-key v4 migration (psql, exact files)' -or $ar.mode -ne 'apply' -or $ar.migration -ne $MIGRATION) {
    Fail "apply record $applyRecordPath is not a url-key v4 APPLY record."
  }
  if ($committedExits -notcontains [int]$ar.exitCode) { Fail "apply record exit $($ar.exitCode): that run did not commit v4, so it does not describe this database's pre-v4 holds." }
  if (-not (@($ar.steps) | Where-Object { [string]$_ -match '\tgate0\tpassed\z' })) { Fail 'apply record has no passed gate 0: its expected holds were never verified.' }
  if (-not (@($ar.files) | Where-Object { $_.file -eq $migRel -and $_.sha256 -eq $FILES[$migRel] })) { Fail 'apply record is for different migration bytes.' }
  if ([string]$ar.target.project -ne $targetLabel) { Fail "apply record target '$($ar.target.project)' is not this target '$targetLabel'." }
  $recordedHolds = [string]$ar.expected.holds
  if (-not [regex]::IsMatch($recordedHolds, '\A[0-9]+:[0-9a-f]{32}\z')) { Fail 'apply record expected.holds is missing or malformed.' }
  # The database's CURRENT v4 state comes from the most recent committed apply.
  $runsDir = Split-Path (Split-Path $applyRecordPath -Parent) -Parent
  foreach ($d in @(Get-ChildItem -LiteralPath $runsDir -Directory -Filter 'urlkey-v4-apply-*' -ErrorAction SilentlyContinue)) {
    $p = Join-Path $d.FullName 'record.json'
    if ($p -eq $applyRecordPath -or -not (Test-Path -LiteralPath $p)) { continue }
    try { $o = Get-Content -Raw -Encoding UTF8 -LiteralPath $p | ConvertFrom-Json } catch { continue }
    if ($o.mode -eq 'apply' -and $committedExits -contains [int]$o.exitCode -and [string]$o.target.project -eq $targetLabel -and [string]$o.startedUtc -gt [string]$ar.startedUtc) {
      Fail "a newer committed apply record exists: $p. Pass the record of the apply that put the database on v4 most recently."
    }
  }
  $preV4Holds = $recordedHolds
  Write-Host "[v4] Apply record: $applyRecordPath (started $($ar.startedUtc), exit $($ar.exitCode)); pre-v4 holds $preV4Holds"
}

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
$run = Join-Path $dest "urlkey-v4-$mode-$stamp"
if (Test-Path $run) { Fail "$run already exists" }
$sqlDir = Join-Path $run 'sql'
$logDir = Join-Path $run 'log'
New-Item -ItemType Directory -Path $sqlDir, $logDir -Force | Out-Null
& icacls.exe $run /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" *> $null
if ($LASTEXITCODE -ne 0) { Fail "could not restrict permissions on $run" }

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
  & docker run --rm --name "ortho-urlkey-v4-$stamp" `
      --entrypoint bash `
      -e PGHOST=$PoolerHost -e PGPORT=$Port -e PGUSER=$DbUser -e PGDATABASE=$Database `
      -e PGSSLMODE=$SslMode -e PGAPPNAME=ortho-urlkey-v4 -e PGPASSWORD -e "MODE=$mode" `
      -e "SHA_MIG=$($FILES[$keys[0]])" -e "SHA_GATE=$($FILES[$keys[1]])" -e "SHA_RB=$($FILES[$keys[2]])" `
      -e "EXPECT_GUIDELINES=$ExpectGuidelines" -e "EXPECT_CHANGELOG=$ExpectChangelog" `
      -e "EXPECT_STAGED=$ExpectStaged" -e "EXPECT_EDITORS=$ExpectEditors" -e "EXPECT_HOLDS=$ExpectHolds" `
      -e "PRE_V4_HOLDS=$preV4Holds" `
      -v "$($sqlDir):/sql:ro" -v "$($logDir):/record" -v "$($PSScriptRoot):/procedure:ro" `
      $Image /procedure/apply-urlkey-v4.sh
  $exit = $LASTEXITCODE
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$meaning = @{
  0 = $(if ($mode -eq 'rollback') { 'rollback complete: url-key v3 restored; gates 1 and 0 passed' } else { 'url-key v4 applied; gates 0 and 1 passed' })
  2 = 'refused by this wrapper before anything ran'
  10 = 'preflight refused: the starting-state gate failed; nothing sent'
  11 = 'the step failed or was refused; the starting-state gate re-passes, so verifiably nothing of it committed'
  12 = 'the step COMMITTED but the after-gate failed; NOT reversed; run -Inspect and stop'
  13 = 'the step errored but IS committed (after-gate passes)'
  14 = 'already in the target state; nothing sent'
  19 = 'the step errored; state UNKNOWN'
  40 = 'inspect: url-key v3 state (20261104 not applied)'
  41 = 'inspect: url-key v4 state (20261104 applied)'
  49 = 'inspect: state UNKNOWN (no gate passes)'
}
$record = [ordered]@{
  kind = 'ortho-guidelines-hub url-key v4 migration (psql, exact files)'
  mode = $mode
  migration = $MIGRATION
  startedUtc = $stamp
  target = [ordered]@{ host = $PoolerHost; port = $Port; user = $DbUser; database = $Database; sslmode = $SslMode; project = $(if ($isLocalHost) { 'local rehearsal' } else { $PROJECT_REF }) }
  tool = [ordered]@{ image = $Image; psql = (& docker run --rm --entrypoint psql $Image --version) }
  files = $plan
  expected = [ordered]@{ guidelines = $ExpectGuidelines; changelog = $ExpectChangelog; staged = $ExpectStaged; editors = $ExpectEditors; holds = $ExpectHolds }
  applyRecord = $applyRecordPath
  preV4Holds = $(if ($mode -eq 'rollback') { $preV4Holds } else { $null })
  exitCode = $exit
  outcome = $(if ($meaning.ContainsKey($exit)) { $meaning[$exit] } else { "unexpected exit $($exit): inspect read-only" })
  migrationHistory = 'NOT written by this route'
  steps = @(if (Test-Path (Join-Path $logDir 'steps.tsv')) { Get-Content (Join-Path $logDir 'steps.tsv') | ForEach-Object { [string]$_ } })
}
$record | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $run 'record.json') -Encoding utf8
Get-ChildItem $run -File -Recurse | ForEach-Object { $_.IsReadOnly = $true }
$color = if ($exit -eq 0 -or ($mode -eq 'inspect' -and $exit -in 40, 41)) { 'Green' } elseif ($exit -eq 14) { 'Yellow' } else { 'Red' }
Write-Host "[v4] exit $exit : $($record.outcome)" -ForegroundColor $color
Write-Host "[v4] Record: $run (record.json, log\transcript.log, log\steps.tsv). No credentials are stored."
exit $exit
