# bds-lab in one command, on a Windows 10/11 machine that has nothing yet (PowerShell 5.1 or 7, no administrator):
#
#   irm https://raw.githubusercontent.com/noknoh12345-afk/bds-lab/main/install.ps1 | iex
#
# It gets the lab (git when there is one, a zip when not), Node.js 22 (lab.cmd fetches it into the lab's own folder), the
# server, and then proves the whole thing on a real server (selftest, 2-3 minutes). Safe to run again: the same command
# updates the lab and repairs a half-made one. Linux / macOS / WSL: install.sh.
#
#   $env:BDS_LAB_DIR   = '<folder>'       where (default ~\bds-lab)
#   $env:BDS_LAB_REF   = '<branch|tag|commit>'   which version (default main)
#   $env:BDS_LAB_REPO  = '<owner/repo>'   a fork (default noknoh12345-afk/bds-lab)
#   $env:BDS_LAB_STAGE = 'code|doctor|setup|selftest'   stop after that step (default selftest: everything)
#   $env:BDS_LAB_NO_GIT = '1'             take the zip even when git is here
#   $env:BDS_LAB_LABS = 'bds,end,ll'      which labs (default bds): end = Endstone plugins, ll = LeviLamina mods; bds must work,
#                                         end and ll that cannot be set up here are said and the install still finishes

