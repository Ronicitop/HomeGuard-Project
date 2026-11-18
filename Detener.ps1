param([switch]$ConPostgres)
$ErrorActionPreference='Stop';$projectRoot=$PSScriptRoot
. (Join-Path $projectRoot 'scripts\SafeProcess.ps1')
$nodeExe=(Get-Command node.exe).Source
$services=@{flutterpreview='scripts\flutter-preview.cjs';frontend='frontend-react\node_modules\vite\bin\vite.js';simulator='backend-next\workers\actuatorSimulator.ts';worker='backend-next\workers\eventProcessor.ts';backend='backend-next\node_modules\next\dist\bin\next';mqtt='scripts\broker.cjs'}
foreach($name in @('flutterpreview','frontend','simulator','worker','backend','mqtt')){
    $pidFile=Join-Path $projectRoot ".local\$name.pid";if(-not(Test-Path -LiteralPath $pidFile)){continue}
    $serviceProcessId=[int](Get-Content -LiteralPath $pidFile);$serviceProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$serviceProcessId"
    $entry=Join-Path $projectRoot $services[$name]
    $owned=Test-HomeGuardProcess $serviceProcess $projectRoot $entry $nodeExe
    if($name -eq 'mqtt' -and -not $owned){$owned=Test-HomeGuardProcess $serviceProcess $projectRoot (Join-Path $projectRoot '.local\broker.cjs') $nodeExe}
    if($owned){Stop-Process -Id $serviceProcessId;Write-Host "$name detenido."}
    elseif($serviceProcess){Write-Warning "${name}: PID no coincide con el ejecutable esperado; no se detuvo.";continue}
    Remove-Item -LiteralPath $pidFile
}
if($ConPostgres){$pgBin=if($env:HG_PG_BIN){$env:HG_PG_BIN}else{'C:\Program Files\PostgreSQL\18\bin'};& (Join-Path $pgBin 'pg_ctl.exe') -D (Join-Path $projectRoot '.local\pgdata') -m fast -w stop}
Write-Host 'Servicios propios de HomeGuard detenidos.'
