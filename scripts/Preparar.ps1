$ErrorActionPreference='Stop';$root=Split-Path -Parent $PSScriptRoot
Push-Location $root
try{
 npm ci;if($LASTEXITCODE -ne 0){throw 'Dependencias raiz'}
 node scripts/setup-secrets.cjs
 Push-Location (Join-Path $root 'backend-next')
 try{npm ci;if($LASTEXITCODE -ne 0){throw 'Dependencias backend'};npm run backup;if($LASTEXITCODE -ne 0){throw 'No se modifica DB sin respaldo'};npm run migrate;if($LASTEXITCODE -ne 0){throw 'Migraciones'};npm run seed:demo;if($LASTEXITCODE -ne 0){throw 'Seed'};npm run build;if($LASTEXITCODE -ne 0){throw 'Build backend'}}finally{Pop-Location}
 Push-Location (Join-Path $root 'frontend-react')
 try{npm ci;if($LASTEXITCODE -ne 0){throw 'Dependencias web'};npm run build;if($LASTEXITCODE -ne 0){throw 'Build web'}}finally{Pop-Location}
}finally{Pop-Location}
