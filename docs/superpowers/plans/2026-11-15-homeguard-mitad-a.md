# HomeGuard — Mitad A: Cámaras, visión, reglas, Personas y evidencia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Para el equipo humano, los mismos pasos sirven como lista de trabajo y revisión entre compañeros.

**Goal:** ampliar el repositorio HomeGuard existente con la mitad A de un prototipo universitario de observación doméstica por cámaras, integrado con la otra mitad y verificable en una demostración.

**Architecture:** React y Next.js existentes con PostgreSQL como fuente de verdad, medios y visión en procesos locales persistentes y comunicación por contratos versionados. Las acciones se orquestan con eventos/jobs duraderos; Android consume la misma API. GPT/Codex asiste en consultas acotadas con la sesión del titular cuya integración debe probarse.

**Tech Stack:** React, TypeScript, Vite, Next.js, PostgreSQL, MQTT/Aedes, Python, OpenCV, ONNX Runtime, YOLOX, ByteTrack, MediaPipe, MediaMTX, FFmpeg, Codex local, React Native/Expo y Piper según el módulo.

**Spec:** especificación íntegra en los apartados 1 a 10 de este mismo documento, contrato `HG-CONTRACT-1.0`. Plan complementario: [2026-11-15-homeguard-mitad-b.md](2026-11-15-homeguard-mitad-b.md).

**Fecha:** 15 de noviembre de 2026, zona de presentación America/La_Paz. **Asignación:** integrante A, 60 puntos relativos. Los nombres A/B pueden sustituirse por los de los compañeros sin cambiar responsabilidades.

## Restricciones globales

- Trabajar sobre el mismo repositorio HomeGuard; conservar y adaptar módulos legacy.
- Prototipo universitario en Bolivia; webcams para demostración; entre 1 y 10 cámaras registradas.
- Inferencia local medida; consulta Codex ocasional, dependiente de acceso/cupo/Internet verificados.
- Perfiles/encuentros manuales; sin identificación automática por rostro en este alcance.
- Llamadas exclusivamente simuladas en P0/P1, datos personales ficticios y alarma de demo explícita.
- Contrato compartido HG-CONTRACT-1.0; UTC persistido y America/La_Paz en presentación.
- Ninguna pantalla, mock o fixture se presenta como una función real sin prueba de integración.

## Foco de revisión

1. Suplantación de sesión, hogar ajeno y acceso directo a stream/clip: B02 y A02/A08.
2. Duplicados MQTT/jobs y reinicios en medio de una acción: B04/B08 y A08/A11.
3. Falta de imagen, oclusión o frame congelado confundidos con inmovilidad: A06 y B08.
4. Versiones de reglas, zonas o políticas que cambian durante un evento: A05/A10 y B04/B08.
5. Fallos de Internet, cuota, disco o proveedor que aparentan éxito: A08/A09 y B06/B09/B11.

---

## 1. Cómo leer estos dos documentos

Este documento es una especificación de producto y un plan de implementación para una de las dos personas del equipo. Su compañero contiene la otra mitad. Ambos incluyen deliberadamente el mismo contexto y los mismos contratos: cada integrante debe poder trabajar sin haber participado en la conversación original.

Los apartados 1 a 10 constituyen el contrato común, versión `HG-CONTRACT-1.0`. Si se cambia un campo, un estado, una ruta o una responsabilidad de ese contrato, actualizar ambos documentos y el esquema ejecutable antes de integrar código. Los apartados posteriores describen el trabajo particular de cada integrante.

**Estado del documento:** plan de desarrollo; las funciones nuevas descritas todavía no están implementadas. Los valores de tiempos, límites y umbrales son decisiones iniciales propuestas para una demostración académica, no resultados de mediciones ni parámetros certificados de seguridad. Deben poder configurarse y evaluarse.

**Prioridad P0:** necesaria para demostrar un flujo completo y honesto. **P1:** completa el alcance académico descrito. **P2:** ampliación posterior, no requisito para declarar listo el prototipo P0/P1. Ninguna función P2 debe presentarse como implementada.

## 2. Contexto completo, objetivo y límites

### 2.1 Qué es HomeGuard

HomeGuard evolucionará desde un panel de sensores IoT a un sistema doméstico de observación por cámaras, administración de reglas, registro de eventos, clips, avisos móviles y atención simulada de emergencias. El propietario debe poder consultar qué ocurrió, dónde, cuándo, qué evidencia existe y qué acciones ejecutó el sistema.

El proyecto es universitario, se demostrará en Bolivia y debe construirse sobre `https://github.com/Ronicitop/HomeGuard-Project.git`. Se conservarán y ampliarán el frontend React, el backend Next.js, PostgreSQL y los canales MQTT existentes. El procesador de visión y la aplicación móvil se agregarán como carpetas del mismo repositorio, no como reemplazos independientes del sistema.

Se podrán registrar de una a diez cámaras por hogar. Las pruebas iniciales utilizarán webcams. Debe diferenciarse registrar diez fuentes, visualizar diez mosaicos y analizar diez videos simultáneamente: son capacidades distintas. Solo se afirmará la última con mediciones reproducibles.

### 2.2 Necesidades originales y alcance de esta versión

| Necesidad | Alcance que se desarrollará | Límite explícito |
|---|---|---|
| Cámaras | Alta, edición, prueba de conexión, zonas, video, estado y baja lógica | Las webcams remotas requieren un publicador; no se descubren mágicamente desde cualquier PC |
| Personas | Detecciones anónimas por encuentro, miniatura y asignación manual de nombre/etiquetas a perfiles | Esta especificación no implementa identificación biométrica, embeddings faciales ni reconocimiento automático por rostro |
| Movimientos | Catálogo de reglas, activación, horarios, ejemplos, creación asistida y ensayo | Una instrucción o un clip no entrena automáticamente un detector universal |
| Seguridad | Zonas, cruces, permanencia, correlación con sensores y alarma de demostración | Ropa, rostro cubierto o presencia en una calle no prueban intención delictiva |
| Clips | Fragmentos nominales de 15 segundos con contexto anterior y posterior | Cuando falta video, se informa clip parcial o fallido; no se fabrica evidencia |
| Móvil | Android: eventos, avisos, clips, cámaras, ajustes y respuesta a emergencia | Acceso desde otra red requiere una solución de conectividad adicional |
| Emergencias | Posible caída, inmovilidad observada, solicitud de respuesta y llamada a central simulada | No diagnóstico médico ni llamadas reales a organismos públicos en P0/P1 |
| GPT/Codex | Asistente local con sesión del titular para interpretar instrucciones y revisar imágenes seleccionadas | Disponibilidad, cupo y compatibilidad se verifican; no es inferencia offline ni un servicio ilimitado |
| IoT anterior | Mantener telemetría, modos, plano, energía y actuadores con permisos | Los datos simulados se etiquetan; no se conectará la sirena a hardware real por defecto |

El alcance del módulo Personas es una adaptación expresa del pedido original. Si la evaluación académica exige identificación facial automática, este plan no satisface ese requisito y debe aclararse con el docente; no presentarlo como reconocimiento facial. Una alternativa de identificación de acceso es QR o credencial voluntaria, independiente de la imagen.

### 2.3 Ejemplos que guían el producto

1. **Entrada de un visitante:** la cámara registra un encuentro con `track_id` temporal. El propietario lo etiqueta manualmente como “Juan / trabajador”. Esa asociación describe ese encuentro; no identifica automáticamente a Juan en cámaras o visitas posteriores.
2. **Heladera:** el usuario escribe “avisame si alguien abre la heladera”. El asistente propone cámara, zona y condición observable; si faltan datos los solicita. La regla queda en borrador hasta probarse. Un sensor de apertura MQTT es una alternativa más determinista cuando haya hardware.
3. **Sofá:** se marca la zona y se detecta una postura de pie con persistencia temporal. No se deduce la edad ni se identifica a un niño por su apariencia. La regla se aplica a personas en general o a un encuentro asociado manualmente.
4. **Objeto retirado:** se marca un objeto y su área. El aviso será “posible retiro de objeto”, no “robo”: la cámara no conoce propiedad ni permiso. Una obstrucción temporal debe producir incertidumbre, no una acusación.
5. **Utensilios:** el usuario define una secuencia visible, por ejemplo contacto de mano con una zona y después con utensilios. Esto es experimental P1; no se afirma detectar bacterias ni contaminación invisible.
6. **Perímetro:** una persona cruza hacia un área protegida en modo AWAY. Se genera un evento conforme a la regla y, si hay señal adicional de puerta y política activa, una alarma simulada.
7. **Posible caída:** se observa descenso rápido, postura baja y persistencia. Se solicita respuesta y se ofrece cancelación. Si se pierde la imagen, se informa “sin observación”, no “persona inmóvil”.
8. **Sin Internet:** siguen la detección local, la persistencia y los clips. El asistente y push externos muestran indisponibilidad. Los eventos antiguos no se convierten en llamadas nuevas al reconectar.
9. **Solo evidencia:** `notify_enabled=false` y `save_clip_enabled=true` conservan el clip sin notificar. Los dos controles son independientes.
10. **Presentación universitaria:** el docente ve una cámara en vivo, ejecuta una escena segura, recibe un evento en un Android y escucha al bot en la central simulada. Las grabaciones y las inyecciones de prueba llevan distintivo visible.

## 3. Punto de partida real del repositorio

Inspección de referencia: 15 de noviembre de 2026. Antes de implementar, verificar que los archivos no hayan cambiado y registrar el commit base con `git rev-parse HEAD`.

| Archivo o componente existente | Qué hace hoy | Tratamiento |
|---|---|---|
| `frontend-react/src/App.tsx` | Pantalla monolítica, login, monitoreo, plano, usuarios, umbrales y nodos | Separar progresivamente por módulos, conservando funcionalidades |
| `frontend-react/vite.config.ts` | Configuración mínima de Vite | Añadir configuración de desarrollo y conexión mediante variables |
| `backend-next/app/api/status/route.ts` | Consulta sensores, modo, alertas, energía, plano y actuadores | Mantener compatibilidad; retirar el arranque del worker desde la ruta |
| `backend-next/lib/mqttWorker.ts` | Conecta MQTT, inserta telemetría y aplica reglas IoT | Extraer a proceso persistente y adaptar al nuevo orquestador |
| `backend-next/lib/db.ts` | Pool PostgreSQL mediante variables `DB_*` | Conservar, mejorar transacciones y validación de configuración |
| `backend-next/app/api/auth/login/route.ts` | Compara la contraseña directamente con `password_hash` | Reemplazar por hash real y sesión de servidor |
| `backend-next/app/api/auth/me/route.ts` | Devuelve el usuario fijo `id=1` | Resolver desde una sesión válida |
| `backend-next/app/api/admin/users/route.ts` | Lista y registra usuarios/roles | Proteger con autorización; no permitir escalamiento por registro público |
| `backend-next/app/api/mode/route.ts` | Cambia modo; acepta usuario en el body | Identidad desde la sesión, cambio atómico y auditoría |
| `backend-next/app/api/actuators/command/route.ts` | Cambia estado y publica comando | Añadir permisos, idempotencia y estados solicitado/confirmado |
| `backend-next/app/api/alerts/resolve/route.ts` | Sin ID resuelve todas las alertas | Sustituir el borrado lógico implícito por operaciones explícitas y autorizadas |
| `backend-next/simulador-sensores.js` | Publica escenas normales, intrusión, incendio, fuga y energía | Mantener como adaptador de pruebas marcado como simulación |
| `-- 1.pgsql` | Crea tablas antiguas tras ejecutar DROP TABLE | No usar como migración incremental sobre datos existentes |
| `local-setup.sql` | Complemento local: energía, ubicaciones, actuadores y seed | Convertir el resultado en migraciones reproducibles |
| `Iniciar.ps1`, `Detener.ps1` y lanzadores CMD | Arrancan/detienen los servicios locales actuales | Ampliar sin terminar procesos ajenos ni perder datos |

La interfaz actual confía en un usuario guardado en `localStorage`, usa URLs fijas `http://localhost:3000` y aplica restricciones de rol principalmente en el cliente. Esto no constituye autorización de servidor. En un teléfono, `localhost` es el teléfono: la app deberá usar la IP o nombre del servidor configurado.

