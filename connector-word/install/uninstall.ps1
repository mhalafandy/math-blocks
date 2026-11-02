<#
.SYNOPSIS
  Removes the MathBlocks Word connector for the current user. Close Word first.
#>
$ErrorActionPreference = 'Stop'
$clsid  = '{B18397FB-F3F1-4634-AC20-9DEA0673976A}'
$progId = 'MathBlocks.WordConnector'

foreach ($view in 'Registry64', 'Registry32') {
    $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey('CurrentUser', $view)
    foreach ($key in "Software\Classes\CLSID\$clsid", "Software\Classes\$progId", "Software\Microsoft\Office\Word\Addins\$progId") {
        $root.DeleteSubKeyTree($key, $false)
    }
    $root.Close()
}
$target = Join-Path $env:LOCALAPPDATA 'MathBlocksWordAddin'
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
Write-Host "MathBlocks Word connector removed." -ForegroundColor Green
