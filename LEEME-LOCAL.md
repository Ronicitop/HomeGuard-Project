# Ejecutar HomeGuard en esta PC

La mitad B está en `feat/mitad-b`, sobre el repositorio original. Abrí **Iniciar HomeGuard.cmd** o ejecutá `powershell -ExecutionPolicy Bypass -File .\Iniciar.ps1`. Web: http://127.0.0.1:5173 (también localhost:5173).

Cuenta de demo: **admin@homeguard.local**, contraseña inicial **HomeGuard2026!**. Se almacena scrypt; el seed conserva una contraseña ya cambiada.

Para detener: **Detener HomeGuard.cmd**. PostgreSQL queda encendido; `Detener.ps1 -ConPostgres` detiene únicamente el cluster local del repositorio.

## Preparar o actualizar

Node22 y PostgreSQL18 están instalados. Configuración privada: `backend-next/.env.local` y `.local/`, fuera de Git. Cluster `.local/pgdata`, puerto55432. En otra PC hay que provisionar DB/usuario y completar .env.local: el script B no instala PostgreSQL ni crea un cluster nuevo.

1. Detener HomeGuard antes de actualizar builds.
2. `scripts/Preparar.ps1`: instala dependencias, prepara secretos, respalda DB, migra y hace seed sin reset; compila backend/web. Requiere DB disponible.
3. Iniciar. Si un tercero ocupa el puerto se informa error sin terminarlo.
4. Diagnóstico: en backend `npm run doctor`. Logs privados `.local/logs/` con rotación básica al arrancar.

Servicios: API3000, web5173, MQTT1883, procesador y simulador. DB/MQTT solo loopback. Cámaras, medios y Codex se incorporan con A. Fallo de voz conserva texto; falta de push no impide historial.

## Android y LAN

En mobile-app: `npm ci`, configurar `.env.local` desde `.env.example` con IP privada de PC. En el teléfono no usar localhost.

Detener y ejecutar `Iniciar.ps1 -Interfaz 192.168.1.50` reemplazando por una IP asignada a esta PC. Limitar firewall manualmente a red privada y puertos3000/5173. No abrir DB/MQTT al móvil. Misma Wi-Fi sin aislamiento de clientes.

HTTP se admite únicamente en la demo con datos ficticios mediante la excepción Android de development build. Fuera de ella usar HTTPS confiable y quitar usesCleartextTraffic; no ignorar errores TLS.

Crear **development build**, pues se usan módulos nativos. Localmente requiere Android SDK y toolchain compatible; alternativamente `npx eas-cli@latest build --profile development --platform android` con cuenta del equipo, tras revisar cuota y configuración. No se creó cuenta, publicó app ni usó EAS automáticamente. Luego `npx expo start --dev-client`.

Push: configurar proyecto Expo (extra.eas.projectId), Firebase/FCM y google-services.json privado, y cargar credencial de servidor en el proyecto Expo. Seguir [guía SDK58](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/). HG_PUSH_ENABLED=true solo al tener configuración. Nunca claves en EXPO_PUBLIC. Probar permiso denegado, primer/segundo plano y app cerrada en teléfono físico.

El export Android verificado es Hermes/JavaScript: **no equivale a APK ni demuestra push**. Estado e integración: [docs/mitad-b/ESTADO-Y-ENTREGA.md](docs/mitad-b/ESTADO-Y-ENTREGA.md).

## Respaldo y migraciones

En backend: `npm run backup`, guarda dump privado en `.local/backups/`. Verificar: `npm run backup:verify -- ../.local/backups/archivo.dump`. Restaura en homeguard_restore_test, rechaza sobreescribir una DB existente y nunca restaura sobre homeguard_db. Al terminar elimina solo esa DB de prueba recién creada.

No ejecutar el SQL original destructivo para actualizar. `npm run migrate` es repetible y no borra datos. No modificar migraciones aplicadas; se normalizan CRLF/LF y se rechazan otros cambios por checksum.

Todas las emergencias y acciones de hardware son simuladas. No se llama a servicios públicos.
