# Conexiones reales de HomeGuard

## Qué incluye esta implementación

**Conexiones** centraliza el alta, la configuración, habilitación, deshabilitación y eliminación de equipos del hogar. Los administradores configuran equipos; los residentes pueden consultar sus lecturas y solicitar comandos según sus permisos. Los invitados no acceden al módulo.

Se admiten cámaras del navegador (webcams USB o incorporadas), sensores y actuadores que implementen el protocolo HTTP o MQTT descrito aquí. Un controlador o pasarela puede agrupar hasta 16 canales. El catálogo incluye temperatura, humedad, contacto de puerta, movimiento, humo, agua, gas, entrada digital, CO₂, iluminación, sonido, potencia, voltaje, corriente, energía, batería y número personalizado; las salidas incluyen relé, sirena, válvula, luz, interruptor y salida digital.

Esto **no es un controlador universal de marcas comerciales**. Un sensor suelto necesita un microcontrolador o pasarela que lea su señal y envíe el protocolo. Zigbee, Bluetooth, puertos serie, Tuya, ONVIF y RTSP directo requieren adaptadores adicionales. Una cámara IP puede incorporarse más adelante con su adaptador de video; actualmente el transporte configurable del registro de cámaras es webcam/navegador.

No se generan lecturas por registrar un equipo. Sin hardware, el sistema permanece sin mediciones. `LIVE` identifica una entrada autenticada del protocolo: no demuestra por sí solo que el remitente tenga un sensor físico. Las pruebas automatizadas usan clientes de software y una base exclusiva terminada en `_test`; no se cargan como hardware en el hogar del usuario.

## Ejemplos

- **Temperatura de cocina:** registrar un sensor HTTP, canal `main`, tipo `TEMPERATURE`. El ESP32 lee la sonda y envía `22.5`. Hasta el primer mensaje la tarjeta muestra “Esperando datos” y “Sin lecturas”. Si se desconecta, queda “Sin conexión” y mantiene la última medición con su fecha.
- **Puerta:** registrar un contacto MQTT, canal `main`, tipo `DOOR`. El firmware convierte su señal a `true` cuando está abierta y `false` cuando está cerrada. No enviar los textos `OPEN`/`CLOSED`.
- **Controlador de cocina:** registrar `GATEWAY` con `temperature`/TEMPERATURE, `smoke`/SMOKE y `light`/LIGHT de tipo ACTUATOR. Un mismo token permite enviar las tres señales del mismo equipo, sin acceder a otros equipos.
- **Relé:** registrar un actuador HTTP con canal `main`/RELAY. Después del heartbeat, solicitar ON desde la aplicación. El dispositivo consulta comandos, acciona la salida, verifica su resultado y envía ACK. La interfaz conserva por separado la solicitud y el último estado informado.
- **Webcam de demostración universitaria:** agregar una cámara, pulsar “Detectar webcams”, aceptar el permiso y elegirla. La detección libera la cámara al terminar. Abrirla en Cámaras, elegir Webcam e iniciar transmisión. El procesamiento y transporte de video requieren el servidor MediaMTX y el servicio de inferencia existentes; registrar una cámara no inicia video ni hace que aparezca en línea.

## Arranque y red local

Desde la raíz del proyecto:

```powershell
.\Iniciar.ps1 -SinNavegador
```

De forma predeterminada todos los servicios locales quedan en loopback. Para un ESP32 u otro equipo de la misma red, detener primero HomeGuard y arrancar con una IP privada que **realmente tenga esta PC**:

```powershell
.\Detener.ps1
.\Iniciar.ps1 -Interfaz 192.168.1.50 -SinNavegador
```

Reemplazar la IP de ejemplo. La interfaz web usa 5173, el receptor HTTP usa 3000 y MQTT usa 1883. El broker mantiene además su enlace 127.0.0.1 para el worker. La configuración rechaza direcciones públicas, `0.0.0.0` e interfaces que no pertenezcan a la PC. Si el firewall bloquea el acceso, habilitar los puertos necesarios solo para la red privada de pruebas. No abrir puertos del router ni publicar estos servicios en Internet.

