param([switch]$SinNavegador,[string]$Interfaz='127.0.0.1')
$ErrorActionPreference='Stop';$projectRoot=$PSScriptRoot
. (Join-Path $projectRoot 'scripts\SafeProcess.ps1')
if ($Interfaz -ne '127.0.0.1') {
    $address=[Net.IPAddress]::Parse($Interfaz)
    $private=$Interfaz -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
    if (-not $private -or -not (Get-NetIPAddress -IPAddress $Interfaz -ErrorAction SilentlyContinue)) { throw 'Selecciona una IP privada asignada a esta PC.' }
}
if($Interfaz -ne '127.0.0.1'){$env:HG_WEB_ORIGIN="http://${Interfaz}:5173,http://localhost:5173,http://127.0.0.1:5173"}
$nodeExe=(Get-Command node.exe).Source;$logs=Join-Path $projectRoot '.local\logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$pgBin=if($env:HG_PG_BIN){$env:HG_PG_BIN}else{'C:\Program Files\PostgreSQL\18\bin'}
function Start-HomeGuardNode([string]$Name,[string]$Entry,[string[]]$NodeArgs,[int]$Port,[string]$WorkingDirectory,[switch]$Tsx) {
    $pidFile=Join-Path $projectRoot ".local\$Name.pid"
    if(Test-Path -LiteralPath $pidFile){$serviceProcessId=[int](Get-Content -LiteralPath $pidFile);$existing=Get-CimInstance Win32_Process -Filter "ProcessId=$serviceProcessId";if(Test-HomeGuardProcess $existing $projectRoot $Entry $nodeExe){Write-Host "$Name ya esta funcionando.";return}}
    if($Port -gt 0 -and (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)){throw "Puerto $Port ocupado por otra instancia o programa; no se modifico ese proceso."}
    foreach($extension in @('out','err')){$log=Join-Path $logs "$Name.$extension.log";if((Test-Path $log) -and (Get-Item $log).Length -gt 2097152){Move-Item -LiteralPath $log -Destination "$log.1" -Force}}
    $arguments=@();if($Tsx){$arguments+=@('--import','tsx')};$arguments+=@('"'+$Entry+'"');$arguments+=$NodeArgs
    $started=Start-Process -FilePath $nodeExe -ArgumentList $arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$Name.out.log") -RedirectStandardError (Join-Path $logs "$Name.err.log") -PassThru
    $started.Id | Set-Content -LiteralPath $pidFile
    Start-Sleep -Milliseconds 800
    if(-not(Get-Process -Id $started.Id -ErrorAction SilentlyContinue)){throw "$Name no inicio. Revisa los logs locales."}
    if($Port -gt 0){$deadline=(Get-Date).AddSeconds(35);while(-not(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)){if((Get-Date) -gt $deadline){throw "$Name no abrio su puerto. Revisa los logs."};Start-Sleep -Milliseconds 300}}
}
$pgData=Join-Path $projectRoot '.local\pgdata'
& (Join-Path $pgBin 'pg_ctl.exe') -D $pgData status *> $null
if($LASTEXITCODE -ne 0){& (Join-Path $pgBin 'pg_ctl.exe') -D $pgData -l (Join-Path $logs 'postgres.log') -w start;if($LASTEXITCODE -ne 0){throw 'No se pudo iniciar PostgreSQL.'}}
if(-not(Test-Path (Join-Path $projectRoot '.local\broker-users.json'))){throw 'Ejecuta primero scripts\Preparar.ps1.'}
Start-HomeGuardNode 'mqtt' (Join-Path $projectRoot 'scripts\broker.cjs') @() 1883 $projectRoot
$backend=Join-Path $projectRoot 'backend-next'
Start-HomeGuardNode 'backend' (Join-Path $backend 'node_modules\next\dist\bin\next') @('start','-H',$Interfaz,'-p','3000') 3000 $backend
Start-HomeGuardNode 'worker' (Join-Path $backend 'workers\eventProcessor.ts') @() 0 $backend -Tsx
Start-HomeGuardNode 'simulator' (Join-Path $backend 'workers\actuatorSimulator.ts') @() 0 $backend -Tsx
Start-HomeGuardNode 'frontend' (Join-Path $projectRoot 'frontend-react\node_modules\vite\bin\vite.js') @('preview','--host',$Interfaz,'--port','5173','--strictPort') 5173 (Join-Path $projectRoot 'frontend-react')
Write-Host "HomeGuard disponible en http://${Interfaz}:5173 - Demo universitaria"
Write-Host 'Camaras incorporadas. Video/IA requieren MediaMTX e inference; Codex y push requieren configuracion adicional.'
if(-not $SinNavegador){Start-Process "http://${Interfaz}:5173"}