Entorno observado: Windows, Node.js 22.19.0, Python 3.12, PostgreSQL 18, i5-11400F, aproximadamente 16 GB de RAM y RTX 3050 de 8 GB. Son datos de la PC actual, no requisitos garantizados de otras máquinas. La instalación local usa API 3000, frontend 5173, PostgreSQL 55432 y MQTT 1883. `.local/` contiene datos/servicios y se excluyó localmente mediante `.git/info/exclude`; antes de colaborar hay que añadir exclusiones compartidas adecuadas.

Codex CLI observado: `0.92.0`, con estado “Logged in using ChatGPT”. Esto no prueba que una integración nueva ya funcione, ni que los modelos de documentos recientes sean compatibles con esa versión.

## 4. Arquitectura, herramientas y decisiones

### 4.1 Recorrido de los datos

```text
Webcam / RTSP / grabación identificada
    -> FFmpeg/publicador -> MediaMTX -> video para web/móvil
                              |
                              +-> vision-worker (Python): detección, tracking, reglas, búfer
                                      |
                                      +-> MQTT detection.proposed.v1
                                              |
                                   event-processor (Node persistente)
                                      |
                         PostgreSQL: evento + decisiones + outbox
                                      |
                      clips / push / alarma simulada / emergencia simulada

React web y React Native Android -> API Next.js -> configuración y consultas
Asistente de reglas -> cola local -> adaptador Codex -> borrador validado
```

Next.js sirve HTTP y autentica usuarios. No ejecuta bucles de cámaras, llamadas ni un suscriptor MQTT cada vez que carga una ruta. El proceso Node de eventos y los procesos Python/medios viven de forma independiente y tienen apagado, reinicio y estado propios.

### 4.2 Selección tecnológica

| Capa | Decisión inicial | Motivo y condición |
|---|---|---|
| Web/API/DB | React + Vite / Next.js / PostgreSQL existentes | Evitar reescribir el proyecto; no unificar versiones de React sin necesidad |
| Cámaras | MediaMTX nativo Windows + FFmpeg | Adaptadores de webcam/RTSP/archivo y distribución de video |
| Visión | Python, OpenCV, YOLOX pequeño, ByteTrack, ONNX Runtime | Iniciar con pesos preentrenados y procesamiento local; fijar versiones después del smoke test |
| Posturas | MediaPipe Pose | Puntos corporales como señales; no detector médico de caídas |
| Comunicación | MQTT Aedes local existente; REST y SSE para clientes | Eventos pequeños por MQTT; nunca video base64 dentro del broker |
| Trabajo diferido | Tablas PostgreSQL outbox/job y un scheduler Node | No agregar Redis/Celery/Kubernetes en el prototipo |
| GPT | Adaptador local de Codex, sesión del titular | Spike obligatorio; versión/modelo disponibles y cupo visibles |
| Android | React Native + Expo con development build | Probar en dispositivo físico; compilación local para no depender de cuotas cloud |
| Push | Expo Push con credenciales FCM de Android | Cuenta/proyecto y permisos necesarios; no garantiza lectura del aviso |
| Clips | Archivos fuera del repositorio + metadatos en PostgreSQL | Cuotas, retención y acceso controlado |
| Voz | Piper local; Whisper.cpp solo P2 si se requiere conversación | La primera central reproduce mensajes estructurados |
| Pruebas | Vitest para dominio TS, pytest para Python, Playwright para flujos web | Crear pruebas que ejerciten decisiones y fallos reales |

Alternativas consideradas: todo cloud implica mayor tráfico/costo; todo local con un modelo visual grande compite por la GPU; Frigate es más adecuado para un despliegue Linux dedicado y no se asume compatible oficialmente con Windows. Se elige procesamiento local especializado y asistencia Codex ocasional. La selección exacta de versiones nuevas se registra en lockfiles y en un inventario de componentes, nunca “latest” en la ejecución de la demo.

### 4.3 Operación y valores iniciales

- Una sola vivienda operativa en la demo, con `household_id` en todas las entidades para evitar cruces de datos y permitir pruebas de aislamiento.
- Identificadores nuevos UUID; los usuarios legacy conservan sus IDs enteros. Fechas persistidas en UTC con `timestamptz`; mostrar `America/La_Paz` sin convertir manualmente el dato de la base.
- Máximo 10 cámaras registradas, incluyendo deshabilitadas; baja lógica libera la plaza. Bloqueo transaccional por hogar para que dos altas simultáneas no excedan el máximo.
- Perfil inicial de análisis: hasta 640x360 y 5 FPS por cámara, ajustable. Video mostrado/grabado puede tener más resolución. No afirmar que esta frecuencia permite detectar cualquier gesto breve.
- Cola de frames por cámara: tamaño 2; descartar antiguos, procesar el más reciente. No acumular minutos de retraso para parecer que se sigue en vivo.
- Heartbeat cada 5 s; cámara/worker degradado tras 15 s sin heartbeat, offline tras 30 s. Registrar el motivo y la última imagen válida.
- Búfer de video: mínimo 30 s; clip objetivo `[t_evento-5 s, t_evento+10 s]`. Conservar los segmentos desde que aparece un candidato para que la cola no los elimine antes de recibir el job.
- Timeout inicial de producción de clip: 45 s desde el job. Si faltan segmentos, `PARTIAL`; si no hay video, `FAILED`.
- Asistente: una consulta simultánea, cola máxima 5, timeout 90 s y máximo propuesto de 20 consultas por hora por hogar; los límites son de la app y no sustituyen los del plan.
- Retención propuesta: clips/capturas de eventos 7 días, encuentros sin etiquetar 24 h, segmentos temporales 30 s salvo segmentos fijados por un job. La retención se configura y no borra evidencia marcada para conservar hasta su vencimiento explícito.
- Cuota inicial configurable: 5 GiB para evidencia de demo, reserva de disco 2 GiB. Si no se puede escribir, el evento sigue existiendo y muestra el fallo.
- Cero cámaras apuntando a baños o espacios íntimos para las muestras. Escenas con participantes informados y datos personales ficticios en emergencias.

## 5. Comportamiento de módulos y experiencias

### 5.1 Usuarios, hogar y permisos

Roles `ADMINISTRADOR`, `RESIDENTE`, `INVITADO`. El administrador gestiona miembros, cámaras, reglas y configuración de emergencia. El residente consulta datos, etiqueta encuentros, reconoce eventos y ejecuta acciones permitidas; no modifica roles ni contactos/datos de emergencia. El invitado solo ve un panel resumido y las cámaras expresamente compartidas; por defecto no ve Personas, clips ni datos personales. Los controles se verifican en cada operación de servidor, incluyendo SSE, streaming y descargas.

El registro público nunca acepta `rol_id=1` para obtener privilegios. Para la demo, altas administrativas o invitaciones controladas. Cerrar sesión revoca tokens y deja de enviar eventos a la conexión. No inferir identidad desde `usuario_id` recibido en un body.

### 5.2 Cámaras y zonas

Pantallas: lista/mosaico, alta con prueba, detalle en vivo, zonas y diagnóstico. Mostrar origen `LIVE`, `REPLAY` o `SIMULATED`, resolución, FPS de análisis, última conexión y estado `STARTING/ONLINE/DEGRADED/OFFLINE/DISABLED`.

Tipos de origen: `USB_LOCAL`, `RTSP`, `FILE`, `WEBRTC_PUBLISH`. Para webcams en otra laptop se ejecuta un publicador en esa laptop; el índice USB no referencia dispositivos de otra máquina. Un archivo siempre se marca REPLAY. Evitar que dos lectores abran la misma webcam física: capturar una vez y redistribuir.

Zonas con polígonos normalizados `[0,1]`, 3 a 12 vértices y sin autointersecciones. Líneas direccionales con dos extremos y vector de orientación. Al redimensionar video se conserva la geometría. Si hay rotación/espejo, aplicar la misma transformación a imagen, overlay y coordenadas del modelo. Cambiar o eliminar una zona aumenta su revisión y suspende (`enabled=false`, motivo DEPENDENCY_CHANGED) todas sus reglas dependientes, incluidas las correlaciones que las referencian, en la misma transacción. La UI muestra las reglas afectadas antes de guardar. Se publica cambio de configuración y se requiere crear/validar/activar una nueva versión para reanudar. La geometría previa no se pierde: cada versión de regla conserva un snapshot inmutable de sus dependencias.

### 5.3 Personas y encuentros

Perfil manual: nombre opcional, etiquetas administradas, notas y foto aportada voluntariamente si hace falta. Encuentro: cámara, sesión de stream, trayectoria temporal, primera/última observación, miniatura, perfil asignado manualmente o ninguno. Por cámara, `encounters_enabled=true` habilita metadatos y `encounter_snapshots_enabled=false` es el valor inicial para miniaturas; el administrador puede habilitarlas explícitamente con retención de 24 h. Si no están habilitadas, mostrar avatar. La política de miniaturas de Personas es independiente de `save_clip_enabled`, se explica por separado y nunca conserva una captura de evento bajo el pretexto de ser miniatura. El estado “sin identificar” describe la falta de asociación manual, no una amenaza.

El ID local del tracker no es una identidad estable. Tras reiniciar cámara cambia `stream_session_id`. No relacionar dos cámaras por igualdad de `track_id`. La foto del perfil no se utiliza para reconocimiento automático. Las reglas críticas no dependen de atributos inferidos del rostro.

### 5.4 Movimientos: editor y catálogo

Una regla tiene cámara, categoría, condición, parámetros, zona, horarios, modos aplicables, severidad, cooldown y cuatro decisiones independientes: notificar, guardar clip, solicitar alarma y abrir incidente de emergencia. El interruptor `enabled` controla si la regla se evalúa; no se confunde con notificar.

| enabled | notify_enabled | save_clip_enabled | Comportamiento |
|---|---|---|---|
| false | cualquiera | cualquiera | No evaluar ni crear eventos nuevos por esa regla |
| true | true | true | Registrar evento, aviso y clip |
| true | true | false | Registrar evento y aviso, sin clip persistente |
| true | false | true | Registrar evento y clip, sin aviso push |
| true | false | false | Solo metadatos de evento; la UI explica esto |

Cada evento confirmado guarda la versión de la regla y las decisiones efectivas. Desactivar después no reescribe la historia. La eliminación de evidencia es otra operación. Desactivar alarma/emergencia cancela jobs aún no iniciados; una emergencia activa requiere cancelación explícita y queda auditada.

Catálogo P0: `ZONE_ENTRY`, `LINE_CROSS`, `DWELL`, `SENSOR_CORRELATION`. Catálogo P1: `STANDING_IN_ZONE`, `POSSIBLE_FALL`, `DOOR_OPEN`, `OBJECT_REMOVED`, `VISUAL_SEQUENCE`. Las tres últimas requieren calibración; si el evaluador no está disponible o no pasa validación, quedan `UNSUPPORTED` y no se simula soporte. P1 incluye el editor y ensayo de todos los tipos, no una promesa de exactitud universal.

Estados de versión: `DRAFT`, `NEEDS_INPUT`, `VALIDATED`, `UNSUPPORTED`, `ARCHIVED`. Solo activar una versión VALIDATED compatible con la cámara y el modelo cargado. Guardar borrador, ensayar y activar son operaciones distintas. Editar una regla activa crea una nueva versión; la versión anterior sigue vigente hasta activar la nueva de forma atómica, excepto si se modifica o elimina una dependencia (zona, perfil de postura o referencia), caso en que sus reglas se suspenden como se describe en §5.2.

### 5.5 Seguridad y sensores legacy

Se reutilizan HOME, AWAY y DISARMED. Seguridad de intrusión puede limitarse a AWAY; una regla doméstica como heladera puede aplicar también en HOME. DISARMED desactiva por defecto las reglas de intrusión, pero no invalida una posible caída configurada para todos los modos.

La regla de intrusión de demo correlaciona cruce hacia el interior y apertura de puerta en 15 s, siempre sobre fuentes compatibles y el mismo hogar. Una señal aislada puede generar aviso, pero no alarma automática por defecto. Una alarma tiene `requested_state`, `confirmed_state` y `confirmation_source`; ausencia de ACK significa pendiente/fallida, no encendida.

### 5.6 Emergencias y central simulada

Una caída posible necesita observar la secuencia. Inmovilidad significa que una trayectoria sigue visible y con poca variación durante la ventana configurada; pérdida de cámara, persona tapada o desaparición no cumplen esa condición. Una captura fija aislada no confirma caída ni desmayo.

