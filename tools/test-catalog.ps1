$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $repo 'host\bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$testExe = Join-Path $bin 'ThemeCatalogTests.exe'
& $compiler /nologo /target:exe /codepage:65001 /r:System.Web.Extensions.dll /out:$testExe (Join-Path $repo 'host\Themes.cs') (Join-Path $repo 'tests\ThemeCatalogTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Catalog test compilation failed' }
& $testExe (Join-Path $repo 'prototype')
if ($LASTEXITCODE -ne 0) { throw 'Catalog tests failed' }
