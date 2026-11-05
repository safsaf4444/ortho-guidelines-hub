# SAF-12 OFFLINE ONLY: wrappers are parsed as data, never invoked/dot-sourced.
# Only pure helper functions and whitelisted validation statements execute.
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$script:passed = 0; $script:failed = 0
function Check([string] $Name, [bool] $Condition) {
  if ($Condition) { $script:passed++; Write-Output "PASS $Name" }
  else { $script:failed++; Write-Output "FAIL $Name" }
}
function Parse-Only([string] $File) {
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($File, [ref] $tokens, [ref] $errors)
  if ($errors.Count) { throw "Syntax errors in $File" }
  return $ast
}
$helper = Parse-Only (Join-Path $repo 'scripts/lib/Database-Target.ps1')
if (@($helper.EndBlock.Statements).Count -ne 2 -or @($helper.EndBlock.Statements | Where-Object { $_ -isnot [Management.Automation.Language.FunctionDefinitionAst] }).Count) { throw 'Helper must contain only two function definitions' }
if (@($helper.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)).Count) { throw 'Helper contains a command invocation' }
. ([scriptblock]::Create($helper.Extent.Text))
Check 'helper contains only command-free pure functions' $true
$gates = @{}; $sources = @{}
foreach ($kind in 'backup','deploy') {
  $relative = if ($kind -eq 'backup') { 'scripts/backup/Backup-Public.ps1' } else { 'scripts/deploy/Apply-Migrations-Psql.ps1' }
  $ast = Parse-Only (Join-Path $repo $relative); $text = $ast.Extent.Text; $sources[$kind] = $text
  $start = $text.IndexOf('$isLocalHost = Test-LocalDatabaseHost $PoolerHost')
  $marker = if ($kind -eq 'backup') { '$drive = ' } else { 'if ($ExpectGuidelines ' }
  $end = $text.IndexOf($marker,[Math]::Max(0,$start))
  if ($start -lt 0 -or $end -le $start) { throw "Target markers missing: $kind" }
  $gate = [scriptblock]::Create($text.Substring($start,$end-$start))
  $calls = @($gate.Ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true))
  if (@($calls | Where-Object { $_.GetCommandName() -notin 'Test-LocalDatabaseHost','Fail' }).Count) { throw 'Operational command in gate' }
  $gates[$kind] = $gate
  $validationAt = $text.IndexOf('try { Assert-DatabaseConnectionParts -HostName $PoolerHost -Port $Port -Database $Database } catch { Fail $_.Exception.Message }')
  Check "$kind validates connection parts before target branch" ($validationAt -ge 0 -and $validationAt -lt $start)
  Check "$kind loads helper relative to script directory" ($text.Contains(". (Join-Path " + '$PSScriptRoot' + " '../lib/Database-Target.ps1')"))
  foreach ($command in @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -in 'docker','manage-bde.exe','New-Item','Read-Host','icacls.exe' }, $true))) {
    Check "$kind validation precedes $($command.GetCommandName()) line $($command.Extent.StartLineNumber)" ($validationAt -lt $command.Extent.StartOffset)
  }
}
function Invoke-HarmlessGate([string] $Kind, [string] $HostName, [bool] $HasCredential, [string] $Ssl = 'require', [int] $TargetPort = 5432, [string] $TargetDatabase = 'postgres', [string] $User = 'postgres.offline-test-project') {
  $PoolerHost = $HostName; $Port = $TargetPort; $Database = $TargetDatabase
  $Credential = $HasCredential; $SslMode = $Ssl; $DbUser = $User; $PROJECT_REF = 'offline-test-project'; $reached = 0
  function Fail([string] $Message) { throw "REFUSED: $Message" }
  try {
    Assert-DatabaseConnectionParts -HostName $PoolerHost -Port $Port -Database $Database
    & $gates[$Kind]
    $reached++ # harmless operational-boundary sentinel; no command runs
    return $reached
  } catch { return $reached }
}
foreach ($hostName in @('localhost','LOCALHOST','127.0.0.1','host.docker.internal','::1')) {
  Check "exact local classifier $hostName" (Test-LocalDatabaseHost $hostName)
  foreach ($kind in 'backup','deploy') {
    Check "$kind local with credential $hostName" ((Invoke-HarmlessGate $kind $hostName $true 'disable') -eq 1)
    Check "$kind local without credential refused $hostName" ((Invoke-HarmlessGate $kind $hostName $false) -eq 0)
  }
}
foreach ($hostName in @('localhost.example.com','notlocalhost','127.0.0.1.attacker.invalid','host.docker.internal.attacker.invalid')) {
  Check "lookalike is not local $hostName" (-not (Test-LocalDatabaseHost $hostName))
  foreach ($kind in 'backup','deploy') {
    Check "$kind lookalike cannot bypass credential/TLS guard $hostName" ((Invoke-HarmlessGate $kind $hostName $true 'disable') -eq 0)
    Check "$kind lookalike without credential cannot disable TLS $hostName" ((Invoke-HarmlessGate $kind $hostName $false 'disable') -eq 0)
  }
  Check "deployment lookalike refused even with TLS $hostName" ((Invoke-HarmlessGate 'deploy' $hostName $false) -eq 0)
}
$badHosts = @('', ' ', ('localhost'+[char]10), ('localhost'+[char]13+[char]10), 'localhost.', '-localhost','localhost-','a..invalid',
 '127.1','127.0.0.999','0127.0.0.1','2130706433','[::1]','0:0:0:0:0:0:0:1','::ffff:127.0.0.1',
 'postgresql://localhost/postgres','postgres://localhost/postgres','host=localhost dbname=postgres',
 'localhost,remote.invalid','localhost:5432','/tmp/postgresql',('a' * 64 + '.invalid'),('local'+[char]0+'host'))
