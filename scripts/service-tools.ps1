# Shared helpers for the supervisor and crm-services.ps1. Dot-source this file.
#
#   . "$PSScriptRoot\service-tools.ps1"
#
# Why these exist: Windows PowerShell turns any text a native program writes to
# its error stream (npm, taskkill and cmd all do, even on success) into a
# terminating error when $ErrorActionPreference is 'Stop'. That made routine
# build output look like a failure. These helpers run native commands with the
# redirection done by cmd itself, so PowerShell never sees that stream, and
# they report the exit code instead of throwing.

# Run a command line in a folder, sending all of its output to a log file.
# Returns the exit code. Never throws because of what the command prints.
function Invoke-NativeLogged([string]$dir, [string]$command, [string]$logFile) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # The parentheses make the redirection cover every part of a compound command.
    & cmd.exe /c "cd /d `"$dir`" && ($command) > `"$logFile`" 2>&1"
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
}

# Kill a process and its children. A process that has already gone is not an error.
function Stop-ProcessTree([int]$processId) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & cmd.exe /c "taskkill.exe /T /F /PID $processId >nul 2>&1"
  } finally {
    $ErrorActionPreference = $previous
  }
}

# ---- Deliberate stop ----
#
# The scheduled task restarts the supervisor if it ends (that is how the app
# survives a crash), so killing it is not enough to keep it stopped: Windows
# starts it again about a minute later, in the middle of whatever you were
# doing. `crm-services.ps1 stop` therefore leaves a note saying the stop was on
# purpose. A supervisor that finds the note exits quietly (exit code 0, so the
# task does not restart it again). The note only counts for the Windows sign-in
# session it was written in, so the next sign-in starts the app as before.

function Get-StopFlagPath([string]$root) { return (Join-Path (Join-Path $root 'logs') 'stop.request') }

# Identifies this sign-in: the boot time plus the interactive session.
function Get-SessionToken {
  $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString('o')
  return "$boot|$((Get-Process -Id $PID).SessionId)"
}

function Set-StopRequest([string]$root) {
  $path = Get-StopFlagPath $root
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  Set-Content -LiteralPath $path -Value (Get-SessionToken)
}

function Clear-StopRequest([string]$root) {
  Remove-Item -LiteralPath (Get-StopFlagPath $root) -Force -ErrorAction SilentlyContinue
}

# True when a stop was requested during this sign-in. A note left by an earlier
# sign-in is ignored (and removed), so it can never keep the app off for good.
function Test-StopRequested([string]$root) {
  $path = Get-StopFlagPath $root
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  $saved = (Get-Content -LiteralPath $path -Raw -ErrorAction SilentlyContinue)
  if ($saved -and $saved.Trim() -eq (Get-SessionToken)) { return $true }
  Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  return $false
}

# True when both halves of the app have been built.
# Is this process (by name and command line) the CRM app, so that the supervisor may
# clear it off the port? The supervisor starts the app as `node dist/main.js` from the
# server folder, so its command line does NOT contain the project path; a leftover app
# was therefore missed and kept the port. Anything else on the port is left alone.
function Test-IsThisProjectsApp([string]$name, [string]$commandLine, [string]$root) {
  if ($name -ne 'node.exe' -or -not $commandLine) { return $false }
  if ($commandLine -like "*$root*") { return $true }
  return [bool]($commandLine -match '(?i)(^|[\s"''])(\.[\\/])?dist[\\/]main\.js"?\s*$')
}

function Test-BuildPresent([string]$root) {
  return (Test-Path (Join-Path $root 'server\dist\main.js')) -and (Test-Path (Join-Path $root 'client\dist\index.html'))
}

# The last few lines of a log, for putting the real reason in the supervisor log.
function Get-LogTail([string]$logFile, [int]$lines = 6) {
  if (-not (Test-Path -LiteralPath $logFile)) { return '(no log)' }
  $tail = Get-Content -LiteralPath $logFile -Tail $lines -ErrorAction SilentlyContinue
  if (-not $tail) { return '(log is empty)' }
  return ($tail -join ' | ')
}

# Build the app, judged by what it produced and not only by an exit code.
# Retries once, because a first attempt can lose a race with another process
# touching the same files. Returns $true when a complete build is in place.
# $log is a scriptblock that receives status messages.
function Invoke-BuildStep([string]$root, [string]$logFile, [scriptblock]$log, [int]$retryDelaySec = 5, [string]$command = 'npm run build') {
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    $code = Invoke-NativeLogged $root $command $logFile
    $present = Test-BuildPresent $root
    if ($code -eq 0 -and $present) { return $true }
    & $log ("build attempt $attempt failed (exit code $code, output present: $present): " + (Get-LogTail $logFile))
    if ($attempt -eq 1) { Start-Sleep -Seconds $retryDelaySec }
  }
  return $false
}