Perfil de emergencia: nombre ficticio del responsable, domicilio y referencias ficticias, contactos de prueba, instrucciones de acceso y texto de consentimiento de demo. Política inicial de demostración: 10 s de inmovilidad observada después de la secuencia de posible caída, evaluados por A; entonces se emite la propuesta de evento y B abre un plazo de 20 s para responder “Estoy bien”. B no espera otros 10 s de inmovilidad. La definición activa de POSSIBLE_FALL debe coincidir con la política vigente; cambiar ese umbral invalida la validación de la versión y suspende su escalamiento hasta revalidarla. Son tiempos pedagógicos, configurables y no criterios clínicos.

Estados de incidente: `PENDING_RESPONSE -> CANCELLED` o `ESCALATED -> CALLING_SIMULATED -> CONNECTED_SIMULATED -> CLOSED`; error de transporte produce `FAILED`. Si el servidor estuvo caído hasta después de un deadline, el incidente pasa a `NEEDS_REVIEW`, desde donde un administrador puede cancelar o reanudar expresamente una simulación nueva; nunca se origina una llamada tardía automática. Un operador acepta la llamada en una pantalla distinta. El bot se identifica como automatizado y dice “posible caída”; no afirma diagnóstico, consciencia ni que una ambulancia esté en camino. La primera versión reproduce audio y acuse de recepción; conversación bidireccional es P2.

Las reglas ordinarias no pueden crear llamadas por texto libre. La política de emergencia es configurada por administrador. Nunca usar números de emergencia reales en seeds, tests ni demo; un botón de contacto real solo se estudiará fuera del alcance académico con proveedor y validación local.

### 5.7 Eventos, clips y notificaciones

Todos los eventos ofrecen fecha, fuente, cámara, regla/versión, descripción observacional, severidad, estado y acciones realizadas. Estados humanos `NEW`, `ACKNOWLEDGED`, `RESOLVED`, `FALSE_POSITIVE`; no confundir con el estado del clip, push o llamada.

Clip `NOT_REQUESTED/PENDING/READY/PARTIAL/FAILED/EXPIRED/DELETED`. Notificación `QUEUED/SENDING/SENT/FAILED/UNKNOWN/SKIPPED`. Aceptación por el proveedor no es lectura por el usuario. Si un aviso sale antes del clip, abre el evento mostrando “clip en preparación”; no mandar un segundo push salvo que exista una preferencia explícita.

Un enlace al clip debe verificar sesión y pertenencia al hogar, admitir reproducción/rangos y no exponer rutas de Windows. Un evento puede seguir en el historial después de que su evidencia venza.

## 6. Contratos de integración HG-CONTRACT-1.0

### 6.1 Reglas generales

La fuente ejecutable de contratos será `contracts/`: JSON Schema Draft 2020-12, OpenAPI y ejemplos. A mantiene definiciones visuales/reglas/clips; B mantiene auth/eventos/notificaciones/emergencias. Ambos revisan cambios. TypeScript valida con Ajv configurado para Draft 2020-12 y Python con `jsonschema` compatible; no aceptar un documento porque solo cumple una interfaz TS en compilación.

API nueva bajo `/api/v1`. Campos JSON en `snake_case`; identificadores UUID en strings; timestamps ISO 8601 UTC con sufijo `Z`. Estados técnicos en inglés; textos visibles en español. Requests no contienen `household_id` ni `user_id` autoritativos: el servidor los obtiene de la sesión. Operaciones internas sí incluyen hogar, sujeto a credenciales de servicio acotadas.

Error uniforme:

```json
{"error":{"code":"RULE_NOT_VALIDATED","message":"Probá la regla antes de activarla.","details":{"rule_id":"22222222-2222-4222-8222-222222222222"},"request_id":"req-demo-001"}}
```

Usar 400 para sintaxis, 401 sin sesión, 403 sin permiso, 404 inexistente o de otro hogar, 409 conflicto de versión/cupo, 413 archivo grande, 415 medio no admitido, 422 condición no soportada y 503 servicio no disponible. Listas devuelven `{items,next_cursor}`; límite por defecto 20, máximo 100. `PATCH` usa `expected_revision` para evitar sobrescritura silenciosa. Operaciones con efectos aceptan `Idempotency-Key`, válido por 24 h y acotado al hogar/operación; misma clave y body distinto da 409.

### 6.2 Definición de regla

```json
{
  "schema_version":"1.0",
  "rule_id":"22222222-2222-4222-8222-222222222222",
  "rule_version_id":"33333333-3333-4333-8333-333333333333",
  "version":1,
  "name":"Persona en zona de acceso",
  "camera_id":"11111111-1111-4111-8111-111111111111",
  "category":"SECURITY",
  "condition":{"kind":"ZONE_ENTRY","zone_id":"44444444-4444-4444-8444-444444444444","zone_revision":1,"min_confidence":0.65,"min_duration_ms":1000},
  "modes":["AWAY"],
  "schedule":{"timezone":"America/La_Paz","days":[1,2,3,4,5,6,7],"start":"00:00","end":"24:00"},
  "cooldown_seconds":30,
  "severity":"WARNING",
  "actions":{"notify_enabled":true,"save_clip_enabled":true,"alarm_enabled":false,"emergency_enabled":false}
}
```

`enabled` y `active_version_id` pertenecen a la fila de regla, no a la definición inmutable de una versión. `days` usa lunes=1; `00:00..24:00` es el caso explícito de día completo. En otros horarios, inicio inclusivo y fin exclusivo. Horarios que cruzan medianoche se evalúan desde el día de inicio; probar domingo/lunes. El umbral del ejemplo es un valor inicial de demo, no precisión certificada.

Condiciones discriminadas:

| kind | Parámetros obligatorios además de los comunes | Evaluación |
|---|---|---|
| ZONE_ENTRY | zone_id, zone_revision, min_duration_ms | Centro inferior de bounding box dentro del polígono durante la persistencia |
| LINE_CROSS | zone_id de tipo línea, direction `A_TO_B/B_TO_A`, min_confidence | Trayectoria atraviesa la línea en la dirección indicada |
| DWELL | zone_id, zone_revision, duration_seconds | Presencia continua; tolerancia de interrupción inicial 1 s |
| SENSOR_CORRELATION | visual_rule_version_id, device_id, sensor_type, expected_state, window_seconds | Unión de señal visual y sensor; sin referencias cíclicas |
| STANDING_IN_ZONE | zone_id, zone_revision, standing_seconds, pose_profile_id | Puntos corporales observables y calibración de zona |
| POSSIBLE_FALL | zone_id opcional, pose_profile_id, immobility_seconds | Secuencia y observabilidad; fase inicial experimental |
| DOOR_OPEN | zone_id, zone_revision, reference_id, open_seconds | Estado visual calibrado o adaptador explícito de sensor |
| OBJECT_REMOVED | zone_id, zone_revision, reference_id, absent_seconds | Ausencia sostenida con zona observable; objeto no ocluido |
| VISUAL_SEQUENCE | zone_id, zone_revision, reference_id, description | Revisión experimental temporal; no acciones físicas automáticas |

Cada `hg_rule_versions` conserva además `dependencies_snapshot` generado por el servidor: zonas `{id,revision,geometry}`, perfiles `{id,revision,model_id,parameters}` y referencias `{id,revision,artifact_ref,sha256,annotations}` usados en su creación/validación. Esos datos no se sobrescriben al editar la entidad actual y los eventos reconstruyen evidencia mediante su `rule_version_id`. `/internal/vision/config` entrega definición y snapshot de dependencias, permitiendo reproducibilidad tras reinicio. Una versión con dependencias desactualizadas no puede activarse; guardar un perfil o referencia sigue la misma suspensión transitiva que editar zona.

Campos adicionales no reconocidos se rechazan. No se permite código, expresiones SQL, Python, `eval`, scripts de shell ni URLs arbitrarias en una definición. Parámetros numéricos finitos, máximos documentados y referencias del mismo hogar. `VISUAL_SEQUENCE` nunca habilita alarma/emergencia. Las condiciones P1 deben informar `evaluator_available`, `validation_status` y limitaciones en la UI.

### 6.3 Propuesta de evento desde visión

Tema MQTT: `homeguard/v1/{household_id}/detections/proposed`. QoS 1, `retain=false`. B responde en `detections/ack` con `detection.ack.v1` y `{message_id,event_id,status:ACCEPTED|PENDING_CORRELATION|REJECTED,reason_code}` después de persistir el recibo. A conserva un spool local de propuestas sin ACK (máximo 1.000 mensajes o 5 MiB, TTL 30 s); reenvía con los mismos IDs y no reproduce efectos históricos al vencer. Llenado o expiración se contabilizan como pérdida visible. El evento propuesto no autoriza por sí mismo notificar, accionar o llamar.

```json
{
  "schema_version":"1.0",
  "message_type":"detection.proposed.v1",
  "message_id":"55555555-5555-4555-8555-555555555555",
  "event_id":"66666666-6666-4666-8666-666666666666",
  "household_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "camera_id":"11111111-1111-4111-8111-111111111111",
  "stream_session_id":"77777777-7777-4777-8777-777777777777",
  "rule_version_id":"33333333-3333-4333-8333-333333333333",
  "occurred_at":"2026-11-15T20:00:00.000Z",
  "source":"LIVE",
  "event_type":"ZONE_ENTRY",
  "category":"SECURITY",
  "severity":"WARNING",
  "summary":"Una persona ingresó a la zona de acceso.",
  "confidence":0.82,
  "local_track_id":"track-17",
  "evidence":{"frame_times_ms":[0,500,1000],"observability":"VISIBLE","snapshot_ref":"snap-demo-001","segment_hold_ref":"hold-demo-001"},
  "producer":{"name":"vision-worker","version":"0.1.0","model_id":"yolox-demo","config_revision":3}
}
```

`message_id` identifica la entrega lógica, `event_id` el incidente observacional; los reintentos conservan ambos. El ID local de trayectoria solo es único dentro de cámara y sesión de stream. No incluir rostro codificado, datos personales ni paths arbitrarios.

El procesador B valida esquema, credencial/tópico, hogar, cámara, stream, versión activa y modo. Para el piloto admite eventos con demora máxima 30 s y adelanto de reloj máximo 5 s; los más antiguos se guardan como tardíos, sin nuevos efectos críticos. Una versión reemplazada puede aceptarse para historial si su intervalo de vigencia contiene `occurred_at`, nunca para reactivar una alarma deshabilitada después. Todas las decisiones quedan registradas.

Para POSSIBLE_FALL, `evidence` agrega `visible_from`, `visible_until`, `immobility_seconds` y `pose_profile_id`. A emite la propuesta solo al cumplir su ventana de observación válida; B verifica vigencia, política y evidencia antes de abrir el plazo de respuesta, sin recalcular la postura ni sumar otra ventana de inmovilidad. Para SENSOR_CORRELATION, A emite la mitad visual con la versión compuesta y B mantiene el candidato pendiente hasta verificar el sensor o vencer la ventana.

Duplicados se detienen con `UNIQUE(event_id)` y recibos por `message_id`. Hay dos niveles de cooldown: A filtra localmente por `(camera_id,rule_id,stream_session_id,local_track_id,event_type)`; B aplica un cooldown duradero por `(household_id,camera_id,rule_id,event_type)`, sin IDs de trayectoria/sesión. B lo persiste y bloquea transaccionalmente en `hg_cooldowns`, de modo que reiniciar cámara/worker no permita duplicar el aviso. Esta política de agrupación del prototipo puede agrupar a dos personas distintas de la misma cámara durante los 30 s de la regla; se muestra el contador de propuestas agrupadas y se explica ese límite, sin prometer cobertura clínica individual. Un SOS manual explícito no se suprime por este cooldown. `source=REPLAY/SIMULATED` muestra marca visible y solo acciona adaptadores de demostración.

### 6.4 Jobs y resultados

Temas:

| Topic relativo a `homeguard/v1/{household_id}/` | Productor -> consumidor | Mensaje |
|---|---|---|
| `jobs/clip/requested` | B -> A | `clip.requested.v1` |
| `jobs/clip/completed` | A -> B | `clip.completed.v1` |
| `jobs/clip/failed` | A -> B | `clip.failed.v1` |
| `vision/heartbeat` | A -> B | `vision.heartbeat.v1` |
| `encounters/observed` | A -> B, servicio A | `encounter.observed.v1` |
| `detections/ack` | B -> A | `detection.ack.v1` |
| `config/changed` | API/outbox B -> A | `config.changed.v1` con revisión, sin secretos |
| `jobs/ack` | A -> B | `job.ack.v1`: `RECEIVED/RUNNING/COMPLETED/FAILED` |
| `actuators/command` | B -> simulador/hardware futuro | `actuator.command.v1` |
| `actuators/ack` | simulador -> B | `actuator.ack.v1` |