function Install-BdsLab {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # (Invoke-WebRequest's progress bar makes PowerShell 5.1 downloads many times slower)
  function Say($m) { Write-Host $m }
  function Fail($m) { Write-Host ''; Write-Host "ERR $m" -ForegroundColor Red; throw 'bds-lab install stopped' }
  function Or($a, $b) { if ($a) { $a } else { $b } }

  $repo = Or $env:BDS_LAB_REPO 'noknoh12345-afk/bds-lab'
  $ref = Or $env:BDS_LAB_REF 'main'
  $dir = Or $env:BDS_LAB_DIR (Join-Path $HOME 'bds-lab')
  $stage = Or $env:BDS_LAB_STAGE 'selftest'
  $labs = @((Or $env:BDS_LAB_LABS 'bds') -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  foreach ($l in $labs) { if (@('bds', 'end', 'll') -notcontains $l) { Fail "BDS_LAB_LABS: bds, end or ll (got $l)" } }
  if (@('code', 'doctor', 'setup', 'selftest') -notcontains $stage) { Fail "BDS_LAB_STAGE=${stage}: one of code doctor setup selftest" }

  # ---- 1. which machine ----
  if ($PSVersionTable.PSVersion.Major -ge 6 -and -not $IsWindows) { Fail "this is not Windows: run   curl -fsSL https://raw.githubusercontent.com/$repo/$ref/install.sh | sh" }
  if (-not [Environment]::Is64BitOperatingSystem) { Fail 'a 64-bit Windows is needed (the Bedrock server and Node.js 22 are 64-bit programs)' }
  if ([Environment]::OSVersion.Version.Major -lt 10) { Fail 'Windows 10 or 11 is needed' }
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  Say "bds-lab: windows-$($env:PROCESSOR_ARCHITECTURE) -> $dir ($repo@$ref)"

  # ---- 2. the lab's files ----
  $git = Get-Command git -ErrorAction SilentlyContinue
  $isCommit = $ref -match '^[0-9a-f]{7,40}$'
  function Get-Zip {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("bds-lab-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zip = Join-Path $tmp 'lab.zip'
    try { Invoke-WebRequest -UseBasicParsing "https://github.com/$repo/archive/$ref.zip" -OutFile $zip }
    catch { Fail "cannot download https://github.com/$repo/archive/$ref.zip (no network to github.com, or no such branch/tag: $ref): $($_.Exception.Message)" }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $top = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
    if (-not $top) { Fail 'the download did not unpack: run this command again' }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item -Path (Join-Path $top.FullName '*') -Destination $dir -Recurse -Force
    Remove-Item -Recurse -Force $tmp
  }
  if ((Test-Path (Join-Path $dir '.git')) -and $git) {
    Say "updating $dir (git pull)"
    & git -C $dir pull --ff-only --autostash
    if ($LASTEXITCODE -ne 0) { Say 'W git pull did not go through (local changes, or another branch): the lab stays as it is; update by hand later' }
  } elseif (Test-Path (Join-Path $dir 'lab.mjs')) {
    Say "updating $dir (zip over it: your addons and the caches stay)"
    Get-Zip
  } else {
    if ((Test-Path $dir) -and (Get-ChildItem -Force $dir | Select-Object -First 1)) { Fail "$dir exists and is not a bds-lab: choose another folder with `$env:BDS_LAB_DIR='<folder>'" }
    if ($git -and -not $env:BDS_LAB_NO_GIT -and -not $isCommit) {
      Say 'getting the lab (git clone)'
      # (core.autocrlf off for this clone: the lab's .sh files must keep LF for WSL and Git Bash; .gitattributes says the same)
      & git clone --depth 1 --branch $ref -c core.autocrlf=false "https://github.com/$repo.git" $dir
      if ($LASTEXITCODE -ne 0) { Say 'W git clone failed: taking the zip instead'; if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }; Get-Zip }
    } else {
      Say 'getting the lab (zip)'
      Get-Zip
    }
  }
  if (-not (Test-Path (Join-Path $dir 'lab.mjs'))) { Fail "$dir has no lab.mjs after the download: is $repo@$ref a bds-lab?" }
  $lab = Join-Path $dir 'lab.cmd'
  function Done($m) {
    Say ''
    Write-Host "OK $m" -ForegroundColor Green
    Say "   folder:  $dir"
    Say "   next:    cd `"$dir`"; .\lab.cmd status"
    Say '   then open this folder with your AI (Claude Code, Codex ...) and ask for the addon you want: it reads AGENTS.md.'
  }
  if ($stage -eq 'code') { Done "the lab's files are in place (no server yet)"; return }

  # ---- 3. the Visual C++ runtime the Bedrock server is linked against ----
  $sys = Join-Path $env:WINDIR 'System32'
  if (-not ((Test-Path (Join-Path $sys 'vcruntime140_1.dll')) -and (Test-Path (Join-Path $sys 'msvcp140.dll')))) {
    Say 'the Microsoft Visual C++ runtime (2015-2022, x64) is missing: bedrock_server.exe does not start without it'
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    $ok = $false
    if ($winget) {
      Say 'installing it with winget (Windows may ask for permission)...'
      & winget install --id Microsoft.VCRedist.2015+.x64 -e --silent --accept-package-agreements --accept-source-agreements
      $ok = ($LASTEXITCODE -eq 0)
    }
    if (-not $ok) { Fail 'install the Visual C++ runtime from https://aka.ms/vs/17/release/vc_redist.x64.exe , then run this command again' }
  }

  # ---- 4. what this machine can do, in the lab's own words (the first lab.cmd run fetches Node.js 22 into .lab-node\) ----
  Push-Location $dir
  try {
    & $lab doctor
    if ($LASTEXITCODE -ne 0) { Fail 'doctor found something this machine lacks: each MISSING line above has its fix (-> ...). Then run this command again.' }
    if ($stage -eq 'doctor') { Done 'doctor is clean (no server yet)'; return }

    # ---- 5. the server and the tools ----
    & $lab bds setup
    if ($LASTEXITCODE -ne 0) { Fail 'setup did not finish: the lines above say why (a BLOCKED line is the network: a proxy or firewall). Then run this command again.' }
    # the other labs asked for: each on its own, never the end of the install
    $extraOk = @(); $extraBad = @()
    foreach ($l in $labs) {
      if ($l -eq 'bds') { continue }
      if (-not (Test-Path (Join-Path $dir "$l\flavor.mjs"))) { Say "W ${l}: this branch has no $l lab (the dev branch has: `$env:BDS_LAB_REF='dev')"; $extraBad += $l; continue }
      Say "setting up the $l lab..."
      & $lab $l setup
      if ($LASTEXITCODE -eq 0) { $extraOk += $l } else { Say "W ${l}: not set up here (above: what it needs; .\lab.cmd $l doctor). The rest of the lab works."; $extraBad += $l }
    }
    if ($stage -eq 'setup') { Done 'the server is set up (not yet proven: .\lab.cmd selftest)'; return }

    # ---- 6. proof: a real server, real clients, the kit ----
    Say 'selftest: starting a real server and joining it (2-3 minutes; if Windows Firewall asks about bedrock_server.exe, either answer works: the lab uses this machine only)...'
    & $lab selftest
    if ($LASTEXITCODE -ne 0) { Fail "selftest failed on this machine: the report is $dir\.lab\selftest.txt (bds\.lab\selftest.txt). The lab is installed; please open an issue with that file: https://github.com/$repo/issues" }
    foreach ($l in $extraOk) { Say "selftest of the $l lab..."; & $lab $l selftest; if ($LASTEXITCODE -ne 0) { Say "W ${l}: its selftest failed (report: $dir\$l\.lab\selftest.txt). bds works; $l needs a look." } }
    if ($extraBad.Count) { Say "   not set up here: $($extraBad -join ' ') (.\lab.cmd <lab> doctor)" }
    Done 'installed and proven on a real server'
  } finally { Pop-Location }
}

try { Install-BdsLab } catch { if ("$_" -ne 'bds-lab install stopped') { Write-Host "ERR $_" -ForegroundColor Red }; $global:LASTEXITCODE = 1; if ($env:BDS_LAB_CI) { exit 1 } }
