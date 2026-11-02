<#
.SYNOPSIS
  Collects everything needed to find out why the MathBlocks Word connector does not load.
  Writes the report to the screen and to MathBlocks-diagnostics.txt on the Desktop.
  Run:  powershell -ExecutionPolicy Bypass -File diagnose.ps1
#>
$clsid  = '{B18397FB-F3F1-4634-AC20-9DEA0673976A}'
$progId = 'MathBlocks.WordConnector'
$out = New-Object System.Collections.Generic.List[string]
function W($s) { $out.Add([string]$s); Write-Host $s }

W "=== MathBlocks connector diagnostics $(Get-Date -Format s) ==="
W "Windows: $([Environment]::OSVersion.VersionString)  64-bit OS: $([Environment]::Is64BitOperatingSystem)"
W "This PowerShell is 64-bit: $([Environment]::Is64BitProcess)"
W "User: $env:USERNAME   LOCALAPPDATA: $env:LOCALAPPDATA"
W ".NET Framework release: $((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction SilentlyContinue).Release)"

W "`n--- Word ---"
$word = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Winword.exe' -ErrorAction SilentlyContinue
if ($word) {
    $exe = $word.'(default)'; W "Winword.exe: $exe"
    try { W "Version: $((Get-Item $exe).VersionInfo.ProductVersion)" } catch {}
    try {
        $bytes = [IO.File]::ReadAllBytes($exe)
        $pe = [BitConverter]::ToInt32($bytes, 0x3C); $machine = [BitConverter]::ToUInt16($bytes, $pe + 4)
        W ("Word bitness: " + $(if ($machine -eq 0x8664) { '64-bit' } elseif ($machine -eq 0x14c) { '32-bit' } else { "unknown ($machine)" }))
    } catch { W "Word bitness: could not read ($_)" }
} else { W "Winword.exe not found in App Paths" }
$c2r = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' -ErrorAction SilentlyContinue
if ($c2r) { W "Click-to-Run: platform=$($c2r.Platform) version=$($c2r.VersionToReport) products=$($c2r.ProductReleaseIds)" } else { W "Click-to-Run: not found (MSI install?)" }

W "`n--- Installed file ---"
$dll = Join-Path $env:LOCALAPPDATA 'MathBlocks\Connector\MathBlocks.WordConnector.dll'
W "DLL exists: $(Test-Path $dll)  $dll"
if (Test-Path $dll) {
    W "Blocked (downloaded mark): $([bool](Get-Item $dll -Stream Zone.Identifier -ErrorAction SilentlyContinue))"
    try { W "Assembly: $([Reflection.AssemblyName]::GetAssemblyName($dll).FullName)" } catch { W "Assembly name error: $_" }
}

W "`n--- Registry ---"
foreach ($view in 'Registry64', 'Registry32') {
    $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey('CurrentUser', $view)
    W "[$view]"
    $ip = $root.OpenSubKey("Software\Classes\CLSID\$clsid\InprocServer32")
    if ($ip) { foreach ($n in '', 'Class', 'Assembly', 'RuntimeVersion', 'CodeBase', 'ThreadingModel') { W "  InprocServer32 $n = $($ip.GetValue($n))" } } else { W "  CLSID key MISSING" }
    $p = $root.OpenSubKey("Software\Classes\$progId\CLSID"); W "  ProgID -> $(if ($p) { $p.GetValue('') } else { 'MISSING' })"
    $a = $root.OpenSubKey("Software\Microsoft\Office\Word\Addins\$progId")
    if ($a) { W "  Word Addins: LoadBehavior=$($a.GetValue('LoadBehavior')) FriendlyName=$($a.GetValue('FriendlyName'))" } else { W "  Word Addins key MISSING" }
    $root.Close()
}
foreach ($v in '16.0', '15.0') {
    $dis = Get-ItemProperty "HKCU:\Software\Microsoft\Office\$v\Word\Resiliency\DisabledItems" -ErrorAction SilentlyContinue
    if ($dis) { W "Resiliency\DisabledItems ($v) present: Word has hard-disabled at least one add-in" }
    $dn = Get-ItemProperty "HKCU:\Software\Microsoft\Office\$v\Word\Resiliency\DoNotDisableAddinList" -ErrorAction SilentlyContinue
    if ($dn) { W "DoNotDisableAddinList ($v): $(($dn.PSObject.Properties | Where-Object Name -notlike 'PS*' | ForEach-Object { $_.Name + '=' + $_.Value }) -join ', ')" }
    $sec = Get-ItemProperty "HKCU:\Software\Microsoft\Office\$v\Word\Security" -ErrorAction SilentlyContinue
    if ($sec -and $null -ne $sec.DisableAllAddins) { W "Trust Center DisableAllAddins ($v) = $($sec.DisableAllAddins)" }
    foreach ($pol in "HKCU:\Software\Policies\Microsoft\Office\$v\Word\Security", "HKLM:\Software\Policies\Microsoft\Office\$v\Word\Security") {
        $pp = Get-ItemProperty $pol -ErrorAction SilentlyContinue
        if ($pp) { W "Policy $pol : $(($pp.PSObject.Properties | Where-Object Name -notlike 'PS*' | ForEach-Object { $_.Name + '=' + $_.Value }) -join ', ')" }
    }
}

W "`n--- Can this PowerShell create the add-in object? ---"
try {
    $o = New-Object -ComObject $progId
    W "OK: COM object created ($($o.GetType().FullName)). Registration and .NET loading work for a $(if ([Environment]::Is64BitProcess) {'64'} else {'32'})-bit process."
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($o)
} catch { W "FAILED: $($_.Exception.Message)" }

W "`n--- Connector log ---"
$log = Join-Path $env:LOCALAPPDATA 'MathBlocks\connector.log'
if (Test-Path $log) { Get-Content $log -Tail 40 | ForEach-Object { W "  $_" } } else { W "No log file: Word never ran the add-in's code." }

$file = Join-Path ([Environment]::GetFolderPath('Desktop')) 'MathBlocks-diagnostics.txt'
$out | Set-Content -Path $file -Encoding UTF8
Write-Host "`nReport saved to $file" -ForegroundColor Green
