$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$venv=Join-Path $root '.local\voice-venv'
if(-not(Test-Path (Join-Path $venv 'Scripts\python.exe'))){python -m venv $venv;if($LASTEXITCODE -ne 0){throw 'No se pudo crear entorno Python de voz'}}
& (Join-Path $venv 'Scripts\python.exe') -m pip install -r (Join-Path $root 'docs\mitad-b\requirements-voice.txt')
if($LASTEXITCODE -ne 0){throw 'Dependencias de voz no instaladas'}
$manifest=Get-Content -LiteralPath (Join-Path $root 'docs\mitad-b\voice-manifest.json') -Raw | ConvertFrom-Json
$directory=Join-Path $root '.local\voices\es_ES-davefx-medium'
New-Item -ItemType Directory -Force -Path $directory | Out-Null
foreach($file in $manifest.files){
 if($file.name -notmatch '^(es_ES-davefx-medium\.onnx(\.json)?|MODEL_CARD)$'){throw 'Nombre de modelo no permitido'}
 $destination=Join-Path $directory $file.name
 if(-not(Test-Path $destination) -or (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $file.sha256){
  $url="https://huggingface.co/rhasspy/piper-voices/resolve/$($manifest.revision)/es/es_ES/davefx/medium/$($file.name)"
  Invoke-WebRequest -Uri $url -OutFile $destination
 }
 if((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $file.sha256){throw 'SHA256 del modelo no coincide; no utilizar el archivo'}
}
Write-Host 'Voz local preparada y hashes verificados.'
