<#
.SYNOPSIS
  One consistent, read-only logical backup of schema `public` (definitions and
  data) from the Supabase database, using Docker's PostgreSQL 17 tools.

.DESCRIPTION
  Runs scripts/backup/snapshot-dump.sh inside a PostgreSQL 17 container. One
  exported snapshot covers both the fingerprint and the dump (see that file).

  Secrets: the password is read with Read-Host -AsSecureString (not echoed),
  unless a PSCredential is passed. It is handed to Docker ONLY through the
  environment, by NAME (`docker run -e PGPASSWORD`), so it never appears in a
  command line. It is removed from this process's environment, and its
  plain-text copy is zeroed, in a `finally` block.
  While the container runs, `docker inspect` on this machine can show it. The
  container is removed (--rm) as soon as the dump ends.

  NOT exported: auth.users / auth.identities. See the README ("Editor-account
  recovery").

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup\Backup-Public.ps1 `
    -PoolerHost <session-pooler host from Dashboard > Connect> `
    -DbUser postgres.xutjahmbyrvifcltpxxu -Destination C:\Users\safad\OrthoBackups
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $PoolerHost,
  [Parameter(Mandatory = $true)] [string] $DbUser,
  [Parameter(Mandatory = $true)] [string] $Destination,
  [int] $Port = 5432,
  [string] $Database = 'postgres',
  # 'require' = TLS-encrypted; the server certificate is not verified (see README). 'disable' is for the local test only.
  [ValidateSet('require', 'disable')] [string] $SslMode = 'require',
  [string] $Image = 'public.ecr.aws/supabase/postgres:17.11.0.004',
  # Only for a LOCAL test against the disposable stack; never for production.
  [System.Management.Automation.PSCredential] $Credential,
  # Proceed even though the destination drive's encryption could not be verified.
  [switch] $AcceptUnverifiedEncryption
)
$ErrorActionPreference = 'Stop'

function Fail([string] $msg) { Write-Host "[backup] REFUSED: $msg" -ForegroundColor Red; exit 2 }

