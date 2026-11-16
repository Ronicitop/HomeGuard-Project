# HomeGuard — entrega del desarrollo B

Fecha: 15 de noviembre de 2026. Rama local: `feat/mitad-b`. Se modifica el repositorio original; no es una aplicación independiente.

Resultados finales, correcciones y límites de revisión: [VERIFICACION.md](VERIFICACION.md).

## Implementación disponible

- Sesiones reales de ocho horas, contraseñas scrypt, cookie HttpOnly y CSRF en web, bearer en Android, revocación, roles y pertenencia al hogar. El cliente no decide el rol ni el ID efectivo del usuario.
- Migraciones incrementales con bloqueo, checksum y rollback; seed repetible que conserva usuarios y transforma contraseñas legacy en hashes. Se restauró un respaldo en una DB de prueba antes de migrar esta instalación.
- Web: resumen, historial/filtros/paginación, detalle, revisión/resolución/falsa alarma, seguridad, modos, actuadores, emergencias, consola del operador, miembros, preferencias y diagnóstico. Diseño responsive y SSE con polling de respaldo.
- Consumidor MQTT separado de Next; broker autenticado y ACL por rol/hogar/topic. Outbox en PostgreSQL, deduplicación, leases, reintentos acotados, recuperación y fallos visibles. Un advisory lock rechaza un segundo procesador.
- Adaptación del IoT original: telemetría, consumo, umbrales, plano y alertas de intrusión/humo+temperatura/agua/sobrecarga. Origen SIMULATED explícito y relación única entre alerta antigua y evento nuevo. Correlaciones persistidas y cooldown.
- Comandos al simulador: REQUESTED hasta ACK autenticado. El envío no confirma ON/OFF ni acciona hardware físico.
- Perfil ficticio, política y máquina de emergencias: evidencia visible, plazo en servidor, “Estoy bien”, ayuda simulada, aceptación por un operador y cierre. Tras reinicio con plazo vencido queda NEEDS_REVIEW y reanudar exige administrador. No hay llamadas PSTN/SIP ni a servicios públicos.
- Voz local Piper en español: plantilla observacional, proceso sin shell, modelo fijado y WAV privado accesible al administrador del hogar. Si falla la voz, permanece la transcripción.
- Avisos Android: tokens cifrados, categorías/horario silencioso, excepción crítica voluntaria, caducidad, tickets/receipts, revocación de token inválido y UNKNOWN cuando se desconoce el resultado. El envío externo está apagado en esta instalación.
- App Expo SDK58 con Router, servidor LAN configurable, SecureStore, sesión, resumen, historial/detalle, respuesta idempotente a emergencias, preferencias y registro push. Consumidores de APIs A y reproductor expo-video; no inventa cámaras, personas o clips.

## Dependencias de aceptación

| Área | Estado real | Responsable |
|---|---|---|
| Cámaras/webcams, zonas y visión | No instaladas; interfaz informa falta de conexión | A |
| Personas y encuentros manuales | Consumidor preparado; servicio ausente | A |
| Reglas y borradores con Codex | No implementados por B; B no consume GPT | A |
| Clips de 15 s y MediaMTX | Jobs/contratos preparados; almacenamiento y medios ausentes | A + ensayo conjunto |
| APK y video en teléfono | Typecheck, lint, doctor y export JS comprobados; sin SDK/Android físico configurado | Equipo |
| Push real | Faltan proyecto Expo/FCM, credenciales y prueba física | Equipo |
| Reconocimiento facial automático | Fuera del alcance del prototipo acordado; solo perfiles/asociación manual | Decisión futura |
| Emergencias reales/hardware | Fuera de la demostración, exclusivamente simulados | Proyecto posterior |

Un export Hermes no es un APK instalado. Un ticket de Expo no demuestra recepción o lectura. La central simulada no implica que una ambulancia haya sido enviada.

B01/B02/B03/B05 tienen implementación y verificación local. B04/B06/B07/B08/B09 funcionan en demo con pruebas, pero su aceptación con visión, clips o push reales requiere A/configuración externa. B10 tiene cliente y export Android; falta ensayo nativo. B11 cubre servicios B; se incorporarán los comandos start/health de A al integrar. B12 tiene regresión local y navegador; los hitos conjuntos H1-H6 permanecen pendientes. No se aprueban esos hitos mediante una simulación.

## Verificación reproducible

```powershell
# Repositorio
npm test
cd backend-next
npm test
npm run typecheck
npm run build
npm run doctor
cd ../frontend-react
npm test
npm run lint
npm run build
npm run test:e2e
cd ../mobile-app
npm test
npm run typecheck
npx expo lint
npx expo-doctor
npm run export:android
```