`encounter.observed.v1` contiene `schema_version`, `message_type`, `message_id`, `household_id`, `camera_id`, `stream_session_id`, `local_track_id`, `first_seen`, `last_seen`, `source`, `snapshot_ref` nullable y `config_revision`. El snapshot solo puede existir si la política explícita de Personas lo permite. Publicar como máximo una actualización por segundo por trayectoria y una al terminar; no tratar encuentros como alertas.

Ejemplo de solicitud de clip:

```json
{"schema_version":"1.0","message_type":"clip.requested.v1","job_id":"88888888-8888-4888-8888-888888888888","event_id":"66666666-6666-4666-8666-666666666666","camera_id":"11111111-1111-4111-8111-111111111111","stream_session_id":"77777777-7777-4777-8777-777777777777","occurred_at":"2026-11-15T20:00:00.000Z","pre_seconds":5,"post_seconds":10,"segment_hold_ref":"hold-demo-001"}
```

El resultado conserva `job_id` y `event_id`, e incluye `status=READY/PARTIAL`, `artifact_ref` opaco, `actual_start`, `actual_end`, `duration_ms`, `size_bytes`, `sha256` y `missing_ranges`. Error incluye `code` enumerado `NO_VIDEO/DISK_FULL/TIMEOUT/INVALID_SOURCE/PROCESS_FAILED`. `artifact_ref` se resuelve en un almacén controlado; jamás se confía en un path enviado por MQTT para leer cualquier archivo.

Los jobs viven en PostgreSQL. B reclama trabajos con lease de 60 s renovado cada 10 s, usando bloqueo transaccional, y publica sus mensajes. Un job `RUNNING` con heartbeat no se vuelve a despachar. Un lease vencido permite recuperar el job con el mismo ID. Tres reintentos con espera de 1/5/15 s, máximo 4 intentos contando el inicial para errores recuperables; ACK recibido no equivale a clip terminado. A responde de manera idempotente usando el mismo artefacto para un mismo `job_id`.

### 6.5 API por dueño

Todas las rutas siguientes cuelgan de `/api/v1`; las listas son paginadas. Una ruta solo tiene un propietario de implementación.

| Rutas | Dueño | Contrato |
|---|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | B | Login emite sesión opaca; logout revoca; me nunca fija usuario 1 |
| `GET/POST /members`, `PATCH /members/{id}` | B | Gestión de miembros y permisos |
| `GET/POST /cameras`, `GET/PATCH/DELETE /cameras/{id}` | A | CameraView sin credenciales ni source_ref sensible |
| `POST /cameras/{id}/test`, `POST /cameras/{id}/playback-session` | A | Job de prueba; sesión de medios temporal autorizada |
| `GET/POST /cameras/{id}/zones`, `PATCH/DELETE /zones/{id}` | A | Geometría, revisión y dependencias |
| `GET/POST /people`, `GET/PATCH/DELETE /people/{id}` | A | Perfiles manuales |
| `GET /encounters`, `PATCH /encounters/{id}` | A | Asociación manual, no reconocimiento |
| `GET/POST /rules`, `GET/PATCH /rules/{id}` | A | Definición y estado, revisión optimista |
| `POST /rules/{id}/versions`, `POST /rules/{id}/validate`, `POST /rules/{id}/activate` | A | Borrador, ensayo y activación separados |
| `POST /rule-drafts`, `POST /examples`, `GET /ai/jobs/{id}` | A | Asistencia asíncrona; archivo autenticado o texto |
| `GET /events`, `GET /events/{id}`, `PATCH /events/{id}` | B | Filtros y estados humanos |
| `GET /events/{id}/clip`, `GET /clips/{id}/content`, `DELETE /clips/{id}` | A | Consulta y streaming autorizado; borrar evidencia sin borrar evento |
| `POST/DELETE /push-devices`, `GET/PATCH /notification-preferences` | B | Tokens por instalación/usuario/hogar |
| `GET /emergency-profile`, `PUT /emergency-profile`, `GET/PUT /emergency-policy` | B | Datos ficticios y política administrativa |
| `GET /emergencies`, `GET /emergencies/{id}`, `POST /emergencies/{id}/respond` | B | Respuesta `I_AM_OK/REQUEST_HELP` idempotente |
| `POST /emergencies/{id}/simulated-call/accept`, `POST /emergencies/{id}/close` | B | Operador con permiso de simulación |
| `GET/PATCH /mode`, `GET /actuators`, `POST /actuators/{code}/commands` | B | Modos y acciones controladas |
| `GET /stream`, `GET /health` | B | SSE autenticado y salud saneada |
| `GET /internal/vision/config`, `POST /internal/artifacts/register` | A | Solo credencial de servicio, jamás sesión pública |

`POST /examples`: multipart MP4/WebM, máximo 50 MiB, duración máxima 30 s, análisis en proceso limitado y timeout; no confiar en extensión ni MIME declarado. Validar con ffprobe aislado y rechazar contenido no decodificable. `POST /rule-drafts` acepta `prompt` de hasta 2.000 caracteres y `example_id` opcional, responde 202 con `job_id`; no devuelve una regla activa.

SSE envía `event.created`, `event.updated`, `clip.updated`, `camera.updated`, `emergency.updated`, `notification.updated`, `health.updated`. Cada mensaje tiene ID de secuencia persistido y datos mínimos. Reconectar con `Last-Event-ID`; si el cursor venció se envía `sync_required` y el cliente vuelve a consultar listas. Móvil en segundo plano usa push, no presupone SSE permanente.

### 6.6 Auth, medios y red

B implementa sesiones opacas: token aleatorio de al menos 32 bytes, guardar solo su hash, expiración inicial 8 h y revocación. Web usa cookie HttpOnly con SameSite y protección CSRF para mutaciones; `Secure` en HTTPS. Android usa bearer guardado con SecureStore, no almacenamiento plano. Los mismos servicios resuelven `AuthContext={user_id:number, household_id:string, role:Role, session_id:string}`.

A consume `requireSession(request): Promise<AuthContext>` y `assertPermission(ctx, permission): void` de B. Ningún endpoint A usa un mock de auth en la integración final. Desarrollo en paralelo usa un proveedor falso solo en tests, nunca activable por un body HTTP o por modo demo.

MediaMTX no debe quedar como un bypass de la API. A implementa autenticación de publicación/lectura y un callback que valida tokens de medios de 60 s ligados a cámara, sujeto y operación. Los tokens no se registran ni se incorporan a URLs compartibles duraderas. Revocar sesión impide nuevas sesiones de medios; cerrar lecturas activas en un máximo objetivo de 60 s. La API de control de MediaMTX solo escucha en loopback.

Para la demo en LAN, el servidor escucha únicamente en la interfaz privada seleccionada y las reglas de firewall se limitan a esa red. Cámara del navegador/micrófono requieren contexto seguro salvo excepciones de localhost: si se usa publicación web desde otro dispositivo, preparar HTTPS con certificado confiable o usar publicador FFmpeg nativo. No pedir que el usuario ignore advertencias TLS.

Puertos propuestos: API 3000, web 5173, PostgreSQL 55432, MQTT 1883, MediaMTX RTSP 8554, HLS 8888, WebRTC 8889/UDP 8189. Verificar puertos efectivos de la versión fijada. PostgreSQL, MQTT, control de medios y Codex quedan locales; B configura autenticación/ACL del broker Aedes para clientes de servicio con permisos por hogar y topic, y A usa esa credencial acotada. No basta aceptar mensajes porque mencionan un UUID válido. Los secretos de publicación se guardan localmente y no viajan a la web/móvil; no abrirlos en el router. Para fuera de la LAN, VPN/HTTPS y posiblemente TURN son P2 con presupuesto y validación propios.

### 6.7 Calibración, referencias y artefactos

Los identificadores `pose_profile_id`, `reference_id` y `artifact_ref` son entidades reales del backend A, no strings arbitrarios ni archivos que el cliente pueda elegir. A implementa `GET /camera-sources`, `GET/POST /cameras/{id}/pose-profiles`, `GET/PATCH /pose-profiles/{id}`, `POST /cameras/{id}/references` y `GET/DELETE /references/{id}`. Registrar cambios en OpenAPI antes de usarlos desde B/móvil.

Un perfil de postura contiene `id`, `household_id`, `camera_id`, `revision`, `model_id`, `zone_revision`, `min_landmark_visibility`, `max_observation_gap_ms`, `standing_knee_angle_deg`, `standing_persistence_ms`, `fall_drop_body_heights`, `fall_drop_window_ms`, `low_posture_ratio`, `max_immobility_displacement_body_heights`, `validation_status` y `validation_report`. Son señales heurísticas de un prototipo; no clasificador médico.

Valores de partida para calibrar, nunca umbrales de seguridad garantizados: visibilidad mínima 0,7 en puntos requeridos; hueco máximo 500 ms; rodilla extendida desde 150 grados y postura de pie durante 2 s; descenso de centro corporal mayor a 0,6 alturas corporales en 1,5 s; caja corporal baja con relación alto/ancho menor a 0,8; desplazamiento máximo de centro 0,1 alturas corporales durante la ventana de inmovilidad. Se normaliza por la altura corporal de referencia observada con la persona de pie y se registra perspectiva. Si no puede obtenerse referencia ni puntos visibles, UNKNOWN. Debe existir una secuencia de descenso y permanencia baja: postura horizontal aislada no cumple.

Para STANDING_IN_ZONE, el perfil exige tobillos/caderas/rodillas visibles y apoyo dentro de la zona de sofá calibrada; estar de pie detrás del sofá no es lo mismo. Si la perspectiva no permite separar esos casos, el evaluador no pasa validación para esa cámara. Para caída, cortes de escena, cambio de stream, frame congelado o pérdida de observabilidad reinician la ventana; jamás se rellenan como segundos inmóviles. Estos valores se ajustan con el conjunto de calibración, se fijan en una revisión y luego se evalúan con escenas separadas.

`validation_report` contiene tipo de regla, versión de definición, cámara/zona/perfil/modelo y sus revisiones/hashes, fixture IDs usados, etiquetas humanas, TP/FP/FN/TN, intervalos UNKNOWN, latencia y limitaciones. La aprobación manual registra usuario y fecha. Los 10 positivos/10 negativos son un mínimo pedagógico de evaluación, no una certificación. No se optimiza sobre los mismos ejemplos que se reportan como evaluación independiente.

Referencia de puerta/objeto: `{id,camera_id,zone_id,zone_revision,kind:DOOR|OBJECT|SEQUENCE,artifact_ref,annotations,revision,status}`. Anotaciones de puerta incluyen ejemplos OPEN y CLOSED etiquetados; objeto incluye caja de referencia y ejemplos presente/ausente/ocluido. Un algoritmo puede usar comparación visual o revisión asistida, pero solo se activa si discrimina sus negativos. No se fuerza una regla basada en un clasificador preentrenado que no contiene ese objeto.

Tablas adicionales de A en migración 012: `hg_pose_profiles` con los campos anteriores y FK de hogar/cámara; `hg_reference_assets` con referencia/revisión/estado; `hg_artifacts` con ID opaco, hogar, propósito `CLIP/EVENT_SNAPSHOT/ENCOUNTER_SNAPSHOT/EXAMPLE/REFERENCE/VOICE`, ubicación interna, SHA-256, tipo MIME verificado, bytes, retención, estado y propietario de servicio. La parte de voz usa el mismo servicio de artefactos A desde B; no crea un almacén público paralelo.

`POST /internal/artifacts/register` acepta solo credencial de servicio con scope y un upload/ref local previamente emitido por el servidor; resuelve paths bajo `HG_MEDIA_ROOT` después de canonicalizar, bloquea escapes/symlinks y valida propósito/hogar/hash/bytes. El cliente no elige `C:\\Windows` ni una URL de descarga. `artifact_ref` nunca autoriza acceso por sí solo: toda lectura verifica usuario/hogar o credencial de servicio específica.

El estado de artefacto se separa de la referencia del clip. Bajar un clip a EXPIRED o DELETED elimina su acceso y el archivo cuando no haya otra referencia autorizada; la limpieza usa conteo de referencias y `protected_until`. Un snapshot de referencia solicitado por administrador, una miniatura autorizada de Personas y un clip son propósitos diferentes con retenciones explícitas. La regla de “no guardar clip” no debe dejar un EVENT_SNAPSHOT persistente escondido.

