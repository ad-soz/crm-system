<#
  Keeps the CRM running in production mode.

  - Runs one compiled process (node server\dist\main.js) that serves both the
    app and the API at http://localhost:5173. No dev servers are left running.
  - Before each start: builds if there is no build yet, applies pending
    database migrations, and regenerates the Prisma client.
  - Restarts the app if it exits or stops answering its health check, and
    backs off if it keeps crashing.
  - Only one supervisor can run at a time.

  Normally launched by Task Scheduler at sign-in. Manage it with crm-services.ps1.
#>
param(
  [int]$Port = 5173,
  [int]$CheckIntervalSec = 15,
  [int]$StartupGraceSec = 60,   # time to boot before health checks count
  [int]$FailuresBeforeRestart = 4
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root 'server'
$clientDist = Join-Path $root 'client\dist'
$logDir = Join-Path $root 'logs'
$stateFile = Join-Path $logDir 'supervisor.state.json'
$restartFlag = Join-Path $logDir 'restart.request'
$healthUrl = "http://127.0.0.1:$Port/api/health"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Single instance guard.
$isNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\CrmServicesSupervisor', [ref]$isNew)
if (-not $isNew) { exit 0 }

# Scheduled tasks can start with a minimal PATH; make sure node/npm resolve.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path', 'User')
# Inherited by the app process.
$env:NODE_ENV = 'production'
$env:PORT = "$Port"
$env:HOST = '127.0.0.1'
$env:CLIENT_DIST = $clientDist

. "$PSScriptRoot\backup-tools.ps1"
. "$PSScriptRoot\service-tools.ps1"

function Write-Log([string]$message) {
  $logFile = Join-Path $logDir 'supervisor.log'
  if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 2MB) {
    Move-Item $logFile "$logFile.old" -Force
  }
  Add-Content -Path $logFile -Value ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $message)
}

# `crm-services.ps1 stop` leaves a note so that this supervisor, relaunched by
# the scheduled task a minute later, does not start the app behind your back.
if (Test-StopRequested $root) {
  Write-Log 'a stop was requested; not starting the app (run crm-services.ps1 start to begin again)'
  $mutex.ReleaseMutex()
  exit 0
}

function Invoke-Step([string]$name, [string]$dir, [string]$command) {
  $log = Join-Path $logDir "$name.log"
  $code = Invoke-NativeLogged $dir $command $log
  if ($code -ne 0) { Write-Log "$name failed with exit code ${code}: $(Get-LogTail $log)"; return $false }
  return $true
}

$app = @{ Proc = $null; Started = $null; Failures = 0; Crashes = @() }

# Stop a leftover process from this project that still holds the port (e.g.
# after the supervisor was killed). Never touches other programs.
function Clear-Port {
  $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $owners) {
    $info = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
    if ($info -and (Test-IsThisProjectsApp $info.Name $info.CommandLine $root)) {
      Write-Log "freeing port $Port from leftover process $procId"
      Stop-ProcessTree $procId
    } elseif ($info) {
      Write-Log "port $Port is used by another program ($($info.Name), pid $procId); the app may fail to start"
    }
  }
}

# Before database migrations are applied, keep a copy of the database. The app
# is stopped at this point, so copying the file is safe. This never blocks a
# start: if it fails, it is logged and the app starts anyway.
function Backup-BeforeUpdate {
  try {
    $db = Get-CrmDatabasePath $serverDir
    if (-not $db -or -not (Test-Path -LiteralPath $db)) { return }
    $statusLog = Join-Path $logDir 'prisma-status.log'
    $statusCode = Invoke-NativeLogged $serverDir 'npx prisma migrate status' $statusLog
    if ($statusCode -eq 0) { return }   # nothing pending
    $copy = Copy-CrmDatabase $db 'pre-update'
    Remove-OldCrmBackups 'pre-update' 5
    Write-Log "database updates are pending; saved a copy first: $(Split-Path $copy -Leaf)"
  } catch {
    Write-Log "could not save a copy before the update: $($_.Exception.Message)"
  }
}

function Start-App {
  Clear-Port
  if (-not (Test-BuildPresent $root)) {
    Write-Log 'no build found; building (this takes about a minute)'
    # Judged by what it produced, not only an exit code; retried once.
    if (-not (Invoke-BuildStep $root (Join-Path $logDir 'build.log') ${function:Write-Log})) {
      Write-Log 'the build did not complete; will try again shortly'
      return
    }
  }
  # The running app locks the Prisma engine on Windows, so these run while it's stopped.
  [void](Invoke-Step 'prisma-generate' $serverDir 'npx prisma generate')
  Backup-BeforeUpdate
  if (-not (Invoke-Step 'prisma-migrate' $serverDir 'npx prisma migrate deploy')) { return }

  $out = Join-Path $logDir 'app.log'
  $err = Join-Path $logDir 'app.err.log'
  foreach ($f in $out, $err) { if (Test-Path $f) { Move-Item $f "$f.prev" -Force } }
  $app.Proc = Start-Process -FilePath 'node.exe' -ArgumentList 'dist/main.js' `
    -WorkingDirectory $serverDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $out -RedirectStandardError $err
  $app.Started = Get-Date
  $app.Failures = 0
  Write-Log "started app (pid $($app.Proc.Id)) on http://localhost:$Port"
}

function Stop-App {
  if ($app.Proc -and -not $app.Proc.HasExited) {
    Stop-ProcessTree $app.Proc.Id
  }
  $app.Proc = $null
}

function Restart-App([string]$reason) {
  Write-Log "restarting app: $reason"
  Stop-App
  # Back off when crash-looping: 5s normally, 60s after 5 restarts in 10 minutes.
  $now = Get-Date
  $app.Crashes = @($app.Crashes | Where-Object { ($now - $_).TotalMinutes -lt 10 }) + $now
  if ($app.Crashes.Count -ge 5) {
    Write-Log "app has restarted $($app.Crashes.Count) times in 10 minutes; waiting 60s (check logs\app.err.log)"
    Start-Sleep -Seconds 60
  } else {
    Start-Sleep -Seconds 5
  }
  Start-App
}

function Test-Healthy {
  try {
    return (Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200
  } catch {
    return $false
  }
}

function Save-State {
  [ordered]@{
    supervisorPid = $PID
    app           = $(if ($app.Proc) { $app.Proc.Id } else { $null })
    port          = $Port
    updated       = (Get-Date).ToString('o')
  } | ConvertTo-Json | Set-Content -Path $stateFile
}

Write-Log "supervisor started (pid $PID)"
Start-App
Save-State

try {
  while ($true) {
    Start-Sleep -Seconds $CheckIntervalSec

    if (Test-Path $restartFlag) {
      Remove-Item $restartFlag -Force
      Restart-App 'restart requested'
      Save-State
      continue
    }

    if (-not $app.Proc) {
      # A build or migration failed earlier; try again.
      Restart-App 'previous start did not complete'
    } elseif ($app.Proc.HasExited) {
      Restart-App "process exited with code $($app.Proc.ExitCode)"
    } elseif (((Get-Date) - $app.Started).TotalSeconds -ge $StartupGraceSec) {
      if (Test-Healthy) {
        $app.Failures = 0
      } else {
        $app.Failures++
        if ($app.Failures -ge $FailuresBeforeRestart) {
          Restart-App "no response from $healthUrl for $($app.Failures) checks"
        }
      }
    }
    Save-State
  }
} finally {
  Stop-App
  Write-Log 'supervisor stopped'
  $mutex.ReleaseMutex()
}
