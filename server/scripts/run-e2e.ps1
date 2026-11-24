# Run the e2e suite against an isolated, throwaway database so it never touches
# the live CRM data in %LOCALAPPDATA%\CRM. Builds a fresh DB from the Prisma
# migrations + seed, runs the tests, then removes the temp folder.
$ErrorActionPreference = 'Stop'

# Make sure Node/npm are on PATH even in a bare shell.
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

$serverDir = Split-Path $PSScriptRoot -Parent
$testDir = Join-Path ([System.IO.Path]::GetTempPath()) ("crm-e2e-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $testDir | Out-Null
$dbFile = Join-Path $testDir "crm-e2e.db"

# Point the app at the throwaway database and data folder.
$env:DATABASE_URL = "file:$($dbFile -replace '\\','/')"
$env:CRM_DATA_DIR = $testDir
$env:CRM_ENV_FILE = Join-Path $testDir "crm.env"
$env:JWT_SECRET = "e2e-test-secret-not-for-production"
# Prisma prints an 'update available' box on the error stream; that is not a failure.
$env:PRISMA_HIDE_UPDATE_MESSAGE = '1'

Set-Content -Path $env:CRM_ENV_FILE -Value "JWT_SECRET=$($env:JWT_SECRET)`nSCHEMA_EDITING_ENABLED=false"

Write-Host "e2e database: $dbFile"

try {
  Push-Location $serverDir

  # Build the schema into the throwaway DB, then seed the reference lists and
  # the sample records the tests expect (6 stages, a task using priority-high, etc.).
  # Under 'Stop', any text a program writes to the error stream becomes a failure, even when it
  # succeeds. Judge these steps by their exit code instead (the same lesson as the service scripts).
  $ErrorActionPreference = 'Continue'
  cmd /c "npx prisma migrate deploy" 2>&1 | Write-Host
  if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed" }

  cmd /c "npx prisma db seed" 2>&1 | Write-Host
  if ($LASTEXITCODE -ne 0) { throw "prisma db seed failed" }
  $ErrorActionPreference = 'Stop'

  cmd /c "npx jest --config ./test/jest-e2e.json --runInBand > `"$testDir\jest-out.txt`" 2>&1"
  $testExit = $LASTEXITCODE
  Get-Content "$testDir\jest-out.txt" | Write-Host
}
finally {
  Pop-Location
  # Clean up the throwaway database and folder.
  Remove-Item -Recurse -Force $testDir -ErrorAction SilentlyContinue
}

exit $testExit