Backend exige DB exclusiva terminada en `_test`; no resetea homeguard_db. E2E requiere la demo local encendida y crea datos SIMULATED; cierra su incidente y deshabilita la política al finalizar. No activa push real. Se puede configurar HG_E2E_ORIGIN/HG_E2E_PASSWORD para otra demo.

El navegador comprobó login, evento, revisión, ACK, perfil/política, caída posible, ayuda, operador, cierre y un WAV RIFF realmente sintetizado. Se revisaron capturas de escritorio y móvil. El backend prueba duplicados concurrentes, aislamiento por hogar, permisos/CSRF, revisiones, cooldown, outbox, cancelación y reinicio. Consultar el registro de pruebas de esta entrega para los conteos finales.

## Integración que debe entregar A

1. Leer ambos planes y `contracts/types.ts`, el schema de detecciones y `contracts/openapi.json`. OpenAPI anuncia rutas B implementadas; agregar las de A conjuntamente.
2. Usar `requireSession` y `assertPermission` de B en cada ruta pública. El hogar/rol provienen de la sesión. Verificar pertenencia de cámaras, reglas y artefactos.
3. Crear migraciones 010–019. Cámaras y versiones necesitan las claves compuestas indicadas por 021. Ejecutar migrate tras instalar A; hoy 021 se difiere sin registrarse como aplicada.
4. Credencial local de visión: `.local/broker-clients.json`. No copiar a web, móvil, Git o logs. Solo publica propuestas/encuentros/resultados/heartbeat de su hogar. B es dueño de los efectos.
5. Crear `backend-next/lib/integrations/visionAdapter.ts` con `registerVisionAdapter()`. Dentro registrar `registerVisionPorts({recordClipResult,upsertEncounter})` con servicios reales A. El procesador carga ese archivo al iniciar. Los puertos validan esquema, IDs, hogar, revisiones y artifact_ref; recibir MQTT no autoriza archivos arbitrarios.
6. Publicar en `homeguard/v1/{hogar}/detections/proposed`: message_id/event_id estables, schema1.0, source verdadero. ACK en `detections/ack`; reintentar el mismo mensaje no crea otro evento.
7. Consumir `jobs/clip/requested`, responder ACK y resultado con job/evento/hogar originales. B espera resultado, no presenta listo por recibir PUBACK. A escribe el clip; ventana inicial 5 s anteriores +10 posteriores.
8. Proveer APIs cámaras/personas/reglas/clips/playback-session y páginas `frontend-react/src/features/{cameras,people,movements}/*Page.tsx`. B carga esas páginas al existir, tras rebuild. Acordar DTO de playback HLS antes del ensayo Android.
9. Proveer hg_camera_runtime, sesión y heartbeat para aceptar LIVE. FILE/REPLAY nunca se convierte en LIVE. Reportar revisión realmente aplicada y salud de visión/medios/IA por separado.
10. Incorporar la voz al registro de artefactos A. El WAV actual reside en cache privado B `.local/private-voice`, detrás de autorización administrativa. Es una adaptación temporal; integrar retención y propósito VOICE antes de aceptar el sistema conjunto.

## Decisiones operativas y límites

- Rama local en el checkout instalado para conservar PostgreSQL/dependencias. No se publicó ni mezcló con main; este directorio no debe editarse simultáneamente desde otra rama.
- Se implementaron dominios backend antes de UI para consumir endpoints verificables. La propiedad A/B permanece intacta.
- Next se actualizó por vulnerabilidades críticas del baseline. Next16 compila; React18 del backend emite aviso de deprecación, pendiente de migración separada.
- El cache de voz privado permite probar B sin duplicar tablas A; falta integrar el registro/retención de artefactos de A.
- La rate limit conserva protección por cuenta y agrupa IP como cliente local. Discriminar IP real exige proxy confiable antes de exponer fuera de la demo.
- La capacidad 1–10 cámaras es objetivo de diseño, no medición realizada por B. FPS, codecs y consumo se medirán con A y hardware de la universidad.
- npm audit informa avisos moderados transitivos. No se aplicaron upgrades mayores forzados incompatibles con Expo; revisar antes de desplegar fuera de esta demo local.

## Recorrido para presentar

1. Ingresar y mostrar diagnóstico. Cámaras indica sin conexión hasta integrar A.
2. Generar evento en Resumen, abrir Historial y revisarlo. Señalar origen simulado y decisiones independientes de clip/aviso.
3. Seguridad: cambiar HOME/AWAY, solicitar ON/OFF y observar confirmación SIMULATOR.
4. Emergencias: guardar datos ficticios y habilitar política. Probar una caída con “Estoy bien”.
5. Generar otra, solicitar ayuda o esperar el plazo. Aceptar en Central simulada, escuchar voz y cerrar.
6. Deshabilitar la política al terminar. Demostrar push en teléfono solo tras configurar y verificar Expo/FCM.
