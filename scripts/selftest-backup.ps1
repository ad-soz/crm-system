# Self-test for the backup and restore scripts. Uses only throwaway files in a
# temp folder; never touches the real database or backups.
#   .\scripts\selftest-backup.ps1
$ErrorActionPreference = 'Stop'

$failures = New-Object System.Collections.Generic.List[string]
function Check([string]$name, [bool]$ok) {
  if ($ok) { Write-Host "  ok    $name" } else { Write-Host "  FAIL  $name"; $failures.Add($name) }
}

# 1. Every script must at least parse.
foreach ($f in 'supervisor.ps1', 'crm-services.ps1', 'backup-tools.ps1', 'restore-backup.ps1') {
  $errors = $null; $tokens = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $f), [ref]$tokens, [ref]$errors)
  Check "$f parses" ($errors.Count -eq 0)
}

# 2. Restore against throwaway files.
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("crm-selftest-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$env:CRM_BACKUP_DIR = Join-Path $tmp 'backups'
New-Item -ItemType Directory -Path $env:CRM_BACKUP_DIR | Out-Null
$db = Join-Path $tmp 'live.db'

function New-FakeDb([string]$path, [string]$marker) {
  # Valid SQLite header, padded past the 4 KB minimum, with a marker to tell files apart.
  $bytes = New-Object byte[] 8192
  [Text.Encoding]::ASCII.GetBytes("SQLite format 3`0").CopyTo($bytes, 0)
  [Text.Encoding]::ASCII.GetBytes($marker).CopyTo($bytes, 100)
  [IO.File]::WriteAllBytes($path, $bytes)
}
function Get-Marker([string]$path) {
  [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($path)[100..107])
}

try {
  New-FakeDb $db 'LIVE-NOW'
  $good = Join-Path $env:CRM_BACKUP_DIR 'crm-auto-20261101-010203-004.db'
  New-FakeDb $good 'OLD-DATA'
  $restore = Join-Path $PSScriptRoot 'restore-backup.ps1'

  # Restores the chosen backup, keeping a safety copy of what was there.
  & $restore -Name 'crm-auto-20261101-010203-004.db' -Yes -NoRestart -DatabasePath $db | Out-Null
  Check 'restore replaces the database with the backup' ((Get-Marker $db) -eq 'OLD-DATA')
  $safety = @(Get-ChildItem $env:CRM_BACKUP_DIR -Filter 'crm-pre-update-*.db')
  Check 'a safety copy of the previous data was kept' ($safety.Count -eq 1 -and (Get-Marker $safety[0].FullName) -eq 'LIVE-NOW')

  # The restore can be undone by restoring the safety copy.
  & $restore -Name $safety[0].Name -Yes -NoRestart -DatabasePath $db | Out-Null
  Check 'the restore can be undone from the safety copy' ((Get-Marker $db) -eq 'LIVE-NOW')

  # -Latest skips safety copies.
  & $restore -Latest -Yes -NoRestart -DatabasePath $db | Out-Null
  Check '-Latest restores the newest real backup, not a safety copy' ((Get-Marker $db) -eq 'OLD-DATA')

  # Stale journal files must not survive a restore.
  Set-Content -Path "$db-journal" -Value 'stale'
  & $restore -Name 'crm-auto-20261101-010203-004.db' -Yes -NoRestart -DatabasePath $db | Out-Null
  Check 'stale journal files are removed' (-not (Test-Path "$db-journal"))

  # Bad input is refused and changes nothing.
  New-FakeDb $db 'KEEP-ME!'
  $refused = @(
    @{ n = 'a path instead of a name'; a = @{ Name = '..\..\live.db' } },
    @{ n = 'a name that is not a backup'; a = @{ Name = 'notes.txt' } },
    @{ n = 'a backup that does not exist'; a = @{ Name = 'crm-auto-20990101-000000-000.db' } }
  )
  foreach ($case in $refused) {
    $threw = $false
    try { & $restore @($case.a) -Yes -NoRestart -DatabasePath $db 2>$null | Out-Null } catch { $threw = $true }
    Check "refuses $($case.n)" ($threw -and (Get-Marker $db) -eq 'KEEP-ME!')
  }
  $notDb = Join-Path $env:CRM_BACKUP_DIR 'crm-manual-20261102-000000-000.db'
  [IO.File]::WriteAllBytes($notDb, (New-Object byte[] 8192))
  $threw = $false
  try { & $restore -Name 'crm-manual-20261102-000000-000.db' -Yes -NoRestart -DatabasePath $db 2>$null | Out-Null } catch { $threw = $true }
  Check 'refuses a file that is not a SQLite database' ($threw -and (Get-Marker $db) -eq 'KEEP-ME!')

  # Pruning keeps the newest.
  . (Join-Path $PSScriptRoot 'backup-tools.ps1')
  1..7 | ForEach-Object { New-FakeDb (Join-Path $env:CRM_BACKUP_DIR ('crm-pre-update-2026110{0}-000000-000.db' -f $_)) 'x' }
  Remove-OldCrmBackups 'pre-update' 5
  $left = @(Get-ChildItem $env:CRM_BACKUP_DIR -Filter 'crm-pre-update-*.db')
  Check 'pruning keeps only the newest 5 safety copies' ($left.Count -eq 5)
}
finally {
  Remove-Item Env:\CRM_BACKUP_DIR -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

if ($failures.Count -gt 0) { Write-Host "`n$($failures.Count) check(s) failed."; exit 1 }
Write-Host "`nAll backup script checks passed."
