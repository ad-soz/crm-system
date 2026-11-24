# One-off rename tool, kept so the change can be reviewed or repeated.
#   .\codemod.ps1 -Step 1     Contact -> Person     (contacts -> people)
#   .\codemod.ps1 -Step 2     Activity -> Contact   (activities -> contacts)
#
# Step 2 must only run after step 1, so the word "contact" never means two things at once.
# It rewrites source files and renames files/folders to match. It never touches
# prisma\migrations (history), node_modules or dist.
param(
  [Parameter(Mandatory = $true)][ValidateSet(1, 2)][int]$Step,
  [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$roots = 'server\src', 'server\test', 'server\prisma', 'server\scripts', 'client\src'
$extensions = '.ts', '.tsx', '.prisma'

# Ordered rules: plural before singular, specific phrases before general words.
if ($Step -eq 1) {
  $rules = @(
    @('contact(s)', 'people'),
    @('Contacts', 'People'), @('CONTACTS', 'PEOPLE'), @('contacts', 'people'),
    @('Contact', 'Person'), @('CONTACT', 'PERSON'), @('contact', 'person')
  )
  $protect = @('contact@greenenergy.com')   # real data in the sample records: leave exactly as is
} else {
  $rules = @(
    @('An activity', 'A contact'), @('an activity', 'a contact'), @('An Activity', 'A Contact'), @('an Activity', 'a Contact'),
    @('Recent Activity', 'Recent Contacts'), @('No recent activity', 'No recent contacts'),
    @('Activities', 'Contacts'), @('ACTIVITIES', 'CONTACTS'), @('activities', 'contacts'),
    @('Activity', 'Contact'), @('ACTIVITY', 'CONTACT'), @('activity', 'contact')
  )
  $protect = @()
}

function Convert-Text([string]$text) {
  $tokens = @{}
  for ($i = 0; $i -lt $protect.Count; $i++) {
    $token = "@@KEEP$i@@"
    $tokens[$token] = $protect[$i]
    $text = $text.Replace($protect[$i], $token)
  }
  foreach ($r in $rules) { $text = $text.Replace($r[0], $r[1]) }
  foreach ($k in $tokens.Keys) { $text = $text.Replace($k, $tokens[$k]) }
  return $text
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$changed = 0; $replacements = 0
$files = foreach ($r in $roots) {
  Get-ChildItem (Join-Path $root $r) -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $extensions -contains $_.Extension -and $_.FullName -notmatch '\\(node_modules|dist)\\' -and $_.FullName -notmatch 'prisma\\migrations' }
}
foreach ($f in $files) {
  $old = [IO.File]::ReadAllText($f.FullName)
  $new = Convert-Text $old
  if ($new -ne $old) {
    $changed++
    if (-not $WhatIf) { [IO.File]::WriteAllText($f.FullName, $new, $utf8) }
  }
}
Write-Host "step ${Step}: rewrote $changed files"

# Rename files and folders whose names contain the old words (deepest first).
$renamed = 0
$found = foreach ($r in $roots) {
  Get-ChildItem (Join-Path $root $r) -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(node_modules|dist)\\' -and $_.FullName -notmatch 'prisma\\migrations' }
}
# Deepest first, so a folder is renamed only after everything inside it.
$paths = $found | Sort-Object { $_.FullName.Length } -Descending
foreach ($p in $paths) {
  $newName = Convert-Text $p.Name
  if ($newName -ne $p.Name) {
    $renamed++
    Write-Host ("  rename: {0} -> {1}" -f $p.FullName.Replace($root + '\', ''), $newName)
    if (-not $WhatIf) { Rename-Item -LiteralPath $p.FullName -NewName $newName }
  }
}
Write-Host "step ${Step}: renamed $renamed files/folders"