# ── Destination: outside the repo and outside OneDrive ─────────────────────
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path.TrimEnd('\')
$dest = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\')
$forbidden = @($repoRoot, $env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial) | Where-Object { $_ }
foreach ($f in $forbidden) {
  $ff = [System.IO.Path]::GetFullPath($f).TrimEnd('\')
  if ($dest -eq $ff -or $dest.StartsWith($ff + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail "destination $dest is inside $ff (the repo or OneDrive). Choose a folder outside both."
  }
}
if ($dest -match '\\OneDrive( - [^\\]+)?(\\|$)') { Fail "destination $dest looks like a OneDrive folder." }
$isLocalHost = $PoolerHost -match '^(localhost|127\.|host\.docker\.internal$)'
if ($isLocalHost -and -not $Credential) { Fail 'a local host is for testing only; pass -Credential for it.' }
if (-not $isLocalHost -and $SslMode -ne 'require') { Fail 'a remote host needs -SslMode require.' }
if (-not $isLocalHost -and $Credential) { Fail '-Credential is for the local test only; for a real database the password is prompted for (not echoed).' }

# ── Encryption of the destination drive: verified, or explicitly accepted ──
$drive = [System.IO.Path]::GetPathRoot($dest).TrimEnd('\')
$encryption = 'unverified'
$encryptionDetail = ''
try {
  $bde = (& manage-bde.exe -status $drive 2>&1 | Out-String)
  if ($LASTEXITCODE -eq 0 -and $bde -match 'Protection Status:\s+Protection On' -and $bde -match 'Conversion Status:\s+Fully Encrypted') {
    $encryption = 'verified: BitLocker/Device encryption, fully encrypted, protection on'
  } elseif ($LASTEXITCODE -eq 0) {
    $encryption = 'verified-NOT-encrypted'
    $encryptionDetail = ($bde -split "`n" | Where-Object { $_ -match 'Conversion Status|Protection Status' }) -join '; '
  } else {
    $encryptionDetail = ($bde.Trim() -split "`n" | Select-Object -Last 2) -join ' '
  }
} catch { $encryptionDetail = $_.Exception.Message }
if ($encryption -notlike 'verified: *') {
  Write-Host "[backup] Encryption of $drive : $encryption. $encryptionDetail" -ForegroundColor Yellow
  if (-not $AcceptUnverifiedEncryption) {
    Fail "the destination drive is not verified as encrypted. Verify it in an elevated prompt (manage-bde -status $drive) and run this elevated, or re-run with -AcceptUnverifiedEncryption to accept the risk explicitly."
  }
  Write-Host '[backup] Proceeding because -AcceptUnverifiedEncryption was given. This is recorded in the manifest.' -ForegroundColor Yellow
}

# ── Docker and the image ───────────────────────────────────────────────────
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker is not running.' }
& docker image inspect $Image *> $null
if ($LASTEXITCODE -ne 0) { Fail "image $Image is not present locally (it is pulled by the local Supabase stack). Nothing was installed." }

# ── A fresh, empty, user-only backup folder ────────────────────────────────
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$out = Join-Path $dest "public-$stamp"
if (Test-Path $out) { Fail "$out already exists" }
New-Item -ItemType Directory -Path $out -Force | Out-Null
& icacls.exe $out /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" *> $null
if ($LASTEXITCODE -ne 0) { Fail "could not restrict permissions on $out" }

# ── The password: never echoed, never on a command line ────────────────────
$secure = if ($Credential) { $Credential.Password } else { Read-Host -AsSecureString -Prompt "Database password for $DbUser (not shown)" }
if ($secure.Length -eq 0) { Remove-Item $out -Recurse -Force; Fail 'empty password' }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$exit = 1
try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  Write-Host "[backup] Dumping schema public from $DbUser@$($PoolerHost):$Port/$Database (sslmode=$SslMode) into $out"
  & docker run --rm --name "ortho-backup-$stamp" `
      --entrypoint bash `
      -e PGHOST=$PoolerHost -e PGPORT=$Port -e PGUSER=$DbUser -e PGDATABASE=$Database `
      -e PGSSLMODE=$SslMode -e PGAPPNAME=ortho-backup-readonly -e PGPASSWORD `
      -v "$($out):/backup" -v "$($PSScriptRoot):/procedure:ro" `
      $Image /procedure/snapshot-dump.sh
  $exit = $LASTEXITCODE
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ($exit -ne 0) {
  Write-Host "[backup] FAILED (exit $exit). The folder $out is kept for inspection; it is NOT a valid backup." -ForegroundColor Red
  Set-Content -Path (Join-Path $out 'FAILED.txt') -Value "snapshot-dump.sh exited $exit at $stamp; not a valid backup." -Encoding utf8
  exit 1
}

# ── Manifest with hashes; files read-only ──────────────────────────────────
$files = Get-ChildItem $out -File | Sort-Object Name | ForEach-Object {
  [ordered]@{ name = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower() }
}
$manifest = [ordered]@{
  kind = 'ortho-guidelines-hub public-schema logical backup'
  createdUtc = $stamp
  source = [ordered]@{ host = $PoolerHost; port = $Port; user = $DbUser; database = $Database; sslmode = $SslMode }
  snapshotId = (Get-Content (Join-Path $out 'snapshot-id.txt') -Raw).Trim()
  consistency = 'source-fingerprint.txt and public.dump come from ONE exported snapshot (snapshot-dump.sh)'
  tool = [ordered]@{ image = $Image; pgDump = (& docker run --rm --entrypoint pg_dump $Image --version) }
  scope = 'schema public: definitions + data, privileges and policies. NOT included: auth.users, auth.identities, roles, extensions, other schemas.'
  destinationEncryption = $encryption
  destinationEncryptionDetail = $encryptionDetail
  acceptedUnverifiedEncryption = [bool]$AcceptUnverifiedEncryption
  files = $files
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $out 'manifest.json') -Encoding utf8
Get-ChildItem $out -File | ForEach-Object { $_.IsReadOnly = $true }
Write-Host "[backup] OK: $out"
Write-Host "[backup] Next (local only): npx tsx scripts/backup/restore-verify.ts `"$out`""
exit 0
