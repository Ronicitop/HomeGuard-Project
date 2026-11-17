# Conexiones reales — diseño y plan de implementación

> Ejecutar inline con superpowers:executing-plans y TDD. Alcance solicitado: módulo Conexiones; el usuario confirmó que aún no tiene hardware y eligió preparar MQTT/HTTP y webcams.

**Objetivo:** vincular/configurar/eliminar cámaras y nodos con sensores/actuadores usando datos recibidos; no presentar lecturas simuladas como hardware conectado.

**Arquitectura:** mantener React/Next/PostgreSQL/Aedes existentes. Registro por hogar de conexiones, canales y comandos. Una credencial de dispositivo limitada a su conexión autentica MQTT/HTTP. Cámaras reutiliza Camara/SesionCamara y MediaMTX existentes. Una fila registrada no es prueba de conexión: requiere comunicación autenticada reciente o una sesión de publicación de medios confirmada.

**Decisiones:** implementar sobre tiago local y conservar las simulaciones históricas separadas. La autorización de crear el módulo y la selección explícita MQTT/HTTP/webcams bastan para avanzar; no se añade otro ciclo de aprobación de diseño. No hay nuevos servicios pagos, drivers universales o supuestos de hardware disponible. No se publica esta iteración automáticamente.

## Comportamiento

- Conexiones en navegación: cámaras, sensores, actuadores y nodos multicanal (ESP32/controlador). Alta, edición con revisión, habilitar/deshabilitar, eliminar vínculo, consultar estado y rotar credenciales.
- Cámara: webcam/navegador, selector local después de permiso explícito, parámetros y enlace al panel de cámaras. Sin MediaMTX/permiso/equipo, informar el bloqueo. Detectar webcams no deja una captura abierta.
- Sensor/actuador/nodo: MQTT o HTTP, nombre/ubicación, intervalo esperado y canales configurados. Tipos digitales, puerta, movimiento, humo, agua, temperatura, humedad, niveles, energía y salidas digitales. Solo se aceptan canales y valores registrados.
- Nuevas conexiones sin lecturas: WAITING. ONLINE solo tras mensaje autenticado reciente; OFFLINE al vencer el intervalo. Mostrar última comunicación y última medición por separado. DISABLED y DELETED no autorizan ingestión/comandos.
- No se crean lecturas de ejemplo, no se adopta el ESP32 simulado como físico y no se rellenan valores “Normal/Seco/24°C”. Seguridad muestra sensores físicos registrados y datos recibidos; simuladores en sección explícita aparte. El arranque normal no inicia el simulador de actuadores.
- Credencial aleatoria de 32 bytes, hash persistido, token mostrado una vez al administrador. MQTT restringido por hogar/conexión/topic; HTTP bearer de dispositivo separado de las sesiones humanas. Rotación/deshabilitación/eliminación revocan acceso y cancelan comandos pendientes.
- Comando físico: ON/OFF autorizado y con TTL, solicitado vs enviado vs confirmado por el dispositivo. PUBACK de MQTT no confirma ejecución. ACK debe coincidir con conexión, canal, ID y valor. HTTP usa polling del dispositivo. Sin contacto reciente, rechazar envío; al vencer, EXPIRED. No hay automatismo que convierta una orden al simulador en control físico.
- Eliminar vínculo conserva historial y no afirma apagar el hardware. La eliminación de cámara invalida conexiones de medios. Separar los eventos/reglas/emergencias existentes de esta configuración; no se habilita telefonía real.
- Protocolos locales sin cifrado deben señalarse en instrucciones; para acceso remoto requiere TLS/VPN. MQTT/DB siguen en loopback por defecto, con escucha MQTT adicional únicamente en interfaz privada seleccionada al iniciar para pruebas LAN.
- El sistema valida origen autenticado del mensaje, no certifica físicamente un sensor. Sin hardware no se declara probado un equipo, GPIO, calibración o transmisión física.

## Datos y archivos

Migración040: hg_connections, hg_connection_channels, hg_connection_messages/samples y hg_device_commands. Soft delete y scopes de hogar; credenciales no incluidas en DTO/listados/auditoría. Camara añade configuración/estado habilitado; se incorporan sus registros existentes sin inventar telemetría.

Backend lib/connections: catalog/schema, registry, credentials, telemetry y commands. HTTP routes agrega /connections y /device-ingest/{id}/{telemetry,config,commands,ack}. Broker device-auth separado y ACL. EventProcessor consume topics de dispositivos y despacha DEVICE_COMMAND. Mantener compatibilidad de eventos y comandos simulados, claramente diferenciados.

Frontend features/connections: lista, formulario de canales, instrucciones/credenciales, detección de webcams, estados y últimos datos. AppRouter/AppShell agregan Conexiones. Seguridad consume esta fuente real y oculta lecturas históricas no verificadas del panel principal. Cámara delega su gestión a Conexiones.

## Tareas y validación

1. Registro y catálogo. Escribir tests de alta vacía sin lecturas, roles/hogares, revisión y soft delete; observar RED, migrar e implementar; GREEN. No modificar migraciones ya aplicadas.
2. Ingestión. Tests de token ajeno/inválido, canal/valor incorrecto, deduplicación, fuera de orden, revocación, freshness y no datos inventados; RED→GREEN. Persistencia transaccional y límites de payload/frecuencia.
3. Comandos. Tests de offline, idempotencia, ACK erróneo/duplicado, expiración, rotación y transporte HTTP/MQTT; RED→GREEN. Revalidar autorización al despachar y no confundir entrega con ejecución.
4. Broker/API. Tests de ACL por conexión y revisión de credencial; HTTP no usa cookie de usuario como credencial de hardware. Probar mensajes reales de protocolo sobre DB de test/broker aislado, sin fabricar sensores en la DB del usuario.
5. UI. Probar alta/edición/baja, instrucciones y estados vacíos en navegador. Webcams solo tras interacción y liberar tracks. Seguridad sin hardware debe mostrar vacío y enlace a Conexiones. Responsive y accesibilidad.
6. Arranque/documentación/entrega. Respaldo antes de migrar DB local, simulador opt-in, instrucciones MQTT/HTTP/webcam, pruebas completas/build/lint, prueba de protocolo y navegación; revisión final y correcciones. Registrar límites: hardware ausente, video depende de medios, actuadores reales requieren firmware/ACK y no existen llamadas públicas.

## Foco de revisión

Suplantación de origen LIVE; acceso entre hogares; secretos en DTO/logs; comandos viejos o repetidos tras reconectar/rotar; suscripciones MQTT después de revocación; lectura vieja presentada actual; cierre/liberación de webcam y cámara deshabilitada; antiguos ejemplos visibles como reales; errores parciales y reinicio de broker/procesador.