`localhost` en un ESP32 apunta al ESP32, no a la PC. El diálogo de credenciales muestra el hostname usado por el navegador, pero debe sustituirse por la IP de la PC cuando sea necesario. Cambiar la interfaz requiere reiniciar los servicios existentes. Las webcams necesitan contexto seguro: localhost o HTTPS; desde otra PC mediante HTTP con IP privada el navegador puede denegar `getUserMedia`.

HTTP y MQTT TCP locales no llevan TLS. Para uso fuera de una red privada de laboratorio deben desplegarse HTTPS, MQTT/TLS y controles de acceso adecuados. No hay llamadas reales a emergencias ni activación automática de actuadores físicos desde las reglas antiguas: esta entrega integra lectura y control manual de equipos. La central de emergencias y el flujo anterior de actuadores siguen identificados como simulados.

El simulador de actuadores **ya no se inicia de forma predeterminada**. Para usarlo explícitamente:

```powershell
.\Iniciar.ps1 -ConSimulador
```

Sus estados aparecen únicamente en la sección desplegable de demostración de Seguridad. Las antiguas lecturas ficticias se conservan en la base histórica, pero no se muestran como sensores reales.

## Registro y credenciales

1. Entrar como administrador → Conexiones → Agregar equipo.
2. Definir nombre, ubicación, modelo, tipo, transporte y canales. Las claves deben empezar con letra minúscula y usar solo letras minúsculas, números, `_` o `-`; máximo 32 caracteres.
3. Guardar el token mostrado **una sola vez**. No se guarda en localStorage ni en las listas del API; en la base se conserva un hash SHA-256 de un token aleatorio de 256 bits.
4. Configurar el firmware. No compartir credenciales de usuarios humanos o del procesador con dispositivos.
5. Si se pierde o expone un token, pulsar Renovar token y actualizar el firmware. Se revocan la generación anterior, los comandos pendientes y las sesiones MQTT anteriores. El equipo vuelve a “Esperando datos”.

La revisión de configuración evita sobrescribir cambios de otro administrador. Tipo y transporte son inmutables: registrar un equipo nuevo para cambiarlos. Deshabilitar o eliminar revoca el acceso y cancela comandos; eliminar conserva historial. Habilitar nuevamente exige una comunicación nueva para mostrar En línea.

## Protocolo HTTP 1.0

Base: `http://IP_PC:3000/api/v1/device-ingest/ID_CONEXION`.
Todas las solicitudes llevan:

```http
Authorization: Bearer TOKEN_DEL_EQUIPO
Content-Type: application/json
```

No usar una cookie de la aplicación ni el token de otro equipo. HTTP no acepta credenciales de equipos registrados con transporte MQTT.

### Leer configuración

`GET /config` devuelve nombre, frecuencia de heartbeat, generación de credencial y canales propios, sin secretos. También registra contacto auténtico del equipo.

### Enviar lecturas

`POST /telemetry`:

```json
{
  "schema_version": "1.0",
  "message_id": "d638c701-89ea-4dbb-98d4-8ac2223612b3",
  "observed_at": "2026-11-17T10:30:00-04:00",
  "readings": [
    {"channel": "temperature", "value": 22.5},
    {"channel": "smoke", "value": false}
  ]
}
```

Los canales deben existir en ese equipo. Cada mensaje nuevo necesita un UUID nuevo; al reintentar **el mismo mensaje** se conserva el UUID y cuerpo exactos. El servidor deduplica. Reutilizar un UUID con otro cuerpo produce conflicto. `schema_version` y `observed_at` son opcionales; sin fecha se usa recepción del servidor. El ejemplo de fecha es ilustrativo: enviar la fecha actual, con zona horaria, si el equipo dispone de reloj sincronizado.

Máximo 64 KiB por cuerpo, 16 lecturas por mensaje y 600 contactos por minuto. Números finitos dentro del rango del catálogo; booleanos estrictos; salidas `ON`/`OFF`. No enviar `source`, `household_id` u otros campos fuera del contrato. Las fechas adelantadas más de 5 segundos se rechazan. Las lecturas con más de 5 minutos de atraso quedan en el historial y no reemplazan el valor actual. Los mensajes duplicados no renuevan el contacto.

