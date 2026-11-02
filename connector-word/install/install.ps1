<#
.SYNOPSIS
  Installs the MathBlocks Word connector for the current user (no administrator rights needed).

.DESCRIPTION
  Copies the connector DLL to %LOCALAPPDATA%\MathBlocks\Connector and registers it as a COM
  add-in for Word, in both the 64-bit and 32-bit registry views (works for 32- and 64-bit Office).
  Close Word before running. Run:
      powershell -ExecutionPolicy Bypass -File install.ps1
  or, if the DLL is elsewhere:
      powershell -ExecutionPolicy Bypass -File install.ps1 -DllPath C:\path\MathBlocks.WordConnector.dll
#>
param(
    [string]$DllPath
)
$ErrorActionPreference = 'Stop'

if (-not $DllPath) {
    $candidates = @(
        (Join-Path $PSScriptRoot 'MathBlocks.WordConnector.dll'),
        (Join-Path $PSScriptRoot '..\src\bin\Release\net48\MathBlocks.WordConnector.dll')
    )
    $DllPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $DllPath) { throw "MathBlocks.WordConnector.dll not found. Pass -DllPath." }
}

if (Get-Process WINWORD -ErrorAction SilentlyContinue) {
    Write-Warning "Word is running. Close Word, then run this script again."
    exit 1
}

$target = Join-Path $env:LOCALAPPDATA 'MathBlocks\Connector'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item (Resolve-Path $DllPath).Path $target -Force
$pdb = [IO.Path]::ChangeExtension((Resolve-Path $DllPath).Path, '.pdb')
if (Test-Path $pdb) { Copy-Item $pdb $target -Force }
$dll = Join-Path $target 'MathBlocks.WordConnector.dll'
Unblock-File $dll   # remove the "downloaded from the internet" mark, or .NET refuses to load it

$clsid    = '{B18397FB-F3F1-4634-AC20-9DEA0673976A}'
$progId   = 'MathBlocks.WordConnector'
$class    = 'MathBlocks.WordConnector.Connect'
$assembly = [System.Reflection.AssemblyName]::GetAssemblyName($dll).FullName
$codeBase = ([Uri]$dll).AbsoluteUri

foreach ($view in 'Registry64', 'Registry32') {
    $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey('CurrentUser', $view)

    $k = $root.CreateSubKey("Software\Classes\CLSID\$clsid")
    $k.SetValue('', $class)
    $k.CreateSubKey('ProgId').SetValue('', $progId)
    $k.CreateSubKey('Implemented Categories\{62C8FE65-4EBB-45e7-B440-6E39B2CDBF29}') | Out-Null
    $ip = $k.CreateSubKey('InprocServer32')
    $ip.SetValue('', 'mscoree.dll')
    $ip.SetValue('ThreadingModel', 'Both')
    $ip.SetValue('Class', $class)
    $ip.SetValue('Assembly', $assembly)
    $ip.SetValue('RuntimeVersion', 'v4.0.30319')
    $ip.SetValue('CodeBase', $codeBase)

    $p = $root.CreateSubKey("Software\Classes\$progId")
    $p.SetValue('', $class)
    $p.CreateSubKey('CLSID').SetValue('', $clsid)

    $a = $root.CreateSubKey("Software\Microsoft\Office\Word\Addins\$progId")
    $a.SetValue('FriendlyName', 'MathBlocks')
    $a.SetValue('Description', 'MathBlocks equation editor connector')
    $a.SetValue('LoadBehavior', 3, [Microsoft.Win32.RegistryValueKind]::DWord)

    $root.Close()
}

Write-Host "MathBlocks Word connector installed:" -ForegroundColor Green
Write-Host "  $dll"
# Word stops loading an add-in after a load error (LoadBehavior becomes 2). Reinstalling resets it.
Write-Host "Start Word: a 'MathBlocks' tab should appear on the ribbon."
Write-Host "If it does not, run diagnose.ps1 in this folder and send the report."
