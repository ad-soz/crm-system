<#
  Manage the always-on CRM (production mode, http://localhost:5173).

    .\scripts\crm-services.ps1 install     Run automatically at Windows sign-in, and start now
    .\scripts\crm-services.ps1 uninstall   Stop and remove the automatic start
    .\scripts\crm-services.ps1 start       Start now
    .\scripts\crm-services.ps1 stop        Stop now (starts again at next sign-in)
    .\scripts\crm-services.ps1 restart     Restart the app (also reloads the Prisma client)
    .\scripts\crm-services.ps1 update      Rebuild from the current code, then restart
    .\scripts\crm-services.ps1 status      Show what is running and whether it responds
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('install', 'uninstall', 'start', 'stop', 'restart', 'update', 'status')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$TaskName = 'CRM System Services'
$root = Split-Path -Parent $PSScriptRoot
$supervisor = Join-Path $PSScriptRoot 'supervisor.ps1'
$logDir = Join-Path $root 'logs'
$stateFile = Join-Path $logDir 'supervisor.state.json'
$startupShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'CRM System Services.lnk'
$launchArgs = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$supervisor`""
$appUrl = 'http://localhost:5173/'
$healthUrl = 'http://127.0.0.1:5173/api/health'

. "$PSScriptRoot\service-tools.ps1"

function Get-Task { Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }

function Get-SupervisorProcess {
  if (-not (Test-Path $stateFile)) { return $null }
  $state = Get-Content $stateFile -Raw | ConvertFrom-Json
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.supervisorPid)" -ErrorAction SilentlyContinue
  # Guard against a reused PID after a reboot.
  if ($proc -and $proc.CommandLine -like '*supervisor.ps1*') { return $proc }
  return $null
}

function Start-Supervisor {
  # Starting on purpose cancels any earlier deliberate stop.
  Clear-StopRequest $root
  if (Get-SupervisorProcess) { Write-Host 'Already running.'; return }
  if (Get-Task) {
    Start-ScheduledTask -TaskName $TaskName
  } else {
    Start-Process powershell.exe -ArgumentList $launchArgs -WindowStyle Hidden
  }
  Write-Host 'Starting. It takes about 30 seconds (longer if it needs to build); check with: status'
}

function Stop-Supervisor {
  # The scheduled task restarts the supervisor about a minute after it ends (that
  # is what keeps the app up after a crash). Leave a note first, so that restart
  # sees the stop was deliberate and does nothing. `start` removes the note.
  Set-StopRequest $root
  if (Get-Task) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  # Stopping the task ends PowerShell but not the app it launched, so stop
  # the whole process tree explicitly.
  $proc = Get-SupervisorProcess
  if ($proc) { Stop-ProcessTree $proc.ProcessId }
  if (Test-Path $stateFile) {
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    if ($state.app) {
      $info = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.app)" -ErrorAction SilentlyContinue
      if ($info -and $info.Name -eq 'node.exe') { Stop-ProcessTree $state.app }
    }
    Remove-Item $stateFile -Force
  }
  Write-Host 'Stopped. It stays stopped until you run: .\scripts\crm-services.ps1 start'
}

switch ($Action) {
  'install' {
    $user = "$env:USERDOMAIN\$env:USERNAME"
    $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $launchArgs -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $trigger.Delay = 'PT30S'   # let sign-in and OneDrive settle first
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
      -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    try {
      Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $trigger -Settings $settings `
        -Principal $principal -Force `
        -Description "Keeps the CRM running. Managed by $PSCommandPath" | Out-Null
      if (Test-Path $startupShortcut) { Remove-Item $startupShortcut -Force }
      Write-Host "Installed Task Scheduler task '$TaskName' (runs at sign-in for $user)."
    } catch {
      # Some machines don't let standard users create sign-in tasks. The
      # Startup folder does the same job without admin rights.
      $shell = New-Object -ComObject WScript.Shell
      $link = $shell.CreateShortcut($startupShortcut)
      $link.TargetPath = 'powershell.exe'
      $link.Arguments = $launchArgs
      $link.WorkingDirectory = $root
      $link.WindowStyle = 7
      $link.Save()
      Write-Host "Task Scheduler refused ($($_.Exception.Message.Trim())). Added a Startup folder shortcut instead."
    }
    Start-Supervisor
  }
  'uninstall' {
    Stop-Supervisor
    if (Get-Task) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
    if (Test-Path $startupShortcut) { Remove-Item $startupShortcut -Force }
    Write-Host 'Removed. The CRM will no longer start automatically.'
  }
  'start' { Start-Supervisor }
  'stop' { Stop-Supervisor }
  'restart' {
    if (-not (Get-SupervisorProcess)) { Start-Supervisor; return }
    Set-Content -Path (Join-Path $logDir 'restart.request') -Value 'app'
    Write-Host 'Restart requested. It happens within 15 seconds.'
  }
  'update' {
    Stop-Supervisor
    Write-Host 'Building...'
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $ok = (Invoke-NativeLogged $root 'npm run build' (Join-Path $logDir 'build.log')) -eq 0
    if (-not $ok) {
      Write-Host "Build failed; see $logDir\build.log. Starting the previous build."
    } else {
      Write-Host 'Build succeeded.'
    }
    Start-Supervisor
  }
  'status' {
    $task = Get-Task
    $auto = if ($task) { "Task Scheduler ($($task.State))" }
            elseif (Test-Path $startupShortcut) { 'Startup folder shortcut' }
            else { 'not installed' }
    Write-Host "Automatic start : $auto"
    $proc = Get-SupervisorProcess
    Write-Host ("Supervisor      : " + $(if ($proc) { "running (pid $($proc.ProcessId))" } else { 'not running' }))
    foreach ($check in @(@('App', $appUrl), @('API', $healthUrl))) {
      try {
        $res = Invoke-WebRequest -Uri $check[1] -UseBasicParsing -TimeoutSec 5
        Write-Host ("{0,-16}: up ({1}) {2}" -f $check[0], $res.StatusCode, $check[1])
      } catch {
        Write-Host ("{0,-16}: DOWN {1}" -f $check[0], $check[1])
      }
    }
    Write-Host "Logs            : $logDir"
  }
}
