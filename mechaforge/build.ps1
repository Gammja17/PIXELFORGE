# build.mjs 의 PowerShell 판 (node 가 없는 PC 용). 결과물은 build.mjs 와 같다.
#   powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1
#   dist/mecha.html, dist/mecha.artifact.html, index.html
param([string]$Root = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false)
$ML = [Text.RegularExpressions.RegexOptions]::Multiline

# posix 식 경로 정규화 (a/b/../c → a/c)
function Norm([string]$p) {
  $out = [Collections.Generic.List[string]]::new()
  foreach ($s in ($p -replace '\\', '/').Split('/')) {
    if ($s -eq '' -or $s -eq '.') { continue }
    if ($s -eq '..' -and $out.Count -and $out[$out.Count - 1] -ne '..') { $out.RemoveAt($out.Count - 1) } else { $out.Add($s) }
  }
  return ($out -join '/')
}
function DirOf([string]$p) { $i = $p.LastIndexOf('/'); if ($i -lt 0) { '.' } else { $p.Substring(0, $i) } }
function Q([string]$s) { '"' + $s.Replace('\', '\\').Replace('"', '\"') + '"' }

function Bundle([string]$entry) {
  $mods = @{}; $order = [Collections.Generic.List[string]]::new()
  function Load([string]$path) {
    $path = Norm $path
    if ($mods.ContainsKey($path)) { return }
    $mods[$path] = $null
    $src = [IO.File]::ReadAllText((Join-Path $Root $path), $utf8)
    $deps = [Collections.Generic.List[string]]::new(); $exp = [Collections.Generic.List[string]]::new()
    $here = DirOf $path
    $rel = { param($p) Norm "$here/$p" }
    $src = [regex]::Replace($src, "^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';", { param($m) $r = & $rel $m.Groups[2].Value; $deps.Add($r); "const $($m.Groups[1].Value) = __m[$(Q $r)];" }, $ML)
    $src = [regex]::Replace($src, "^import\s*\{([^}]+)\}\s*from\s*'([^']+)';", { param($m) $r = & $rel $m.Groups[2].Value; $deps.Add($r); $n = [regex]::Replace($m.Groups[1].Value, '(\w+)\s+as\s+(\w+)', '$1: $2'); "const {$n} = __m[$(Q $r)];" }, $ML)
    $src = [regex]::Replace($src, "^export\s*\{([^}]+)\}\s*from\s*'([^']+)';", { param($m) $r = & $rel $m.Groups[2].Value; $deps.Add($r); foreach ($n in $m.Groups[1].Value.Split(',')) { $n = $n.Trim(); if ($n) { $exp.Add("${n}: __m[$(Q $r)].$n") } }; '' }, $ML)
    $src = [regex]::Replace($src, "^export\s*\*\s*from\s*'([^']+)';", { param($m) $r = & $rel $m.Groups[1].Value; $deps.Add($r); $exp.Add("...__m[$(Q $r)]"); '' }, $ML)
    $src = [regex]::Replace($src, '^export\s+(const|let|class|function)\s+(\w+)', { param($m) $exp.Add($m.Groups[2].Value); "$($m.Groups[1].Value) $($m.Groups[2].Value)" }, $ML)
    if ([regex]::IsMatch($src, '^\s*(import|export)\s', $ML)) { throw "${path}: 번들러가 처리하지 못한 import/export 구문이 있습니다" }
    foreach ($d in $deps) { Load $d }
    $order.Add($path)
    $mods[$path] = "__m[$(Q $path)] = (() => {`n$src`nreturn { $($exp -join ', ') };`n})();`n"
  }
  Load $entry
  $body = ($order | ForEach-Object { $mods[$_] }) -join "`n"
  return ("(() => {`n'use strict';`nconst __m = {};`n$body})();`n").Replace('</script', '<\/script')
}

function Emit($entry, $page, $out, $dev) {
  $html = [IO.File]::ReadAllText((Join-Path $Root $page), $utf8)
  $js = Bundle $entry
  $head = [regex]::Match($html, '^[\s\S]*?</style>').Value
  $body = $html.Substring($head.Length)
  $doc = { param($script) "<!doctype html>`n<html lang=`"ko`">`n<head>`n<meta charset=`"utf-8`">`n<meta name=`"viewport`" content=`"width=device-width, initial-scale=1, viewport-fit=cover`">`n$head`n</head>`n<body>`n$body`n$script`n</body>`n</html>`n" }
  [void][IO.Directory]::CreateDirectory((Join-Path $Root 'dist'))
  [IO.File]::WriteAllText((Join-Path $Root "dist/$out.html"), (& $doc "<script>`n$js</script>"), $utf8)
  [IO.File]::WriteAllText((Join-Path $Root "dist/$out.artifact.html"), "$html`n<script>`n$js</script>`n", $utf8)
  [IO.File]::WriteAllText((Join-Path $Root $dev), (& $doc "<script type=`"module`" src=`"./$entry`"></script>"), $utf8)
  Write-Host ("{0}: {1:N1}KB" -f $out, ($js.Length / 1024))
}

Emit 'game/ui.js' 'game/page.html' 'mecha' 'index.html'