Heartbeat sin lectura, cada `heartbeat_seconds` (15 segundos por defecto):

```json
{"schema_version":"1.0","message_id":"88079ee5-b62f-4f54-89ef-b2fd8def319e","heartbeat":true,"readings":[]}
```

Esto indica comunicación, no un valor de sensor. La aplicación calcula Sin conexión después de `max(30, heartbeat_seconds × 3)` segundos sin contacto. Los comandos exigen además contacto dentro de un máximo de 60 segundos. El último contacto y la fecha de medición son conceptos distintos.

### Actuadores y confirmaciones

Consultar `GET /commands` cada 1–2 segundos. Respuesta:

```json
{"schema_version":"1.0","items":[{"id":"07d34f5b-f138-45c8-9ec7-920a2fbfa025","channel":"main","state":"ON","expires_at":"2026-11-17T14:30:15.000Z"}]}
```

El firmware debe rechazar comandos vencidos, deduplicar por `id` y evitar ejecutar dos veces una salida. Actuar según `channel`, comprobar el resultado y responder `POST /ack`:

```json
{"schema_version":"1.0","message_id":"8919dcf2-f645-4bf7-af99-2ae4836c7c29","command_id":"07d34f5b-f138-45c8-9ec7-920a2fbfa025","state":"ON","ok":true}
```

`state` debe coincidir con lo solicitado. Si no pudo ejecutarlo, enviar `ok:false`. El ACK no debe enviarse por el simple hecho de recibir el comando. Para afirmar la posición física hace falta realimentación del hardware; sin ella el ACK solo representa lo que afirma el firmware. Los comandos vencen 15 segundos después de crearse y no se acumulan para ejecutarse al reconectar. Una salida admite un único comando pendiente.

Estados: QUEUED = solicitado; SENT = enviado/consultado, esperando respuesta; ACKNOWLEDGED = respuesta positiva del equipo; FAILED = respuesta negativa; EXPIRED = vencido sin confirmación; CANCELLED = configuración o credencial cambió. El ACK de transporte MQTT (PUBACK) no confirma la acción física.

## Protocolo MQTT 3.1.1

- Servidor: IP_PC, puerto 1883, TCP.
- Usuario y clientId: `hg-device-ID_CONEXION`.
- Contraseña: token mostrado al registrar.
- `clean session=true`, sin Last Will, sin mensajes retained. QoS 1 recomendado.
- El firmware debe mantenerse reconectando con espera progresiva y volver a suscribirse tras cada conexión.

El diálogo muestra los topics exactos, de la forma:

```text
homeguard/v1/ID_HOGAR/devices/ID_CONEXION/telemetry   publicar
homeguard/v1/ID_HOGAR/devices/ID_CONEXION/commands    suscribirse
homeguard/v1/ID_HOGAR/devices/ID_CONEXION/ack         publicar
```

Telemetría y ACK usan el mismo JSON que HTTP. El equipo no agrega un sobre de broker ni una generación a sus lecturas. El broker autentica, confina los topics y envuelve internamente el mensaje con la generación validada; el worker vuelve a validarla antes de persistir. No se permiten comodines, acceso a otros equipos ni publicación sobre `commands`.

El comando recibido contiene `command_id`, `channel`, `state`, `expires_at` y `credential_generation`. Rechazar fechas vencidas y generaciones anteriores. El broker comprueba el comando persistido, su estado pendiente, canal, generación y vencimiento. El dispatcher mantiene exclusión con la configuración hasta terminar el envío: una edición no cancela una orden a mitad de su publicación. Una orden que ya llegó al dispositivo no puede deshacerse eliminando el vínculo; si corresponde, solicitar el estado contrario antes de desconectarlo.