### 6.8 Efectos efectivos, modos y reanudación

`hg_events.decisions` congela `{rule_version_id,rule_enabled_at_match,mode,notify_requested,clip_requested,alarm_requested,emergency_requested,policy_revision,source,decided_at}`. El outbox aplica además las preferencias y permisos del destinatario al despachar. Cambios de permisos revocan acceso inmediatamente; cambios de notify afectan jobs aún no enviados. Conservar en auditoría la diferencia entre solicitado, autorizado, enviado y confirmado.

Un cambio de política de emergencia no altera silenciosamente el snapshot de un incidente existente; un administrador puede cancelarlo o resolverlo de manera explícita. Deshabilitar globalmente emergencias suspende jobs críticos no iniciados y deja incidentes pendientes en NEEDS_REVIEW. Un lease expirado no significa que sea seguro repetir una llamada o comando: consultar estado persistido y acuse antes de volver a emitir efectos.

El catálogo y sus revisiones se descargan mediante `/internal/vision/config`; `config.changed.v1` es una señal para reconsultar, no el documento de configuración completo. El worker reporta revisión aplicada. La API no anuncia activación operativa en una cámara hasta recibir ese ACK de configuración; mientras tanto muestra “guardada, pendiente de aplicar”.

Una propuesta de evento validada no otorga permiso para leer cualquier snapshot de otro hogar. Las referencias de evidencia y perfiles tienen el mismo control de pertenencia que las entidades principales. Las respuestas de proveedor o del modelo se validan de nuevo en el servidor aunque hayan pasado un JSON Schema en el proceso hijo.

## 7. Datos, migraciones y propiedad de archivos

### 7.1 Tablas nuevas

Prefijo `hg_` para nuevas tablas; no renombrar ni destruir tablas legacy en la primera integración. Cada tabla dependiente incluye `household_id` y FKs compuestas `(household_id,id)` hacia entidades del mismo hogar cuando corresponda. Todos los accesos filtran por hogar y las pruebas usan al menos dos hogares.

| Tabla | Campos principales y restricciones | Dueño |
|---|---|---|
| `hg_households` | id UUID, name, timezone, demo_mode=true | B |
| `hg_memberships` | household_id, user_id legacy, role; UNIQUE(household_id,user_id) | B |
| `hg_sessions` | id, user_id, household_id, token_hash UNIQUE, expires_at, revoked_at | B |
| `hg_events` | id, hogar, camera_id nullable, rule_version_id nullable, source, category, type, severity, summary, confidence nullable, occurred_at, received_at, status, decisions JSONB, dedupe_key | B |
| `hg_pending_correlations` | event_id UNIQUE, hogar, visual_candidate JSONB, device_id, expires_at, state PENDING/MATCHED/EXPIRED; solo metadatos | B |
| `hg_cooldowns` | hogar,camera_id,rule_id,event_type UNIQUE, cooldown_until,last_event_id,grouped_count; bloqueo por clave | B |
| `hg_event_receipts` | message_id UNIQUE, event_id, received_at; rechazo registrado sin efectos | B |
| `hg_outbox` | id, kind, payload, status, attempts, next_attempt_at, lease_until, lease_owner, idempotency_key UNIQUE | B |
| `hg_audit` | actor, action, entity, before/after saneados, request_id, timestamp | B |
| `hg_cameras` | id, hogar, name, source_type, source_ref, enabled, status, revision, last_heartbeat_at, deleted_at | A |
| `hg_zones` | id, camera_id, kind POLYGON/LINE, geometry JSONB, revision, deleted_at | A |
| `hg_rules` | id, hogar, enabled, active_version_id nullable, revision, deleted_at | A |
| `hg_rule_versions` | id, rule_id, version, definition JSONB, dependencies_snapshot JSONB, status, validation_report; UNIQUE(rule_id,version) | A |
| `hg_person_profiles` | id, hogar, display_name nullable, labels JSONB, notes, deleted_at | A |
| `hg_encounters` | id, cámara, stream_session_id, local_track_id, first_seen,last_seen, profile_id nullable, snapshot_ref; UNIQUE(camera_id,stream_session_id,local_track_id) | A |
| `hg_clips` | id, hogar, event_id, job_id UNIQUE, status, artifact_ref nullable, actual_start/end, sha256, bytes, expires_at, protected_until nullable | A |
| `hg_ai_jobs` | id, hogar, requester_id, type, status, input_refs, result JSONB, provider, model, error_code, usage_metadata saneada | A |
| `hg_examples` | id, hogar, uploader_id, artifact_ref, duration_ms, bytes, expires_at, status | A |
| `hg_camera_runtime` | camera_id, stream_session_id, revision, metrics JSONB, last_heartbeat_at | A |
| `hg_push_devices` | id, hogar, user_id, installation_id, token protegido, enabled, last_seen | B |
| `hg_notification_preferences` | hogar,user_id, categories, quiet_hours, critical_demo_override | B |
| `hg_notifications` | id,event_id,user_id,installation_id,status,provider_ticket,provider_receipt,error_code; UNIQUE(event_id,installation_id,channel) | B |
| `hg_emergency_profiles` | hogar UNIQUE, datos ficticios validados, version, updated_by | B |
| `hg_emergency_policies` | hogar UNIQUE, enabled, immobility_seconds, response_seconds, transport=SIMULATED, revision | B |
| `hg_emergency_incidents` | id,event_id UNIQUE, state, response_deadline, policy_snapshot, profile_snapshot, operator_id, state_revision | B |
| `hg_simulated_calls` | id,incident_id, state, audio_ref, attempts, timestamps | B |
| `hg_actuator_commands` | id, legacy_code, requested_state, confirmed_state, source, event_id nullable, ack_at, status, idempotency_key UNIQUE | B |
| `hg_sse_log` | sequence BIGSERIAL, hogar, event_name, entity_id, minimal_payload, expires_at | B |

Estados y restricciones se materializan con CHECK/UNIQUE/FK cuando sea viable. JSONB se valida en la capa de entrada y por contrato; no es un permiso para guardar cualquier estructura. Indexar eventos por `(household_id,occurred_at DESC,id)`, encounters por cámara/fecha, jobs por estado/next_attempt_at y clips por expires_at. La API usa una lista blanca de filtros, no concatena SQL de entrada.

### 7.2 Orden de migraciones y dependencias

1. B: `001_identity.sql`, crea hogares, membresías y sesiones; enlaza usuarios existentes.
2. B: `002_event_core.sql`, crea eventos/outbox/auditoría/correlaciones pendientes/cooldowns sin FK hacia cámaras/versiones aún inexistentes.
3. A: `010_cameras_people.sql`, crea cámaras, zonas, encuentros y perfiles.
4. A: `011_rules.sql`, crea reglas/versiones; agrega FK de `active_version_id` después de crear ambas tablas y asegura que esa versión pertenece a esa regla.
5. A: `012_media_ai.sql`, crea clips, ejemplos y jobs IA; puede referenciar eventos de 002.
6. B: `020_delivery_emergency.sql`, notificaciones, políticas, incidentes, llamadas y SSE.
7. B con revisión A: `021_cross_constraints.sql`, añade FKs de eventos a cámaras/versiones y restricciones cruzadas. `camera_id/rule_version_id` son nulos en eventos puramente IoT.
8. B: `022_legacy_adapters.sql`, vincula entidades legacy sin copiar/eliminar historia y prepara índices/compatibilidad.

Un runner en `backend-next/scripts/migrate.ts` mantiene `hg_schema_migrations(version,checksum,applied_at)`, usa advisory lock, transacción por migración y se detiene si cambia el checksum aplicado. Los seeds son un comando separado e idempotente, jamás ejecutados automáticamente con cada arranque. Las migraciones se prueban tanto en base vacía bootstrap como en una copia de la base instalada. Respaldar antes de migrar; un rollback de aplicación no ejecuta DROP de datos nuevos.

### 7.3 Directorios y responsables

```text
frontend-react/src/
  app/                           B: shell, router, sesión, navegación
  shared/                        B: cliente HTTP, componentes comunes, estilos
  features/cameras/               A
  features/people/                A
  features/movements/             A
  features/assistant/             A
  features/events/                B
  features/security/              B
  features/emergencies/           B
  features/settings/              B
backend-next/
  app/api/v1/...                  A/B según tabla de rutas
  lib/auth/, lib/events/          B
  lib/jobs/, lib/notifications/    B
  lib/emergencies/, lib/audit/     B
  lib/cameras/,lib/rules/          A
  lib/people/,lib/clips/,lib/ai/    A
  workers/eventProcessor.ts       B
  workers/aiWorker.ts             A
  workers/notificationWorker.ts   B
  migrations/                    Dueño según número
  scripts/                       B runner general; A pruebas de medios/IA
vision-worker/                   A: captura, modelos, reglas, segmentos, MQTT
mobile-app/                      B: aplicación Android completa
contracts/                       Ambos por dominio; cambios revisados juntos
tests/fixtures/                   Ambos, datos ficticios y fuentes etiquetadas
scripts/                         B supervisor; A entrega comandos health/start/stop
.local/                          Datos, binarios, modelos y secretos; NO versionar
```

Se podrán añadir archivos dentro de estos módulos sin una reunión por cada nombre. Cambiar un contrato, una responsabilidad o una ruta pública sí requiere acuerdo. B entrega puntos de extensión para las rutas A; A no reescribe el shell. El móvil B consume las APIs A, sin duplicar detección o reglas en el teléfono.

## 8. Reparto de trabajo, entregas y coordinación

| Paquete | Responsable A | Responsable B |
|---|---|---|
| Plataforma | Prueba de compatibilidad visión/Codex y herramientas de medios | Migraciones, auth, shell y supervisor |
| Cámaras | Backend, worker, zonas y UI web | Consumo móvil y estado global |
| Personas | Backend, encuentros y UI manual | Permisos, acceso móvil y auditoría transversal |
| Movimientos | Backend, catálogo, evaluadores, borradores y UI | Preferencias personales y visualización de resultados |
| Evidencia | Búfer, recorte, almacenamiento y endpoints de clips | Historial de eventos, enlaces, push y respuesta móvil |
| Seguridad | Señales visuales y evaluación | Orquestación, correlación de sensores, política y alarma simulada |
| Emergencias | Candidato de caída y observabilidad | Máquina de estados, cancelación, central simulada y voz |
| Integración | Revisión de B y evidencia visual | Revisión de A y evidencia de producto |

Cada persona recibe 60 puntos relativos, repartidos en 12 tareas. No son horas ni una garantía de igualdad perfecta. Tras los primeros dos hitos se comparan impedimentos y se mueve una tarea acotada si una mitad tiene mucho más trabajo; no se transfiere silenciosamente la propiedad de un contrato. Ambos participan de la integración final.

H0: B publica contratos/auth stub de tests y A publica fixtures; acuerdo de contratos. H1: cámara real -> evento propuesto -> evento persistido, aunque la UI sea mínima. H2: evento -> clip + historial. H3: regla de usuario -> validación -> activación. H4: Android recibe push y abre evento. H5: posible caída -> cancelación o central simulada. H6: prueba de regresión legacy y presentación reproducible.

Trabajar en ramas `feat/a-<tarea>` y `feat/b-<tarea>` con cambios pequeños. PR con problema, comportamiento resultante, contrato tocado, pruebas ejecutadas y evidencia. El otro integrante revisa; no editar a la vez `App.tsx`, migraciones ajenas o lockfiles compartidos sin coordinar. Configurar un único directorio `contracts/fixtures` para los ejemplos canónicos y no copiar variantes divergentes en cada lenguaje.

## 9. Pruebas, operación y aceptación global

### 9.1 Pruebas obligatorias

| Caso | Resultado que demuestra integración |
|---|---|
| Sin sesión / token vencido | No se accede a API, medios, clips, SSE ni datos personales |
| Hogar ajeno | No se leen ni modifican recursos aunque se conozca un UUID |
| Evento MQTT repetido | Una fila de evento y un conjunto de decisiones; no múltiples llamadas |
| Usuario cambia regla durante un evento | Se conserva versión y snapshot; las acciones críticas obedecen cancelación actual |
| Clip desactivado | No queda MP4/captura persistente de evidencia del evento; búfer temporal vence. Miniaturas de Personas requieren su política independiente explícita |
| Push desactivado | Hay historial si la regla está activa, sin job de notificación |
| Cámara pierde imagen | Estado offline; no inferir inmovilidad a partir de ausencia de frames |
| Codex sin cupo o login | Editor manual sigue disponible; cero afirmaciones de soporte IA falso |
| Reinicio con jobs pendientes | Recuperación idempotente de jobs y deadlines; sin ráfaga de llamadas por eventos antiguos |
| Disco lleno | Evento persistido, clip fallido con motivo y aviso operacional |
| Dos admins editan | Segundo recibe 409 y puede recargar; no se pierde cambio silenciosamente |
| Fuente grabada | Marcado REPLAY en todos los pasos, incluida notificación y llamada simulada |
| Android con red distinta | Mostrar desconexión; no sustituir la IP por localhost ni prometer acceso remoto |
| Modo DISARMED | No intrusión según política, pero caída posible sigue si está configurada para todos los modos |

