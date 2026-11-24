# Shared helpers for finding the database and its backups. Dot-source this file.
#
#   . "$PSScriptRoot\backup-tools.ps1"

function Get-CrmDataDir {
  if ($env:CRM_DATA_DIR) { return $env:CRM_DATA_DIR }
  $base = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME '.local\share' }
  return (Join-Path $base 'CRM')
}

function Get-CrmBackupDir {
  if ($env:CRM_BACKUP_DIR) { return $env:CRM_BACKUP_DIR }
  return (Join-Path (Get-CrmDataDir) 'backups')
}

# The database file named by DATABASE_URL (environment first, then server\.env).
function Get-CrmDatabasePath([string]$serverDir) {
  $url = $env:DATABASE_URL
  if (-not $url) {
    $envFile = Join-Path $serverDir '.env'
    if (Test-Path $envFile) {
      $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
      if ($line) { $url = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'") }
    }
  }
  if (-not $url -or $url -notmatch '^file:') { return $null }
  $path = $url -replace '^file:', ''
  if (-not [System.IO.Path]::IsPathRooted($path)) { $path = Join-Path (Join-Path $serverDir 'prisma') $path }
  return $path
}

# Same naming as the server, so the app lists these too. UTC avoids daylight-saving reordering.
function New-CrmBackupName([string]$kind) {
  $now = [DateTime]::UtcNow
  return ('crm-{0}-{1}-{2:000}.db' -f $kind, $now.ToString('yyyyMMdd-HHmmss'), $now.Millisecond)
}

# Copy the database file (the app must be stopped, or the file otherwise idle).
function Copy-CrmDatabase([string]$databasePath, [string]$kind) {
  $dir = Get-CrmBackupDir
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir (New-CrmBackupName $kind)
  Copy-Item -LiteralPath $databasePath -Destination $target -Force
  return $target
}

# Keep only the newest $keep files of a kind.
function Remove-OldCrmBackups([string]$kind, [int]$keep) {
  $dir = Get-CrmBackupDir
  if (-not (Test-Path $dir)) { return }
  Get-ChildItem -LiteralPath $dir -Filter "crm-$kind-*.db" |
    Where-Object { $_.Name -match "^crm-$kind-\d{8}-\d{6}-\d{3}\.db$" } |
    Sort-Object Name -Descending | Select-Object -Skip $keep |
    Remove-Item -Force
}