El broker conserva la telemetría y los ACK en una **bandeja durable de PostgreSQL antes de responder PUBACK**. Si el procesador se reinicia o está ocupado, recupera la entrada desde esa bandeja. Al reintentar se deduplica por conexión/UUID/cuerpo. Se limita la cola a 600 mensajes pendientes por equipo; los diagnósticos procesados se conservan 24 horas, separados del historial de mediciones. Si PostgreSQL falla, el broker rechaza la publicación en lugar de darla por guardada. El firmware debe reintentar mensajes no confirmados por transporte conservando su UUID.

El timestamp original de recepción se conserva al drenar la bandeja: procesar un mensaje viejo no vuelve a presentar al equipo como recién conectado. Un ACK recibido dentro del plazo puede confirmarse al recuperar el procesador aunque temporalmente se haya mostrado vencido; un ACK recibido fuera de plazo se rechaza. Una lectura más nueva no se sobrescribe por un ACK anterior recuperado de la cola. PUBACK demuestra que el mensaje entró en la bandeja, no que su contenido pasó la validación de canales o que una salida se ejecutó.

Un cambio de token desconecta suscriptores antiguos dentro del ciclo de revocación de 2 segundos; nuevas publicaciones y suscripciones se comprueban contra la base en cada operación.

## Cámara y video

El registro tiene un enlace a la tabla Camara existente: no hay dos inventarios independientes. Se adoptan las cámaras anteriores sin inventar actividad. La API anterior de alta/baja también pasa por el registro. La cámara habilitada aparece en Cámaras; una cámara deshabilitada no puede abrir ni renovar una sesión, y se vencen sus transmisiones existentes.

La selección de webcam se guarda como preferencia del navegador. El indicador En línea exige una sesión de publicación con `media_id` aprobado por MediaMTX y una sesión humana vigente; una simple reserva de transmisión no es una conexión. El cierre y revocación de transmisiones usa la limpieza existente del servidor de video. Un apagado inesperado puede tardar hasta el vencimiento de la concesión de 45 segundos en reflejarse.

## Estructura para desarrollar

- `backend-next/migrations/040_real_connections.sql`: registro, canales, muestras LIVE, deduplicación y comandos físicos; adopción de cámaras.
- `backend-next/migrations/041_device_inbox.sql`: bandeja durable de mensajes MQTT para tolerar reinicios del procesador.
- `backend-next/lib/connections/`: catálogo y validación, credenciales, registro, telemetría y comandos.
- `backend-next/lib/http/connectionRoutes.ts`: API humana `/api/v1/connections` y API exclusiva de dispositivos `/api/v1/device-ingest`.
- `scripts/broker.cjs` y `scripts/mqtt-acl.cjs`: autenticación por dispositivo, permisos de topics y revocación.
- `backend-next/workers/eventProcessor.ts`: recepción MQTT, vencimiento y despacho de comandos.
- `frontend-react/src/features/connections/`: pantalla y formularios. Seguridad consume sus canales; Cámaras enlaza a Conexiones para administrar equipos.

La base conserva valores históricos al perder comunicación. La UI nunca considera un comando enviado como confirmado. No se conectan automáticamente las reglas de detección de video al hardware nuevo; esa automatización necesita una política explícita de selección de salida, permisos, anulaciones manuales y pruebas con el equipo disponible.

## Validación

```powershell
cd backend-next
npm test
npm run typecheck
cd ../frontend-react
npm test
npm run lint
npm run build
```

La suite backend protege el nombre de la base de pruebas antes de reiniciarla. La prueba `mqtt-wire.test.ts` abre un broker TCP y un worker reales contra esa base, envía datos desde un cliente de software, recibe un comando, confirma el ACK y comprueba revocación. No prueba un relé físico, la precisión de un sensor o una webcam de este equipo.

Cuando haya hardware: verificar manualmente cada valor contra su estado físico; abrir/cerrar contacto y observar timestamps; desconectar red y esperar OFFLINE; renovar token y verificar rechazo; accionar un relé de laboratorio y comprobar que la UI no confirma sin ACK; probar permisos, eliminación, reconexión y reloj atrasado. Usar cargas de prueba de baja tensión para la demostración universitaria.