Pruebas visuales separan participantes y escenas de entrenamiento/calibración de las usadas en evaluación. Registrar verdaderos positivos, falsos positivos y eventos omitidos por clase. Reportar precisión/recall cuando el tamaño de muestra lo permita; no inventar porcentajes con un único video. Para la demo, al menos 10 escenas positivas y 10 negativas por regla que se vaya a presentar como validada; documentar limitaciones de ese conjunto pequeño.

### 9.2 Objetivos medibles, no promesas previas

En dos cámaras de demo, objetivo inicial: evento local confirmado visible en web antes de 3 s en p95, excluyendo persistencias configuradas; clip listo antes de 20 s después del final de su ventana, sujeto a carga medida. Medir push por separado: tiempo interno, aceptación del proveedor y recepción observada. Las acciones revisadas con Codex son asíncronas y no se anuncian como tiempo real estricto.

Ensayar carga 1/2/4/6/10 fuentes, identificando si son reales o replays. Registrar CPU, RAM, GPU/VRAM, frames descartados, FPS efectivos, p50/p95 de latencia y errores. Al degradar, reducir FPS/resolución y mostrarlo. Nunca atribuir el rendimiento de un replay duplicado a diez cámaras físicas distintas.

### 9.3 Arranque, configuración y mantenimiento

Un supervisor con manifiesto de PIDs/puertos/binarios inicia: PostgreSQL, MQTT, MediaMTX, API, procesador de eventos, worker de visión, worker IA y servicio web. Antes de iniciar verifica puertos; no termina procesos ajenos. Workers no se arrancan desde el import de una ruta Next. Detener libera cámaras, conexiones y archivos de forma ordenada. Fallo de IA no debe detener la detección local.

Variables propuestas, con ejemplos sin secretos: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `MQTT_BROKER_URL`, `HG_SERVER_ORIGIN`, `HG_WEB_ORIGIN`, `HG_MEDIA_ROOT`, `HG_MODELS_ROOT`, `HG_DEMO_MODE=true`, `HG_EMERGENCY_TRANSPORT=SIMULATED`, `HG_INTERNAL_TOKEN`, `HG_CODEX_BIN`, `HG_CODEX_MODEL`, `HG_AI_MAX_REQUESTS_PER_HOUR`, `HG_EXPO_ACCESS_TOKEN` si se usa seguridad adicional de Expo. Web: `VITE_API_BASE_URL`; móvil: `EXPO_PUBLIC_API_BASE_URL`, solo origen público sin secretos.

Guardar `.env.example` sin credenciales. Excluir `.local/`, `.venv/`, modelos, videos, `.env*` salvo ejemplos, auth de Codex, tokens push y archivos con datos personales. Las credenciales de demo actuales se reemplazan por seed explícito y no se reutilizan en despliegue real. Registrar versiones y hashes de pesos/binarios descargados. Añadir un reporte de licencia por componente y por voz/modelo.

### 9.4 Criterio global de terminado

El prototipo está listo cuando otra persona puede clonar el mismo repositorio, preparar dependencias con instrucciones, migrar una base de prueba, iniciar servicios y reproducir H1 a H6. Los dos integrantes entregan sus tests, evidencias, límites conocidos y pasos de recuperación. Una pantalla con datos hardcodeados no cuenta como una integración; los fixtures solo cuentan en modo de prueba visible.

Se conservan monitoreo IoT, energía y plano existentes con permisos y etiquetas de simulación. El sistema puede demostrar un evento con clip sin push y otro con push sin clip. Se prueba “Estoy bien” para evitar escalamiento, una caída simulada sin respuesta y una cámara desconectada que no produce caída. Ninguna prueba realiza una llamada telefónica real.

## 10. Fuentes y decisiones que hay que revalidar

Referencias oficiales consultadas el 15 de noviembre de 2026. Los contratos anteriores son propuestas propias del proyecto; las fuentes documentan herramientas, no garantizan que HomeGuard ya las integre.