for ($i=0; $i -lt $badHosts.Count; $i++) {
  foreach ($kind in 'backup','deploy') {
    Check "$kind malformed host $i with local exemptions refused" ((Invoke-HarmlessGate $kind $badHosts[$i] $true 'disable') -eq 0)
    Check "$kind malformed host $i without credential refused" ((Invoke-HarmlessGate $kind $badHosts[$i] $false) -eq 0)
  }
}
foreach ($database in @('', 'other_database','POSTGRES','postgresql://remote.invalid/postgres','postgres://remote.invalid/postgres','host=remote.invalid dbname=postgres','postgres host=remote.invalid',('postgres'+[char]10),'postgres,other')) {
  foreach ($kind in 'backup','deploy') {
    Check "$kind unsafe/unsupported database field length $($database.Length)" ((Invoke-HarmlessGate $kind 'localhost' $true 'disable' 5432 $database) -eq 0)
  }
}
foreach ($portNumber in @(0,-1,65536)) {
  foreach ($kind in 'backup','deploy') {
    Check "$kind invalid port $portNumber refused" ((Invoke-HarmlessGate $kind 'localhost' $true 'disable' $portNumber) -eq 0)
  }
}
Check 'backup permits remote DNS with TLS and prompted credential path' ((Invoke-HarmlessGate 'backup' 'database.example.com' $false) -eq 1)
Check 'deployment intended session pooler with synthetic project user accepted' ((Invoke-HarmlessGate 'deploy' 'aws-0-eu-central-1.pooler.supabase.com' $false) -eq 1)
Check 'deployment transaction pooler refused' ((Invoke-HarmlessGate 'deploy' 'aws-0-eu-central-1.pooler.supabase.com' $false 'require' 6543) -eq 0)
Check 'deployment wrong project user refused' ((Invoke-HarmlessGate 'deploy' 'aws-0-eu-central-1.pooler.supabase.com' $false 'require' 5432 'postgres' 'postgres.other-project') -eq 0)
Check 'deployment pooler hostname suffix refused' ((Invoke-HarmlessGate 'deploy' 'aws-0-eu-central-1.pooler.supabase.com.attacker.invalid' $false) -eq 0)
foreach ($kind in 'backup','deploy') {
  Check "$kind refusal exits nonzero" ($sources[$kind] -match 'function Fail\([\s\S]*?exit 2 \}')
  Check "$kind captures operational exit before cleanup" ($sources[$kind] -match '\$exit = \$LASTEXITCODE\s*\r?\n\} finally')
}
Check 'backup dump failure exits before manifest success' ($sources.backup -match 'if \(\$exit -ne 0\) \{[\s\S]*?exit 1\s*\r?\n\}[\s\S]*?\$manifest =')
Check 'deployment propagates captured exit rather than unconditional success' ($sources.deploy -match 'exit \$exit\s*\z')
Write-Output "$script:passed passed, $script:failed failed"
if ($script:failed) { exit 1 }
exit 0
