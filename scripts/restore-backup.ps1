<#
  Restore the CRM database from a backup.

    .\scripts\restore-backup.ps1 -List                     Show the available backups
    .\scripts\restore-backup.ps1 -Name crm-auto-....db     Restore that backup (asks first)
    .\scripts\restore-backup.ps1 -Latest                   Restore the newest backup

  What it does, in order:
    1. Checks the backup exists and is a CRM database file.
    2. Stops the app.
    3. Saves the CURRENT database as a safety copy (crm-pre-update-*.db), so a
       restore can always be undone by restoring that copy.
    4. Replaces the database with the backup.
    5. Starts the app again.

  Everything entered since the backup was taken is lost, which is why step 3 exists.
  -NoRestart skips stopping and starting the app (used by tests).
#>
param(
  [switch]$List,
  [string]$Name,
  [switch]$Latest,
  [switch]$Yes,
  [switch]$NoRestart,
  [string]$DatabasePath
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\backup-tools.ps1"

$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root 'server'
$backupDir = Get-CrmBackupDir
$pattern = '^crm-(auto|manual|pre-update)-\d{8}-\d{6}-\d{3}\.db$'

function Get-Backups {
  if (-not (Test-Path $backupDir)) { return @() }
  Get-ChildItem -LiteralPath $backupDir | Where-Object { $_.Name -match $pattern } | Sort-Object Name -Descending
}

if ($List -or (-not $Name -and -not $Latest)) {
  $items = @(Get-Backups)
  if ($items.Count -eq 0) { Write-Host "No backups found in $backupDir"; exit 0 }
  Write-Host "Backups in $backupDir (newest first):"
  $items | ForEach-Object { '{0,-40} {1,10:N0} KB   {2:yyyy-MM-dd HH:mm}' -f $_.Name, ($_.Length / 1KB), $_.LastWriteTime } | Write-Host
  Write-Host "`nRestore one with:  .\scripts\restore-backup.ps1 -Name <file name>"
  exit 0
}

if (-not $DatabasePath) { $DatabasePath = Get-CrmDatabasePath $serverDir }
if (-not $DatabasePath) { throw 'Could not work out where the database is. Set DATABASE_URL or pass -DatabasePath.' }

if ($Latest) {
  $pick = Get-Backups | Where-Object { $_.Name -notlike 'crm-pre-update-*' } | Select-Object -First 1
  if (-not $pick) { throw "No automatic or manual backups found in $backupDir" }
  $Name = $pick.Name
}

# Only plain backup file names: no paths, so nothing outside the backup folder can be used.
if ($Name -notmatch $pattern) { throw "'$Name' is not a backup file name. Run with -List to see the choices." }
$source = Join-Path $backupDir $Name
if (-not (Test-Path -LiteralPath $source)) { throw "Backup not found: $source" }
if ((Get-Item -LiteralPath $source).Length -lt 4096) { throw "Backup looks too small to be a database: $source" }

# SQLite files start with this text. Refuse anything else.
$header = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($source)[0..14])
if ($header -ne 'SQLite format 3') { throw "Not a SQLite database: $source" }

Write-Host "Restore:  $source"
Write-Host "Into:     $DatabasePath"
Write-Host 'Anything entered since that backup was made will be replaced. A safety copy of the current data is taken first.'
if (-not $Yes) {
  $answer = Read-Host 'Type YES to continue'
  if ($answer -ne 'YES') { Write-Host 'Cancelled. Nothing was changed.'; exit 1 }
}

if (-not $NoRestart) {
  try { & "$PSScriptRoot\crm-services.ps1" stop *>$null } catch { }
  Start-Sleep -Seconds 3
}

$safety = $null
if (Test-Path -LiteralPath $DatabasePath) {
  $safety = Copy-CrmDatabase $DatabasePath 'pre-update'
  Write-Host "Safety copy of current data: $safety"
}

Copy-Item -LiteralPath $source -Destination $DatabasePath -Force
# Leftover journal files belong to the old database and would corrupt the restored one.
foreach ($suffix in '-journal', '-wal', '-shm') {
  $extra = "$DatabasePath$suffix"
  if (Test-Path -LiteralPath $extra) { Remove-Item -LiteralPath $extra -Force }
}
Write-Host 'Database restored.'

if (-not $NoRestart) {
  & "$PSScriptRoot\crm-services.ps1" start
  Write-Host 'The app is starting. Check it with: .\scripts\crm-services.ps1 status'
}
if ($safety) { Write-Host "To undo this restore:  .\scripts\restore-backup.ps1 -Name $(Split-Path $safety -Leaf)" }
