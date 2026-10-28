# 자동 완주 테스트: 설치된 Edge/Chrome 을 headless 로 띄워 dist/mecha.html?autotest=1 을 열고,
#  페이지가 document.title 에 남기는 'AUTOTEST PASS ...' / 'AUTOTEST FAIL <이유>' 를 원격 디버깅 목록(/json/list)으로 읽는다.
#  종료 코드: 0 PASS, 1 FAIL, 2 브라우저 없음 / 시간 초과
#
#  & .\tools\autotest.ps1                      (build.ps1 -Test 가 빌드 후 부른다)
#  & .\tools\autotest.ps1 -Browser chrome -Gl swiftshader -Timeout 300
#
#  WebGL: -Gl auto(기본) 는 먼저 기본 GPU 경로로 열고, 렌더러를 못 띄우면(AUTOTEST FAIL boot) SwiftShader(소프트웨어 WebGL)로 다시 연다
param(
  [string]$Page = (Join-Path $PSScriptRoot '..\dist\mecha.html'),
  [ValidateSet('auto', 'edge', 'chrome')][string]$Browser = 'auto',
  [ValidateSet('auto', 'gpu', 'swiftshader')][string]$Gl = 'auto',
  [int]$Timeout = 300
)
$ErrorActionPreference = 'Stop'

$cands = @()
if ($Browser -ne 'chrome') { $cands += "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
if ($Browser -ne 'edge') { $cands += "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
$exe = $cands | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $exe) { Write-Host 'AUTOTEST FAIL Edge/Chrome 을 찾지 못함'; exit 2 }
$Page = (Resolve-Path $Page).Path
$url = ([Uri]$Page).AbsoluteUri + '?autotest=1'

function FreePort { $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0); $l.Start(); $p = $l.LocalEndpoint.Port; $l.Stop(); $p }

function RunOnce([string]$mode) {
  $port = FreePort
  $prof = Join-Path ([IO.Path]::GetTempPath()) ("mf-autotest-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $argv = @('--headless=new', "--remote-debugging-port=$port", "--user-data-dir=`"$prof`"", '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--mute-audio', '--window-size=960,540', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows')
  if ($mode -eq 'swiftshader') { $argv += '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' }
  else { $argv += '--ignore-gpu-blocklist', '--enable-gpu' }
  $argv += "`"$url`""
  Write-Host ("[{0}] {1} ({2})" -f $mode, (Split-Path $exe -Leaf), $url)
  $proc = Start-Process -FilePath $exe -ArgumentList $argv -PassThru -WindowStyle Hidden
  $title = $null; $t0 = Get-Date; $last = ''
  try {
    while (((Get-Date) - $t0).TotalSeconds -lt $Timeout) {
      Start-Sleep -Milliseconds 1000
      try { $list = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 3 } catch { continue }
      $pg = @($list) | Where-Object { $_.type -eq 'page' -and $_.url -like '*autotest=1*' } | Select-Object -First 1
      if (-not $pg) { continue }
      if ($pg.title -ne $last) { $last = $pg.title }
      if ($pg.title -like 'AUTOTEST *') { $title = $pg.title; break }
      if ($proc.HasExited) { break }
    }
  } finally {
    if (-not $proc.HasExited) { & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null }
    for ($i = 0; $i -lt 10 -and (Test-Path $prof); $i++) { try { Remove-Item -Recurse -Force $prof -ErrorAction Stop } catch { Start-Sleep -Milliseconds 300 } }
  }
  if (-not $title) { $title = "AUTOTEST TIMEOUT ${Timeout}s (마지막 제목: $last)" }
  return $title
}

$modes = if ($Gl -eq 'auto') { @('gpu', 'swiftshader') } else { @($Gl) }
$title = $null
foreach ($m in $modes) {
  $title = RunOnce $m
  Write-Host $title
  if ($title -notlike 'AUTOTEST FAIL boot*') { break } # 렌더러를 못 띄운 경우에만 다음 방법으로
}
if ($title -like 'AUTOTEST PASS*') { exit 0 }
if ($title -like 'AUTOTEST FAIL*') { exit 1 }
exit 2
