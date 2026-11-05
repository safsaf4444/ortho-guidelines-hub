# Pure validation only. No DNS, environment/credential reads, commands or I/O.
function Test-LocalDatabaseHost([string] $HostName) {
  return $HostName -imatch '\A(?:localhost|127\.0\.0\.1|host\.docker\.internal|::1)\z'
}

function Assert-DatabaseConnectionParts([string] $HostName, [int] $Port, [string] $Database) {
  # These wrappers operate on postgres, not arbitrary libpq conninfo. In
  # particular, never allow URI/keyword syntax to reinterpret a target field.
  if ($Database -cne 'postgres') { throw 'only the literal database name postgres is supported; connection strings are not accepted.' }
  if ($Port -lt 1 -or $Port -gt 65535) { throw 'port must be between 1 and 65535.' }
  if ([string]::IsNullOrWhiteSpace($HostName) -or $HostName.Length -gt 253) { throw 'a single explicit hostname is required.' }
  if ($HostName -eq '::1') { return }
  # Strict DNS labels or dotted IPv4 only. Refuse host lists, ports, sockets,
  # URIs, key-value strings, whitespace, bracketed IPv6 and trailing-dot aliases.
  if ($HostName -cnotmatch '\A[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\z') {
    throw 'host must be one DNS name, dotted IPv4 address, or literal ::1.'
  }
  if ($HostName -match '\A[0-9.]+\z') {
    if ($HostName -notmatch '\A(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}\z') { throw 'IPv4 must contain four canonical decimal octets.' }
    foreach ($octet in $HostName.Split('.')) {
      if ([int]$octet -gt 255) { throw 'IPv4 octets must be between 0 and 255.' }
    }
  }
}
