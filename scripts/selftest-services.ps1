# Self-test for the supervisor and service-management helpers. Uses throwaway
# folders only; it never starts, stops or builds the real app.
#   .\scripts\selftest-services.ps1
#
# It runs with $ErrorActionPreference = 'Stop', the same setting crm-services.ps1
# uses, because that setting is what turned harmless build output into a failure.
$ErrorActionPreference = 'Stop'

$failures = New-Object System.Collections.Generic.List[string]
function Check([string]$name, $result) {
  $ok = [bool]@($result)[-1]
  if ($ok) { Write-Host "  ok    $name" } else { Write-Host "  FAIL  $name"; $failures.Add($name) }
}

. (Join-Path $PSScriptRoot 'service-tools.ps1')

# 1. Every script must parse.
foreach ($f in 'supervisor.ps1', 'crm-services.ps1', 'service-tools.ps1', 'backup-tools.ps1', 'restore-backup.ps1') {
  $errors = $null; $tokens = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $f), [ref]$tokens, [ref]$errors)
  Check "$f parses" ($errors.Count -eq 0)
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('crm-svc-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$log = Join-Path $tmp 'out.log'

try {
  # 2. Harmless error-stream output is not a failure (the D2 bug).
  $threw = $false
  try { $code = Invoke-NativeLogged $tmp 'echo noisy warning 1>&2 && exit /b 0' $log } catch { $threw = $true }
  Check 'text on the error stream does not throw under strict error handling' (-not $threw)
  Check 'and the exit code is reported as success' ($code -eq 0)
  Check 'and the text is kept in the log' ((Get-Content $log -Raw) -match 'noisy warning')

  # 3. A real failure is still reported, with its code and output.
  $code = Invoke-NativeLogged $tmp 'echo something broke 1>&2 && exit /b 7' $log
  Check 'a failing command returns its exit code' ($code -eq 7)
  Check 'and its output is available to explain why' ((Get-LogTail $log) -match 'something broke')

  # 4. The preference is restored afterwards.
  Check 'strict error handling is restored after a command' ($ErrorActionPreference -eq 'Stop')

  # 5. Stopping a process that is already gone is not an error.
  $threw = $false
  try { Stop-ProcessTree 2147483000 } catch { $threw = $true }
  Check 'killing a process that no longer exists does not throw' (-not $threw)

  # 6. Deliberate-stop note.
  Check 'no note means no stop' (-not (Test-StopRequested $tmp))
  Set-StopRequest $tmp
  Check 'a stop request is seen during the same sign-in' (Test-StopRequested $tmp)
  Clear-StopRequest $tmp
  Check 'clearing it (what start does) cancels the stop' (-not (Test-StopRequested $tmp))
  New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'logs') | Out-Null
  Set-Content -LiteralPath (Get-StopFlagPath $tmp) -Value '2020-01-01T00:00:00.0000000Z|99'
  Check 'a note left by an earlier sign-in is ignored' (-not (Test-StopRequested $tmp))
  Check 'and is removed, so it can never keep the app off for good' (-not (Test-Path (Get-StopFlagPath $tmp)))
  Set-Content -LiteralPath (Get-StopFlagPath $tmp) -Value ''
  Check 'an empty or damaged note is not treated as a stop' (-not (Test-StopRequested $tmp))

  # 7. Build judged by its output, retried once.
  $root = Join-Path $tmp 'app'
  New-Item -ItemType Directory -Path $root | Out-Null
  $messages = New-Object System.Collections.Generic.List[string]
  $say = { param($m) $messages.Add($m) }
  $makeBuild = 'mkdir server\dist & mkdir client\dist & echo x> server\dist\main.js & echo x> client\dist\index.html'

  Check 'a build that exits 0 but produces nothing is not trusted' (-not (Invoke-BuildStep $root $log $say 0 'exit /b 0'))
  Check 'and the reason is logged for both attempts' (($messages | Where-Object { $_ -match 'output present: False' }).Count -eq 2)

  Remove-Item -Recurse -Force (Join-Path $root 'server'), (Join-Path $root 'client') -ErrorAction SilentlyContinue
  Check 'a build that produces the outputs succeeds' (Invoke-BuildStep $root $log $say 0 $makeBuild)
  Check 'Test-BuildPresent agrees' (Test-BuildPresent $root)

  # First attempt fails (as when two builds collide), second succeeds.
  Remove-Item -Recurse -Force (Join-Path $root 'server'), (Join-Path $root 'client') -ErrorAction SilentlyContinue
  $marker = Join-Path $tmp 'tried-once'
  $flaky = "if exist `"$marker`" ($makeBuild) else (echo. > `"$marker`" & exit /b 1)"
  $messages.Clear()
  Check 'a build that fails once then works is retried and succeeds' (Invoke-BuildStep $root $log $say 0 $flaky)
  Check 'and the first failure was logged' (($messages | Where-Object { $_ -match 'attempt 1 failed' }).Count -eq 1)
  # 10. A leftover app is recognised by how the supervisor starts it, and nothing else is.
  $r = 'C:\crm\project'
  Check 'the app as started by the supervisor (node dist/main.js) is recognised' (Test-IsThisProjectsApp 'node.exe' 'node.exe dist/main.js' $r)
  Check 'also with a quoted path and backslashes' (Test-IsThisProjectsApp 'node.exe' '"C:\Program Files\nodejs\node.exe" dist\main.js' $r)
  Check 'a node process run from this project folder is recognised' (Test-IsThisProjectsApp 'node.exe' "node $r\server\dist\main.js --x" $r)
  Check 'another node program is left alone' (-not (Test-IsThisProjectsApp 'node.exe' 'node C:\other\server.js' $r))
  Check 'a similarly named file is left alone' (-not (Test-IsThisProjectsApp 'node.exe' 'node mydist/main.jsx' $r))
  Check 'a program that is not node is left alone' (-not (Test-IsThisProjectsApp 'chrome.exe' 'chrome.exe dist/main.js' $r))
  Check 'an unreadable command line is left alone' (-not (Test-IsThisProjectsApp 'node.exe' '' $r))
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

if ($failures.Count -gt 0) { Write-Host "`n$($failures.Count) check(s) failed."; exit 1 }
Write-Host "`nAll service script checks passed."
