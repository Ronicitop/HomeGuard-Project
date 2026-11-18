param([switch]$SinCompilar,[switch]$SinNavegador)
$ErrorActionPreference='Stop';$projectRoot=$PSScriptRoot
. (Join-Path $projectRoot 'scripts\SafeProcess.ps1')
if(-not $SinCompilar){Push-Location (Join-Path $projectRoot 'mobile-flutter');try{flutter build web --release --no-web-resources-cdn --dart-define=HOMEGUARD_SERVER=http://127.0.0.1:3000;if($LASTEXITCODE -ne 0){throw 'No se pudo compilar Flutter web.'}}finally{Pop-Location}}
$entry=Join-Path $projectRoot 'scripts\flutter-preview.cjs';$nodeExe=(Get-Command node.exe).Source;$pidFile=Join-Path $projectRoot '.local\flutterpreview.pid'
if(Test-Path -LiteralPath $pidFile){$serviceId=[int](Get-Content -LiteralPath $pidFile);$existing=Get-CimInstance Win32_Process -Filter "ProcessId=$serviceId";if(Test-HomeGuardProcess $existing $projectRoot $entry $nodeExe){Write-Host 'La vista Flutter ya funciona en http://127.0.0.1:5174';if(-not $SinNavegador){Start-Process 'http://127.0.0.1:5174'};return}}
if(Get-NetTCPConnection -State Listen -LocalPort 5174 -ErrorAction SilentlyContinue){throw 'Puerto 5174 ocupado por otro proceso; no se modificó.'}
$logs=Join-Path $projectRoot '.local\logs';New-Item -ItemType Directory -Force -Path $logs|Out-Null
$process=Start-Process $nodeExe -ArgumentList @('"'+$entry+'"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'flutterpreview.out.log') -RedirectStandardError (Join-Path $logs 'flutterpreview.err.log') -PassThru
$process.Id|Set-Content -LiteralPath $pidFile
Write-Host 'Vista de la app Flutter: http://127.0.0.1:5174. El APK Android es la aplicación instalable.'
if(-not $SinNavegador){Start-Process 'http://127.0.0.1:5174'}
