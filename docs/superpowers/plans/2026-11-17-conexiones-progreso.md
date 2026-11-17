# Registro de ejecución — Conexiones reales

Plan: `2026-11-17-conexiones-reales.md`. Rama existente: `tiago`.

- Usuario confirmó MQTT/HTTP y webcams; todavía no tiene hardware.
- Tarea 1: registro, credenciales, telemetría y comandos implementados. Pruebas nuevas: RED por módulos ausentes → GREEN, 6/6; TypeScript correcto.
- Interfaces: registro → API y broker usan generación de credencial; cámara → registro usa Camara.id; panel Seguridad → registro consume canales y no TelemetriaSensor de demostración.
- Decisión: continuar en la rama de trabajo y directorio que usa el usuario para ejecutar la aplicación. No publicar cambios sin una nueva instrucción.
- Decisión: LIVE significa datos recibidos con una credencial de dispositivo, no una certificación de origen físico. Las pruebas de protocolo usan una base exclusiva de pruebas. La validación física queda pendiente de disponer de hardware.

## Resultado

Tareas 1–6 completas. Se implementaron registro, canales, credenciales, telemetría HTTP/MQTT, comandos con ACK/TTL, cámaras vinculadas al inventario, pantalla Conexiones y separación de simulaciones en Seguridad.

- Registro/ingestión/comandos: pruebas escritas primero, RED por módulos inexistentes y luego por revocación de contacto y despacho offline; GREEN.
- ACL MQTT: RED 2/2 antes de incorporar permisos por dispositivo; GREEN 2/2 después.
- Prueba real de protocolo sobre TCP y PostgreSQL de pruebas: broker y worker separados, recepción, comando, ACK, revocación y recuperación después de reiniciar el worker. Clientes de software, sin afirmar validación física.
- UI: flujo de alta/edición/habilitación/baja y credencial de una sola lectura; permisos, vacío sin hardware, revisión responsive y ausencia de errores de navegador.
- Base del usuario: respaldos antes de aplicar 040 y 041. Las migraciones anteriores no se modificaron. `021_cross_constraints.sql` continúa diferida por el mecanismo existente.

## Revisión final y correcciones

Un revisor independiente inspeccionó todos los cambios. No encontró exposición de credenciales ni acceso entre hogares. No dejó comportamientos sin juzgar. Se atendieron sus cuatro hallazgos en un pase de correcciones, con reproducciones RED→GREEN:

1. Configuración que cancelaba a mitad de publicar: exclusión transaccional por conexión/comando; el broker también valida ID, estado pendiente, canal, valor, generación y plazo persistidos. Prueba de concurrencia pausa el envío y comprueba que la edición espera.
2. Pérdida de telemetría/ACK cuando el procesador no está: migración 041 y bandeja durable confirmada antes de PUBACK, deduplicación, cola limitada y recuperación independiente. Prueba detiene el worker, publica, comprueba persistencia y lo reinicia. Los timestamps originales se conservan; una entrada atrasada no inventa contacto reciente ni sobrescribe un estado más nuevo.
3. Seleccionar webcam predeterminada ignoraba la selección y forzaba el ID guardado: distinguir preferencia inicial de selección explícita. Prueba RED por helper inexistente → GREEN; el componente usa esa selección al solicitar video.
4. Seguridad retenía actuadores conectados si fallaba la actualización: ocultar estados y controles anteriores ante error y mostrar carga real al inicio. Prueba RED por control activo tras fallo → GREEN.

Se trataron 3 y 4 como correcciones de comportamiento necesarias para configurar cámaras y representar conexión real. No quedaron hallazgos menores diferidos.

## Verificación final

- Backend: **82/82** pruebas, build Next y TypeScript correctos.
- Frontend: **10/10** pruebas, build Vite/TypeScript y ESLint correctos.
- Scripts/ACL/supervisor: **6/6** pruebas.
- Navegador: **3/3** flujos E2E, incluyendo regresión de cámaras y emergencia simulada.
- `git diff --check`: sin errores.
- Aplicación reiniciada con arranque normal: frontend, backend, broker y procesador funcionando; simulador detenido y sin archivo PID.
- Base del usuario al entregar: **0 conexiones activas, 0 muestras de dispositivos, 0 mensajes pendientes**. Los registros temporales de navegación se eliminaron; no se insertaron mediciones ficticias como hardware.

Se conserva la rama `tiago` en el directorio local solicitado; no se hace merge a main ni push de esta iteración. La guía de conexión es `docs/CONEXIONES-REALES.md`.

Limitaciones verificables: no hay hardware disponible para comprobar sensores, relés o captura física. Webcams reutilizan MediaMTX/inferencia del proyecto; el transporte de video depende de esos servicios. No se agregaron adaptadores universales de cámaras IP ni automatización física de emergencia.