- [Repositorio de base](https://github.com/Ronicitop/HomeGuard-Project).
- [Codex app-server](https://learn.chatgpt.com/docs/app-server): integración local con texto/imágenes y autenticación; comprobar restricciones y versión antes de implementar.
- [Uso del plan de ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt): las integraciones compatibles comparten límites del plan; no asumir acceso universal ni ilimitado.
- [MediaMTX en Windows](https://mediamtx.org/docs/kickoff/install) y [webcams](https://mediamtx.org/docs/publish/generic-webcams).
- [WebRTC de MediaMTX](https://mediamtx.org/docs/features/webrtc-specific-features): verificar conectividad y codecs con clientes reales.
- [YOLOX](https://github.com/Megvii-BaseDetection/YOLOX), [ByteTrack](https://github.com/FoundationVision/ByteTrack) y [ONNX Runtime CUDA](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html): comprobar licencia de código/pesos y compatibilidad GPU.
- [MediaPipe Pose](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker): puntos corporales; la lógica temporal es responsabilidad de este proyecto.
- [Expo: configuración push](https://docs.expo.dev/push-notifications/push-notifications-setup/) y [preguntas frecuentes/costo](https://docs.expo.dev/push-notifications/faq/).
- [Piper: licencias de voces](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md), [Whisper.cpp](https://github.com/ggml-org/whisper.cpp) y [CVAT](https://github.com/cvat-ai/cvat) como herramientas opcionales.
- [Telefonía de emergencia de Twilio](https://www.twilio.com/docs/voice/tutorials/emergency-calling-for-programmable-voice): una integración telefónica real requiere verificar cobertura y condiciones; esta versión usa transporte simulado.

Las funciones locales no tienen tarifa por consulta, pero consumen equipo, electricidad y disco. Push y Codex requieren Internet; el uso de Codex consume el cupo del titular. No se contratarán servicios, activarán recargas ni publicarán puertos como parte automática de estos planes. Si el spike Codex no resulta compatible, el editor manual y un adaptador de IA falso solo para pruebas permiten continuar; una API pagada o un modelo local alternativo requieren decidirlo expresamente.

## 11. Tu mitad: integrante A — cámaras, visión, reglas, personas y evidencia

### 11.1 Objetivo propio

Entregar una fuente de video real que pueda configurarse, producir observaciones temporales, evaluar reglas soportadas, proponer eventos al núcleo B y generar evidencia reproducible. También entregar las pantallas web de Cámaras, Personas, Movimientos y Asistente. El trabajo incluye los endpoints correspondientes, no solo el modelo de IA.

No implementar por separado login, historial global, push ni máquina de emergencias: se consumen de B. Tu worker no llama a servicios de emergencia ni manda push directamente. Su salida es una observación validable y, cuando corresponda, un clip.

### 11.2 Qué entregás a tu compañero

1. API de configuración de cámaras, zonas, personas, reglas, ejemplos y clips.
2. `vision-worker` con start/stop/health documentados, publicador de webcam y fixtures.
3. Mensajes MQTT del contrato común con IDs estables y marca de origen.
4. Un evaluador que distingue `MATCH`, `NO_MATCH`, `UNKNOWN`, `UNSUPPORTED`.
5. Handler idempotente de jobs de clip y biblioteca de persistencia de resultados.
6. Borradores asistidos por Codex sin activación automática.
7. Pantallas A exportadas para que el shell B las incorpore.
8. Pruebas con escenas positivas/negativas y métricas reales del equipo.

### 11.3 Qué necesitás de B y cómo avanzar sin bloquearte

Consumís auth, migraciones base 001/002, outbox, ingesta de eventos y shell. Antes de tenerlos, usar adaptadores de test en procesos separados: `AuthContext` falso solo en tests, broker local con fixtures y memoria en repositorios de prueba. No meter un `if demo: admin` en endpoints reales.

Desde H1 debés integrar al servidor real de B. Un mock verde por sí solo no cierra una tarea de integración. Para las pantallas, acordar exports `CamerasPage`, `PeoplePage`, `MovementsPage`, `AssistantPage`, y funciones del cliente compartido `api.get/post/patch/delete` con origen configurado.

## 12. Estructura de implementación A

Crear archivos pequeños con estas responsabilidades. Los nombres internos pueden ampliarse; las interfaces públicas del contrato se conservan.

```text
vision-worker/
  pyproject.toml
  src/homeguard_vision/
    __main__.py             CLI: start, doctor, list-sources, replay
    config.py               validación, paths y parámetros
    supervisor.py           ciclo de cámaras y apagado
    capture.py              captura única desde MediaMTX
    detection.py            preprocess/inference/postprocess ONNX
    tracking.py             ByteTrack y stream_session_id
    pose.py                 adaptador MediaPipe y observabilidad
    geometry.py             polígonos, líneas y transformaciones
    rules.py                dispatch a evaluadores por kind
    temporal.py             ventanas, persistencia y cooldown local
    segments.py             búfer, holds y limpieza
    clips.py                recorte, hash, manifest idempotente
    mqtt_client.py          validación, QoS y reintentos
    health.py               métricas y heartbeat
  tests/                    unitarias, fixtures, integración controlada
backend-next/lib/
  cameras/{cameraService,mediaSessionService,sourceRegistry}.ts
  rules/{ruleService,ruleValidationService,ruleDefinition}.ts
  people/{profileService,encounterService}.ts
  clips/{clipService,artifactStore}.ts
  ai/{provider,codexProvider,draftService,promptBuilder}.ts
backend-next/workers/aiWorker.ts
frontend-react/src/features/
  cameras/{CamerasPage,CameraForm,CameraDetail,ZoneEditor}.tsx
  people/{PeoplePage,EncounterList,ProfileEditor}.tsx
  movements/{MovementsPage,RuleEditor,RuleTrial,RuleHistory}.tsx
  assistant/{AssistantPage,DraftReview,ExampleUpload}.tsx
contracts/schemas/{rule-definition,detection-proposed,clip-requested,clip-result}.schema.json
contracts/fixtures/{rule-zone-entry,detection-live,clip-ready}.json
```

No versionar pesos ni videos de participantes. Los pequeños fixtures geométricos sintéticos sí pueden versionarse; los clips evaluativos se acompañan con manifiesto de origen, consentimiento, hash y método de obtención.

## 13. Plan de tareas A — 60 puntos relativos

Los comandos siguientes son la interfaz objetivo de pruebas que se implementará con cada tarea; salvo los builds existentes, no se afirma que esos scripts ya existan. En TS, ejecutar desde `backend-next` o `frontend-react` según el archivo; en Python, desde `vision-worker`. Todas las tareas incluyen registrar evidencia y un commit revisable.

| ID | Tarea | Puntos | Depende de |
|---|---|---:|---|
| A01 | Compatibilidad, contratos A y primer frame | 3 | Acuerdo H0 |
| A02 | Cámaras, fuentes y sesiones de medios | 5 | B01/B02; puede iniciarse con fixtures |
| A03 | Captura, inferencia y tracking | 5 | A01/A02 |
| A04 | Zonas y editor geométrico | 4 | A02 |
| A05 | Reglas deterministas y versionado | 7 | A03/A04, contrato de outbox B |
| A06 | Posturas, caída posible y catálogo avanzado | 6 | A03/A05 |
| A07 | Perfiles y encuentros manuales | 5 | A03, auth B |
| A08 | Búfer, clips y almacenamiento | 6 | A02, B04 |
| A09 | Spike e integración segura Codex | 5 | A01, jobs B |
| A10 | Asistente y ensayos de reglas en web | 6 | A05/A06/A09 |
| A11 | Persistencia, recuperación y diagnóstico | 4 | A03/A08, B11 |
| A12 | Evaluación, entrega e integración cruzada | 4 | A01-A11, H1-H6 |

### A01. Compatibilidad, contratos y primer frame — P0

**Archivos:** crear `vision-worker/pyproject.toml`, `vision-worker/src/homeguard_vision/{__main__,config,health}.py`, schemas/fixtures A y `backend-next/scripts/doctor-ai.ts`. Crear `tests/test_config.py` y `tests/test_contracts.py`.

**Interfaces:** `load_config(env: Mapping[str,str]) -> VisionConfig`; `doctor() -> HealthReport`; CLI `python -m homeguard_vision doctor`. `HealthReport` indica versión de runtime, providers ONNX disponibles, binarios, modelos, acceso a fuente y errores sin credenciales.

- [ ] Crear tests que rechacen modelo inexistente, dimensiones negativas, FPS cero y JSON de evento sin `stream_session_id`. Un fixture canónico debe validar igual en Python y TS.
- [ ] Ejecutar `python -m pytest tests/test_config.py tests/test_contracts.py -q`; comprobar fallos por implementaciones ausentes, no por un error accidental de importación del entorno.
- [ ] Crear venv local, fijar un conjunto compatible de OpenCV/ONNX/MediaPipe tras una prueba mínima, registrar versiones y hashes. No instalar cinco variantes de ONNX en el mismo venv.
- [ ] Mostrar un frame de una webcam real a través de la cadena propuesta. Registrar si el provider real es CUDA o CPU; una instalación que cae a CPU debe decirlo.
- [ ] Volver a ejecutar tests y `doctor`; guardar resumen de compatibilidad. Commit `chore(vision): establish validated runtime and contracts`.

**Aceptación:** el compañero puede identificar qué requisito falta sin inspeccionar un traceback; ninguna cámara/modelo se declara soportado solo por haber descargado un paquete.

### A02. Gestión de cámaras, fuentes y sesiones — P0

**Archivos:** migración `010_cameras_people.sql` en su parte cámara, `lib/cameras/*.ts`, rutas cámaras, componentes `CamerasPage`, `CameraForm`, `CameraDetail`, `vision-worker` adaptador de publicación y configuración MediaMTX fuera de secretos versionados.

**Interfaces:** `createCamera(ctx:AuthContext,input:CameraInput):Promise<CameraView>`; `testCamera(ctx,id):Promise<{job_id:string}>`; `createPlaybackSession(ctx,id):Promise<{url:string,expires_at:string,protocol:'WEBRTC'|'HLS'}>`; `enumerateLocalSources():SourceDescriptor[]` ejecutado en el equipo de captura.

- [ ] Tests `cameraService.test.ts`: alta 11 rechazada, dos altas concurrentes con 9 cámaras dejan como máximo 10, cámara ajena 404 y `CameraView` no contiene contraseña/source_ref.
- [ ] Ejecutar `npm run test -- tests/cameras/cameraService.test.ts`; verificar rojo antes del servicio.
- [ ] Implementar source registry: `USB_LOCAL` por nombre/ID estable del host, RTSP validado y permitido, archivo del almacén autorizado, publicador con credencial temporal. No aceptar `file:///C:/...` ni acceso RTSP a cualquier servicio interno: permitir solo fuentes registradas por administrador y negar loopback/metadata/control internos cuando el origen sea remoto.
- [ ] Conectar prueba de fuente, alta, editar, deshabilitar y reconectar. La UI muestra motivo de fallo y permite corregirlo; deshabilitar libera la webcam y cierra lectores.
- [ ] Probar expiración/revocación del token de medios, publicación no autorizada y navegación a medios sin API. Build frontend y tests; commit `feat(cameras): manage authenticated local camera streams`.

**Ejemplo:** una webcam está ocupada por una videollamada. El sistema muestra “dispositivo ocupado” y no elimina la configuración ni roba la cámara a otro proceso. Con dos webcams del mismo modelo, el source registry muestra un identificador diferenciable y permite volver a seleccionar después de reconexión.

### A03. Captura, inferencia y tracking — P0

**Archivos:** `capture.py`, `detection.py`, `tracking.py`, `supervisor.py`, `health.py`, tests de captura/modelo/tracking.

**Interfaces:** `read_latest(camera_id) -> FramePacket|None`; `detect(frame:FramePacket) -> list[Detection]`; `update_tracks(frame, detections) -> list[TrackObservation]`. `FramePacket` lleva cámara, sesión de stream, número de frame, reloj monotónico para duración y UTC para correlación. `TrackObservation` lleva bounding box normalizada, confidence y observability.

- [ ] Tests con secuencia sintética: cola nunca supera 2, frames procesados mantienen orden, misma trayectoria mantiene ID y reinicio de stream genera namespace distinto. `assert key(cam1,s1,17) != key(cam2,s2,17)`.
- [ ] Ejecutar `python -m pytest tests/test_capture.py tests/test_tracking.py -q` en rojo.
- [ ] Implementar detector ONNX con letterbox, transformación inversa y NMS; validar visualmente que las cajas vuelvan al espacio correcto. Aislar dependencias ByteTrack de un viejo repositorio de entrenamiento; pin de implementación y licencia de terceros.
- [ ] Aplicar captura única/redistribución, límites por cámara, cancelación y backpressure. Una excepción de una cámara no termina las demás.
- [ ] Verificar un replay etiquetado y una webcam LIVE, cambio de iluminación y dos personas que se cruzan; registrar cambios de ID y limitaciones. Tests y commit `feat(vision): detect and track bounded live streams`.

**Aceptación:** ninguna trayectoria se muestra como identidad personal. Si el modelo no ve una persona por oclusión, la observación es UNKNOWN/LOST, no “persona ausente confirmada”.

### A04. Zonas y editor — P0

**Archivos:** `geometry.py`, servicio zonas, rutas `/zones`, `ZoneEditor.tsx`, tests de geometría e interacción web.

**Interfaces:** `contains(point,polygon) -> bool`; `crossing(previous,current,line,direction) -> bool`; `saveZone(ctx,input,expected_revision):Promise<ZoneView>`.

- [ ] Tests: rechazar polígono autointersectado, menos de 3 vértices, coordenadas fuera de `[0,1]`; línea A->B no se dispara B->A; borde exacto se considera dentro de polígono. Definir epsilon `1e-6` para pruebas numéricas.
- [ ] Ejecutar pytest de geometría y test frontend `ZoneEditor.test.tsx` en rojo.
- [ ] Implementar herramientas dibujar/mover/eliminar vértice, cancelar cambios, guardar y preview con overlay. El usuario no debe escribir coordenadas a mano para una zona normal.
- [ ] Cambiar tamaño de ventana y orientación del video; verificar que dibujo, detector y clip señalen el mismo lugar. Cambio de geometría incrementa revisión y marca validaciones dependientes como obsoletas.
- [ ] Tests, build y commit `feat(zones): edit versioned normalized camera geometry`.

### A05. Reglas deterministas y versiones — P0

**Archivos:** `011_rules.sql`, `ruleService.ts`, `ruleValidationService.ts`, schemas, `rules.py`, `temporal.py`, `RuleEditor.tsx`.

**Interfaces:** `evaluate(rule:RuleDefinition,window:ObservationWindow,ctx:RuleContext) -> EvaluationResult`; `EvaluationResult={state,reason,evidence,proposed_event?}`; `activateRule(ctx,rule_id,version_id,expected_revision):Promise<RuleView>`. Para `SENSOR_CORRELATION`, A produce candidato visual y B completa la correlación según §6; A no crea por su cuenta evento confirmado sin sensor.

- [ ] Tests de tabla con reloj inyectable: 999 ms en zona no cumple persistencia 1000; 1000 sí; cooldown 30 s suprime repetición; modo/horario fuera de alcance no genera candidato; regla deshabilitada no se evalúa.
- [ ] Ejecutar `python -m pytest tests/test_rules.py tests/test_temporal.py -q` y `npm run test -- tests/rules/ruleService.test.ts` en rojo.
- [ ] Implementar ZONE_ENTRY, LINE_CROSS y DWELL, validación de SENSOR_CORRELATION sin ciclos y validación inmutable de versiones. Zona/regla/persona referida debe ser del mismo hogar.
- [ ] Crear endpoint de activación con transacción, revisión optimista y notificación de cambio mediante outbox B. Worker carga snapshot de config, informa su revisión y no mezcla mitad de versión vieja con mitad de nueva.
- [ ] Probar dos admins activando versiones, desconexión de worker y evento de versión anterior. Verificar con B qué versión aplicó y qué decisiones se conservaron. Commit `feat(rules): evaluate and activate validated rule versions`.

**Ejemplo:** cambiar la heladera de cámara no modifica retroactivamente los clips anteriores. La nueva versión queda en borrador hasta repetir el ensayo sobre esa cámara.

### A06. Posturas y reglas avanzadas — P1

**Archivos:** `pose.py`, evaluadores separados en `evaluators/{standing,fall,door,object_removed,visual_sequence}.py`, perfiles de calibración, reportes de validación y fixtures sin biometría.

**Interfaces:** `estimate_pose(frame,track) -> PoseObservation`; `PoseObservation` distingue `VISIBLE/PARTIAL/LOST`, puntos con visibilidad y calidad. `evaluate_fall(window,profile) -> EvaluationResult`; `Capabilities` enumera tipos disponibles y versión de perfil/modelo.

- [ ] Tests: caída seguida de visibilidad suficiente puede generar candidato; acostarse lentamente no; frame congelado/cámara caída/persona ocluida producen UNKNOWN. `assert evaluate_fall(camera_offline).state == 'UNKNOWN'`.
- [ ] Ejecutar `python -m pytest tests/test_pose_rules.py -q` en rojo.
- [ ] Desarrollar calibración de postura por cámara con ejemplos normales, zonas de suelo/sofá y umbrales configurables. No usar una regla universal de una sola coordenada Y. Medir persistencia con tiempo, no con número fijo de frames.
- [ ] Para puerta/objeto, capturar referencia autorizada, verificar visibilidad y estado de zona. Para secuencias complejas, ejecutar revisión temporal asistida como experimental; si no hay evidencia suficiente o proveedor disponible, devolver UNKNOWN/UNSUPPORTED, nunca un resultado inventado.
- [ ] Evaluar 10 positivos y 10 negativos por clase presentada, incluyendo agacharse/recostarse/objeto tapado. Commit `feat(vision): add calibrated posture and experimental action evaluators`.

**Aceptación:** el informe enumera acciones reales que funcionan en el montaje, errores observados y acciones que siguen sin soporte. A evalúa la inmovilidad visible de la política B antes de emitir POSSIBLE_FALL y adjunta su intervalo como evidencia; B abre el plazo de respuesta sin duplicar esa espera. Ninguna de las dos mitades entrega un diagnóstico.

### A07. Personas y encuentros manuales — P0/P1

**Archivos:** completar `010_cameras_people.sql`, `profileService.ts`, `encounterService.ts`, endpoints y `PeoplePage.tsx`, `EncounterList.tsx`, `ProfileEditor.tsx`.

**Interfaces:** `upsertEncounter(observation:EncounterObservation):Promise<EncounterView>`; `assignProfile(ctx,encounter_id,profile_id|null,expected_revision):Promise<EncounterView>`. El metadata de encuentro usa su propio mensaje `encounter.observed.v1`, definido por A y consumido por B para invocar el servicio A; no fabricar una alerta por cada frame.

- [ ] Tests: 50 observaciones de la misma trayectoria generan un encuentro; cámara/sesión distintas crean encuentros distintos; asignación manual auditada; no hay búsqueda por rostro ni asociación automática por miniatura.
- [ ] Ejecutar `npm run test -- tests/people/encounterService.test.ts` en rojo.
- [ ] Implementar perfiles con etiquetas `residente/visitante/trabajador/sin_identificar` editables, sin confundir etiqueta con rol de usuario. “Residente” en Personas no concede permisos de aplicación.
- [ ] Miniaturas solo con política explícita de cámara; si están desactivadas, avatar y metadatos. Borrar perfil ofrece desvincular encuentros, no elimina en cascada incidentes ni su evidencia protegida.
- [ ] Probar listado, filtros, edición, desvincular y retención de encuentros sin etiquetar. Commit `feat(people): manage anonymous encounters and manual profiles`.

### A08. Clips, búfer y almacén — P0

**Archivos:** `012_media_ai.sql`, `segments.py`, `clips.py`, `artifactStore.ts`, `clipService.ts`, endpoints de streaming y pruebas de FFmpeg controladas.

**Interfaces:** `hold_segments(camera_id,session_id,event_time) -> HoldRef`; `create_clip(job:ClipJob) -> ClipResult`; `recordClipResult(result:ClipResult):Promise<ClipView>` exportado para que el consumidor B lo llame; `openAuthorizedArtifact(ctx,clip_id,range):StreamResponse`.

- [ ] Tests: clip completo cubre t-5/t+10; falta de pre-roll da PARTIAL con duración real; duplicate job no crea segundo archivo; ruta `../../...` rechazada; disco lleno produce FAILED conservando evento.
- [ ] Ejecutar `python -m pytest tests/test_segments.py tests/test_clips.py -q` y `npm run test -- tests/clips/clipService.test.ts` en rojo.
- [ ] Implementar segmentos temporales con reloj común, holds en disco y manifiestos atómicos. Mantener hold durante candidato/espera, máximo configurable 120 s sin job válido. Librar holds rechazados o expirados.
- [ ] Recortar con límites reales, verificar ffprobe y tolerancia de duración objetivo ±1 s para video estable. Si se usa stream-copy con keyframes, mostrar el rango real; para precisión requerida, recodificar solo el fragmento. Escribir temporal y rename al final para no servir MP4 incompleto.
- [ ] Persistir resultado idempotente por job, hash/bytes y rutas opacas. Probar Range 206 y hogar ajeno 404. Retención elimina archivos y cambia estado, nunca elimina evento. Commit `feat(clips): produce authorized idempotent event evidence`.

**Ejemplo:** el evento llegó diez segundos tarde pero el hold conservó segmentos. Si el worker reinició y falta el pasado, entregar PARTIAL y decir qué intervalo se perdió; no rellenar repitiendo frames para aparentar 15 segundos.

### A09. Integración Codex verificable — P0 spike / P1 asistencia real

**Archivos:** `lib/ai/{provider,codexProvider,promptBuilder}.ts`, `workers/aiWorker.ts`, schema de salida de borrador, tests con proveedor falso y script `doctor-ai.ts`.

**Interfaces:** `AiProvider.proposeRule(input:DraftInput,signal:AbortSignal):Promise<RuleDraftResult>`; resultado `{status:'DRAFT'|'NEEDS_INPUT'|'UNSUPPORTED',definition?,questions:string[],limitations:string[],provider_info}`. No retorna funciones ejecutables ni comandos.

- [ ] Tests con provider falso: salida con SQL/código o kind no permitido se rechaza; timeout y sesión ausente se distinguen; no se activa regla; cola llena informa error recuperable. `expect(result.active).toBeUndefined()` y cero llamadas al servicio de activación.
- [ ] Ejecutar `npm run test -- tests/ai/codexProvider.test.ts tests/ai/draftService.test.ts` en rojo.
- [ ] Ejecutar spike real acotado con autorización del titular: comprobar `codex --version`, `codex login status` y capacidades. Probar una instrucción ficticia y una imagen sintética con JSON Schema. Registrar si consume el acceso ChatGPT esperado. No asumir compatibilidad de RPC moderno con CLI 0.92.0; fijar un runtime compatible local al proyecto si hace falta, sin actualizar globalmente la PC a ciegas.
- [ ] Elegir un solo transporte detrás de la interfaz: app-server oficial o ejecución CLI soportada. La CLI observada ofrece `exec`, `--json`, `--image`, `--output-schema` y `--sandbox read-only`; esos flags no son por sí solos un aislamiento completo. El adaptador debe negar herramientas de escritura/ejecución y restringir lectura a imágenes saneadas y esquemas. Si la versión no permite imponerlo, dejar el proveedor deshabilitado hasta disponer de un aislamiento verificable. No fiarse de un prompt que diga “no ejecutes”.
- [ ] No leer ni copiar tokens de auth al repositorio/móvil, no automatizar la web de ChatGPT y no hacer llamadas directas a endpoints internos no documentados. Proceso hijo con entorno saneado, sin claves API heredadas que cambien la facturación, cwd de trabajo limitado y args por array, nunca shell construido con el prompt.
- [ ] Validar entrada/salida y convertir referencias de imagen a IDs del almacén. Textos visibles en un video son datos no confiables; una cartulina “ignora instrucciones” no modifica permisos. Aplicar 1 concurrencia, cola 5 y timeout 90 s; salir por cupo/login sin reintentos infinitos. Tests y commit `feat(ai): integrate bounded local Codex rule drafting`.

**Aceptación:** si no se ha probado la consulta real, la pantalla dice “asistente pendiente de configuración”. Si se agota el cupo, el editor manual sigue funcionando. Los modelos de la API pagada no se presuponen disponibles por nombre en la cuenta Codex; se usa el modelo comprobado y se registra.

### A10. Editor asistido, ejemplos y ensayo — P1

**Archivos:** `AssistantPage.tsx`, `DraftReview.tsx`, `ExampleUpload.tsx`, `RuleTrial.tsx`, servicios de ejemplos y endpoints de drafts/validación.

**Interfaces:** `createDraft(ctx,{prompt,example_id?}):Promise<AiJobView>`; `runTrial(ctx,rule_version_id,example_id):Promise<TrialReport>`; `TrialReport={matches,non_matches,unknown_ranges,latency,limitations,source:'REPLAY'}`.

- [ ] Tests: prompt “avisame cuando abra la heladera” sin cámara devuelve NEEDS_INPUT; archivo >50 MiB da 413; MP4 inválido da 415/422; propuesta no soportada no ofrece Activar.
- [ ] Ejecutar tests `draftFlow.test.ts`, `examples.test.ts` y Playwright `assistant.spec.ts` en rojo.
- [ ] Implementar conversación de aclaraciones con cámara, zona, condición observable y controles notify/clip. El asistente puede sugerir nombre “Heladera abierta”; el usuario lo revisa. No enviar todas las cámaras ni horas de grabación a Codex.
- [ ] Adjuntar ejemplo, seleccionar intervalo, revisar secuencia y ejecutar un ensayo sobre grabación con marca REPLAY. Un único ensayo positivo no basta para declarar VALIDATED: el reporte registra también negativos y aprobación manual del administrador.
- [ ] Activación explícita sobre la versión ensayada; cambios posteriores invalidan validación si modifican condición/cámara/zona/modelo. Probar error de Internet y reanudar desde borrador guardado. Commit `feat(movements): review and trial assisted action rules`.

### A11. Recuperación y operación de medios — P0/P1

**Archivos:** `supervisor.py`, `health.py`, adaptadores de inicio/parada para B, tests de recuperación, limpieza de temporales y manifiestos.

**Interfaces:** `startCamera(config)`, `stopCamera(camera_id)`, `reloadConfig(revision)` y heartbeat contractual. Los comandos CLI devuelven códigos de salida diferenciados para configuración, fuente y runtime; no loguean URLs RTSP con contraseña.

- [ ] Tests: reinicio cambia stream_session_id, no repite clip terminado, libera cámara, preserva holds válidos y no borra artefacto protegido. Health no revela paths/secretos.
- [ ] Ejecutar suites de recuperación en rojo y preparar scripts de fallo controlado solo sobre procesos del proyecto.
- [ ] Implementar backoff 1/2/5/10 s para cámara, con límite 10 s y sin bucle de CPU; recarga de config versionada; cola de métricas limitada.
- [ ] Entregar a B comandos de start/stop/doctor y lista exacta de puertos. Verificar que detener la app no termina Meet, Brave ni otra aplicación que use webcam.
- [ ] Probar reinicio con clip PENDING y configuración cambiada. Commit `fix(vision): recover streams and evidence jobs safely`.

### A12. Evaluación y entrega A — P0/P1

**Archivos:** tests de contratos compartidos, fixtures evaluativos, scripts de benchmark y documento de resultados dentro del repositorio durante la implementación.

**Interfaces:** `benchmark --sources <manifest> --duration 120 --report <file>` y resultado con fuentes, hardware, modelos, CPU/RAM/VRAM, FPS y p50/p95. No mezclar métricas de captura y análisis.

- [ ] Completar tabla de cobertura A01-A11 y probar con contratos B reales, no solamente dobles de prueba.
- [ ] Ejecutar pytest completo, tests TS de módulos A y build frontend/backend. No exigir lint limpio del monolito legacy sin acordar qué deuda se está abordando; el código nuevo sí debe pasar sus reglas configuradas.
- [ ] Ejecutar cargas 1/2/4/6/10, indicando cantidad de webcams reales frente a replays. Identificar capacidad medida de demo y configurar degradación visible.
- [ ] Revisar con B una notificación que abre un clip propio, un clip ajeno rechazado, un evento sin clip y una caída con pérdida de imagen que no escala.
- [ ] Entregar inventario de modelos/licencias, instrucciones de publicación de webcam remota, límites observados y grabación de evidencia académica con participantes informados. Commit `test(vision): document integrated demo evaluation`.

## 14. Escenarios de aceptación específicos de A

| ID | Preparación y acción | Resultado esperado |
|---|---|---|
| A-S01 | Webcam real y regla de zona; persona entra desde afuera | Evento con cámara/versión/trayectoria correctas y marca LIVE |
| A-S02 | Persona camina junto al borde sin entrar | No evento; overlay permite explicar por qué |
| A-S03 | Cambiar tamaño del navegador y mover zona | Coordenadas normalizadas conservan ubicación |
| A-S04 | Persona sentada en sofá y luego de pie | Solo la postura calibrada persistente cumple; si no es visible, UNKNOWN |
| A-S05 | Objeto tapado y después destapado | No afirmar retiro confirmado durante oclusión |
| A-S06 | Renombrar encuentro como “Juan” y reiniciar cámara | Nueva trayectoria no se asocia automáticamente al perfil |
| A-S07 | Crear regla por prompt sin cámara seleccionada | Pide cámara/zona, conserva borrador, no activa |
| A-S08 | Subir video con instrucciones maliciosas escritas | Se trata como imagen, no ejecuta herramientas ni cambia permisos |
| A-S09 | Desactivar clip y activar notificación | No MP4 persistente por esa regla; B puede notificar el evento |
| A-S10 | Desconectar webcam durante clip | PARTIAL/FAILED honesto, evento conservado |
| A-S11 | Mandar dos veces el mismo job | Mismo resultado/artefacto, sin duplicado |
| A-S12 | Ejecutar sin CUDA | CPU fallback explícito, límites reducidos y métricas reales |
| A-S13 | Cambiar zona de regla ya validada | Validación obsoleta; exige nuevo ensayo antes de activar versión |
| A-S14 | Codex sin login o sin cupo | Mensaje accionable y editor manual operativo |
| A-S15 | Acceso a stream con token vencido | Rechazado; renovar exige sesión válida |

## 15. Guía de trabajo con B y lista de cierre A

Primer intercambio: A entrega fixture de propuesta y mock de clip READY/PARTIAL; B devuelve fixture de evento persistido y job. Compararlos con el mismo validador de contratos. Segundo intercambio: una webcam real y la ingesta transaccional. No esperar a tener todas las pantallas para unirlos.

Cuando aparezca una duda visual, adjuntar la secuencia, timestamps, salida del modelo y regla/versión. “La IA se equivocó” no es diagnóstico suficiente: distinguir captura, caja, tracker, observabilidad, condición y orquestación. No subir esos videos a un issue público.

- [ ] Tu mitad compila y arranca en el mismo repositorio sin reemplazar el trabajo B.
- [ ] Cada endpoint A usa auth y scoping de B.
- [ ] Ningún dato del tracker se presenta como identificación facial.
- [ ] Cada clase del catálogo declara disponibilidad y limitaciones reales.
- [ ] Se puede configurar, ensayar, activar y desactivar una regla sin tocar código.
- [ ] La evidencia incluye pre/post cuando está disponible y estados parciales cuando no.
- [ ] Codex se probó con el acceso correcto o aparece explícitamente deshabilitado.
- [ ] Los mensajes repetidos y reinicios no duplican evidencia.
- [ ] Tu compañero puede consumir los endpoints desde Android y el historial.
- [ ] Ambos revisaron los escenarios A-S01 a A-S15 y H1 a H6.

## 16. Qué leer del documento B al integrar

El otro documento desarrolla B01-B12: base/auth, shell, ingesta, entrega, alarmas, móvil, emergencia/voz, operación y pruebas finales. Las dependencias principales para A son `AuthContext`, runner de migraciones, `enqueueJob`, `recordEvent`, recepción MQTT única, SSE y flujo de incidentes. Su implementación pertenece a B; los cambios que necesites se acuerdan en contrato y se revisan juntos.

Conservar este documento como checklist vivo: marcar pasos terminados con referencia al commit y evidencia, no solo con una fecha. Una tarea queda completa cuando funciona con su vecino real y tiene limitaciones documentadas.
