# HomeGuard — Mitad B: Plataforma, eventos, Android, seguridad y emergencias — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Para el equipo humano, los mismos pasos sirven como lista de trabajo y revisión entre compañeros.

**Goal:** ampliar el repositorio HomeGuard existente con la mitad B de un prototipo universitario de observación doméstica por cámaras, integrado con la otra mitad y verificable en una demostración.

**Architecture:** React y Next.js existentes con PostgreSQL como fuente de verdad, medios y visión en procesos locales persistentes y comunicación por contratos versionados. Las acciones se orquestan con eventos/jobs duraderos; Android consume la misma API. GPT/Codex asiste en consultas acotadas con la sesión del titular cuya integración debe probarse.

**Tech Stack:** React, TypeScript, Vite, Next.js, PostgreSQL, MQTT/Aedes, Python, OpenCV, ONNX Runtime, YOLOX, ByteTrack, MediaPipe, MediaMTX, FFmpeg, Codex local, React Native/Expo y Piper según el módulo.

**Spec:** especificación íntegra en los apartados 1 a 10 de este mismo documento, contrato `HG-CONTRACT-1.0`. Plan complementario: [2026-11-15-homeguard-mitad-a.md](2026-11-15-homeguard-mitad-a.md).

**Fecha:** 15 de noviembre de 2026, zona de presentación America/La_Paz. **Asignación:** integrante B, 60 puntos relativos. Los nombres A/B pueden sustituirse por los de los compañeros sin cambiar responsabilidades.

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

## 11. Tu mitad: integrante B — plataforma, eventos, móvil, seguridad y emergencias

### 11.1 Objetivo propio

Convertir las observaciones de A en una experiencia completa: acceso autorizado, configuración consistente, historial confiable, avisos móviles, acciones auditadas y una central de emergencias simulada. Tu mitad incluye la aplicación Android y la coordinación de procesos persistentes; no consiste solamente en desarrollar pantallas.

La detección visual, zonas, reglas, perfiles manuales, clips y el adaptador Codex pertenecen a A. Tu procesador valida sus mensajes, persiste las decisiones y solicita efectos mediante jobs. No reimplementar un detector diferente en el móvil ni producir un clip ficticio para ocultar un fallo del worker.

### 11.2 Qué entregás a tu compañero

1. Runner de migraciones, contexto de autenticación y autorización reusable.
2. Shell web y puntos de extensión para los módulos A.
3. Único consumidor de eventos MQTT de la aplicación y orquestador duradero.
4. Servicio outbox/jobs con reintentos, recuperación e idempotencia.
5. Historial de eventos, estados, filtros y SSE.
6. Alarmas/sensores legacy protegidos y transporte simulado verificable.
7. Aplicación Android, preferencias y notificaciones push.
8. Perfil/política de emergencia, incidentes, cancelación, central y audio del bot.
9. Supervisor, diagnóstico y documentación de arranque del conjunto.

### 11.3 Qué necesitás de A y cómo avanzar sin bloquearte

Desde H0 consumís schemas y fixtures canónicos de detección, clip y regla. Mientras A prepara cámaras reales, tu integración usa un publicador de fixtures marcado SIMULATED en un entorno de pruebas. Tus pantallas no deben asumir que `clip.status=READY` siempre ni que toda cámara está ONLINE.

El móvil consume `/cameras`, `/rules`, `/people`, `/events` y `/clips`. Las tres primeras APIs las implementa A; podés avanzar con un servidor mock tipado por OpenAPI, pero antes de H6 se prueba contra el backend real. No crear rutas B con la misma responsabilidad para “ir adelantando”.

## 12. Estructura de implementación B

```text
backend-next/
  lib/auth/{sessionService,permissions,passwordService,csrf}.ts
  lib/db/{transaction,migrations}.ts
  lib/events/{eventService,eventIngestor,correlationService,sseService}.ts
  lib/jobs/{outboxService,jobScheduler,jobHandlers}.ts
  lib/notifications/{notificationService,preferencesService,expoProvider}.ts
  lib/emergencies/{policyService,incidentService,simulatedCallService,voiceService}.ts
  lib/audit/auditService.ts
  lib/actuators/{commandService,simulatedAdapter}.ts
  workers/{eventProcessor,notificationWorker}.ts
  scripts/{migrate,seed-demo,doctor,smoke-demo}.ts
  migrations/{001_identity,002_event_core,020_delivery_emergency,021_cross_constraints,022_legacy_adapters}.sql
frontend-react/src/
  app/{AppShell,AppRouter,SessionProvider}.tsx
  shared/{api,permissions,config}.ts
  shared/ui/                     componentes comunes accesibles
  features/events/               filtros, historial, detalle y evidencia
  features/security/             modos, políticas y comandos
  features/emergencies/          perfil, incidente y central simulada
  features/settings/             miembros, preferencias y salud
mobile-app/
  app/                           navegación y rutas
  src/api/                       cliente HTTP y tipos compartidos
  src/auth/                      sesión y SecureStore
  src/features/{home,cameras,events,movements,people,emergencies,settings}/
  src/notifications/             registro, recepción y deep links
  app.config.ts
scripts/{start-local,stop-local,doctor-local}.ps1
contracts/{openapi.yaml,schemas,fixtures}/
tests/integration/               escenarios entre procesos
```

`frontend-react/src/App.tsx` se transforma gradualmente en entrada al shell. Migrar el monitoreo, plano, energía y actuadores actuales a componentes sin borrar sus datos. No reescribir todo el frontend antes del primer flujo integrado: primero extraer cliente HTTP/sesión y montar las páginas A en rutas claras.

## 13. Plan de tareas B — 60 puntos relativos

Los comandos de prueba nuevos son objetivos que se crearán con la tarea correspondiente. Ejecutar desde el subproyecto indicado. Los tests con proveedores falsos son necesarios para fallos, pero no sustituyen el smoke test real del hito.

| ID | Tarea | Puntos | Depende de |
|---|---|---:|---|
| B01 | Contratos, migraciones y base de colaboración | 5 | Acuerdo H0 |
| B02 | Auth, permisos y aislamiento por hogar | 6 | B01 |
| B03 | Shell web y compatibilidad legacy | 5 | B02; componentes A como stubs |
| B04 | Ingesta, correlación y outbox duraderos | 7 | B01/B02, fixtures A |
| B05 | Historial, detalle y actualización en vivo | 4 | B04, API clips A |
| B06 | Notificaciones y preferencias | 6 | B04/B05 |
| B07 | Seguridad, modos y actuadores simulados | 5 | B04, señales A |
| B08 | Emergencias, perfil y máquina de estados | 6 | B04/B06 |
| B09 | Central simulada y voz local | 5 | B08 |
| B10 | Aplicación Android e integración móvil | 5 | B02/B05/B06, APIs A |
| B11 | Supervisor, diagnóstico y recuperación | 3 | Interfaces start/health A |
| B12 | Aceptación, regresión e integración final | 3 | B01-B11, A01-A12 |

### B01. Contratos, migraciones y colaboración — P0

**Archivos:** `contracts/openapi.yaml`, schemas B, fixtures canónicos, `backend-next/scripts/{migrate,seed-demo}.ts`, `lib/db/{transaction,migrations}.ts`, migraciones 001/002, tests del runner.

**Interfaces:** `withTransaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>`; `applyMigrations(db,directory):Promise<MigrationReport>`; `validateContract(name,payload):ValidationResult`.

- [ ] Tests: aplicar dos veces no cambia datos; checksum distinto de versión aplicada detiene ejecución; una migración fallida revierte sus cambios; dos runners no aplican la misma versión a la vez. `expect(secondRun.applied).toEqual([])`.
- [ ] Ejecutar `npm run test -- tests/db/migrations.test.ts` en rojo sobre una base de pruebas exclusiva, jamás la base de demo ni la del compañero.
- [ ] Implementar runner con tabla/lock/checksum del contrato, bootstrap legacy en base vacía controlada y migraciones incrementales sobre base existente. Validar con A el orden 001/002/010/011/012/020/021/022.
- [ ] Seed ficticio idempotente: dos hogares, admin/residente/invitado para tests, una cámara de replay identificada, reglas de ejemplo en borrador y datos de emergencias claramente ficticios. Contraseña generada/configurada por entorno de test; no mantener la clave de demo como valor de producción.
- [ ] Añadir `.gitignore` compartido para datos/secretos y configuración de test. Probar backup/restauración de una copia. Commit `chore(platform): establish contracts and non-destructive migrations`.

**Aceptación:** una instalación nueva y una copia de la instalación actual llegan al mismo esquema sin ejecutar los DROP del SQL original sobre datos existentes.

### B02. Sesiones, permisos y hogares — P0

**Archivos:** `lib/auth/*.ts`, `001_identity.sql`, rutas v1 auth/members, adaptación de rutas legacy mutantes, tests `auth/*`.

**Interfaces entregadas a A:** `requireSession(request):Promise<AuthContext>`; `assertPermission(ctx,permission):void`; `authorizeResource(ctx,resourceHouseholdId):void`; `createSession(user_id,household_id):Promise<SessionIssue>`.

- [ ] Tests: contraseña incorrecta rechazada, token revocado no accede, `/auth/me` refleja al usuario autenticado y no siempre id=1, invitado no manda comandos, recurso de hogar ajeno devuelve 404. Un body con `usuario_id=1` no cambia identidad.
- [ ] Ejecutar `npm run test -- tests/auth/sessionService.test.ts tests/auth/permissions.test.ts` en rojo.
- [ ] Usar hash robusto mediante biblioteca mantenida, verificar parámetros en el runtime fijado y migrar la contraseña legacy al nuevo formato en un proceso explícito. Nunca comparar el texto del campo `password_hash` como contraseña normal después de migrar. Revocar sesiones al cambiar contraseña o desactivar usuario.
- [ ] Implementar token opaco, hash en DB, expiración, cookie HttpOnly, CSRF para web, bearer para Android y CORS con lista de orígenes permitidos. Compartir los servicios con A; no repetir verificaciones distintas por módulo.
- [ ] Proteger las rutas legacy mientras existan. Reemplazar registro público con altas administrativas; `rol_id` no permite autoconceder administrador. Rate limit inicial login: 5 fallos por usuario/IP en 15 min, mensaje sin revelar existencia de cuenta y desbloqueo controlado para demo.
- [ ] Pruebas integración de API + medio temporal A + SSE + clip; commit `feat(auth): enforce scoped server sessions and roles`.

**Ejemplo:** un invitado modifica `localStorage` para decir ADMINISTRADOR. Puede cambiar su representación local, pero el servidor mantiene su rol real y rechaza el comando. Quitar un miembro revoca sus sesiones y tokens push asociados a ese hogar.

### B03. Shell web y continuidad de funciones actuales — P0

**Archivos:** `AppShell.tsx`, `AppRouter.tsx`, `SessionProvider.tsx`, cliente API, configuración Vite, extracción de vistas legacy, estilos/componentes comunes.

**Interfaces:** `api.request<T>({method,path,body,signal}):Promise<T>` con cookies web y errores uniformes; rutas `/cameras`, `/people`, `/movements`, `/events`, `/security`, `/emergencies`, `/settings`, y `/operator` para central de demo.

- [ ] Tests: sesión vencida limpia estado sensible y vuelve a login; error 503 muestra reintento; menú respeta permisos pero el test no lo confunde con autorización; navegación atrás conserva filtros no sensibles.
- [ ] Ejecutar `npm run test -- src/app/SessionProvider.test.tsx` y Playwright `navigation.spec.ts` en rojo.
- [ ] Extraer URLs hardcodeadas a `VITE_API_BASE_URL`, loader de sesión desde servidor y cliente común. No usar `homeguard_user` como prueba de autenticación. Conservar vistas IoT, plano, energía, umbrales y actuadores como componentes.
- [ ] Montar exports A; preparar placeholders solo en rama de desarrollo, nunca en entrega final. Diseño adaptable para portátil y móvil web, teclado, foco visible, estados de carga/vacío/error y texto que no dependa únicamente del color.
- [ ] Build frontend, prueba manual de navegación y comparación de `/api/status` legacy antes/después. Commit `refactor(web): introduce authenticated modular HomeGuard shell`.

### B04. Ingesta, correlación y outbox — P0

**Archivos:** `eventIngestor.ts`, `eventService.ts`, `correlationService.ts`, `outboxService.ts`, `jobScheduler.ts`, `workers/eventProcessor.ts`, migración 002 y tablas de correlación, contratos eventos/jobs.

**Interfaces:** `ingestDetection(message:DetectionProposed):Promise<IngestResult>`; `recordEvent(tx,event,decisionSnapshot):Promise<EventView>`; `enqueueJob(tx,input:JobInput):Promise<JobView>`; `claimJobs(workerId,now,limit):Promise<JobView[]>`; `applyJobResult(result):Promise<void>`.

- [ ] Tests: 100 entregas del mismo `event_id` producen un evento; duplicados concurrentes no crean múltiples jobs; rollback de creación de evento también revierte outbox; mensaje de otro hogar/tópico no acciona; source REPLAY solo genera acciones simuladas.
- [ ] Ejecutar `npm run test -- tests/events/ingestion.test.ts tests/jobs/outbox.test.ts` en rojo con PostgreSQL de test y broker aislado.
- [ ] Extraer suscripción MQTT del import de `status/route.ts`. Mantener un consumidor identificado y proteger despliegue accidental de dos schedulers con leases. Persistir evento, decisiones, auditoría y trabajos en una transacción; los efectos salen después del commit.
- [ ] Validar hogar, regla/versión, intervalos de vigencia, cooldown, retraso y estado de modo. La confianza del modelo es evidencia, no autorización. El texto del evento no puede decidir por sí solo `call=true`.
- [ ] Correlación: si llega primero un candidato visual de SENSOR_CORRELATION, guardarlo en `hg_pending_correlations` con expiry y sin efectos; buscar señal legacy del mismo hogar/device en la ventana. Si llega primero el sensor, consultar historia reciente. Al completar ambas mitades, crear un único evento usando el ID del candidato y consumir la correlación con lock. Expirada, queda registro descartado; no inventar la señal faltante.
- [ ] Enrutar `encounter.observed.v1` al servicio A de encuentros y resultados de clip a `recordClipResult` de A. La lógica de escritura del clip vive en ese módulo, no se duplica dentro del consumidor B.
- [ ] Implementar jobs/ACK/leases/reintentos del contrato, fallos terminales e idempotencia. La red MQTT entrega al menos una vez: no prometer exactly-once global. Jobs desconocidos, respuestas cruzadas o artifact_ref inválidos se rechazan/auditan.
- [ ] Ejecutar kill/restart del procesador en puntos antes/después del commit y publicar duplicados. Verificar estado consistente, luego commit `feat(events): persist scoped events and durable side effects`.

**Ejemplo:** caída propuesta dos veces por QoS 1: un incidente. Si se desconecta el broker después del commit, la outbox conserva el trabajo hasta reconexión y el estado visible dice pendiente.

### B05. Historial, detalle y SSE — P0

**Archivos:** endpoints `/events`, servicios y log SSE, `EventsPage`, `EventDetail`, filtros/estados, adaptador del dashboard legacy.

**Interfaces:** `listEvents(ctx,filter,cursor,limit):Promise<Page<EventView>>`; `transitionEvent(ctx,id,status,expected_revision):Promise<EventView>`; `subscribeEvents(ctx,lastSequence):AsyncIterable<SseMessage>`.

- [ ] Tests: paginación estable con fechas iguales; filtros no mezclan hogares; cambio a FALSE_POSITIVE conserva evidencia/auditoría; Last-Event-ID no pierde actualizaciones o pide sync cuando expira.
- [ ] Ejecutar suites `events/listing.test.ts`, `events/transitions.test.ts`, `events/sse.test.ts` en rojo.
- [ ] Historial con fecha, categoría, severidad, cámara, origen y estado; detalle con explicación observacional, versión y decisiones, clip y errores de entrega. Mostrar “clip preparando/expirado/parcial” sin reproductor falso.
- [ ] Acciones humanas idempotentes: reconocer, resolver, falso positivo. Resolver alerta no significa que una alarma física esté apagada; apagarla es otro comando autorizado. Retirar el comportamiento legacy de resolver todas por body vacío; si se conserva una acción masiva, requiere lista explícita, permiso y confirmación clara del alcance.
- [ ] Integrar SSE con reconsulta tras desconexión y mantener un fallback de polling espaciado cuando falle. Tests/build; commit `feat(events): review incident history and evidence status`.

### B06. Notificaciones y preferencias — P0/P1

**Archivos:** `notificationService.ts`, `preferencesService.ts`, `expoProvider.ts`, `notificationWorker.ts`, endpoints push/preferencias y tabla de dispositivos/notificaciones.

**Interfaces:** `registerPushDevice(ctx,{installation_id,token,platform}):Promise<DeviceView>`; `planNotifications(event,snapshot,prefs):NotificationPlan[]`; `sendNotification(job):Promise<DeliveryResult>`.

- [ ] Tests de matriz notify/clip, usuario sin permiso de cámara, dispositivo dado de baja, token inválido, horario silencioso y event repetido. `notify=false` debe crear cero jobs de push, aunque `save_clip=true`.
- [ ] Ejecutar `npm run test -- tests/notifications/notificationService.test.ts` en rojo.
- [ ] Configurar proyecto FCM/Expo para Android y guardar credenciales solo en servidor. Registrar instalación por usuario/hogar; desactivar token cuando el proveedor lo declare inválido y cuando se quite el permiso de ese hogar. No enviar nombres, direcciones, fotos ni clips en el payload push: título genérico e ID del evento.
- [ ] Payload con deep link interno y `event_id`; al abrir, la app vuelve a autenticar y consultar. No confiar en contenido del push para ejecutar acciones. Crear ticket/receipt y distinguir enviado, fallido y resultado desconocido. Timeout después de posible aceptación no permite repetir ciegamente un aviso; usar estado UNKNOWN y conciliación.
- [ ] Preferencias por usuario y categoría, quiet hours y permiso del SO. Un “crítico” no sobrepasa automáticamente preferencias o modo silencio del teléfono. El override crítico de demo es opt-in, visible y no promete sonar siempre.
- [ ] Probar en teléfono físico con app en primer plano, segundo plano y cerrada, anotando condiciones. Sin Internet: evento local y entrega pendiente con caducidad inicial 5 min; pasado ese plazo marcar SKIPPED para no mandar una ráfaga antigua. Commit `feat(notifications): deliver scoped configurable Android alerts`.

**Ejemplo:** el dueño quiere clip sin aviso de heladera. El historial guarda el evento; no se envía notificación aunque el clip termine después. Para intrusión con clip, el push abre el evento y muestra preparación si el video aún no está listo.

### B07. Seguridad, modos y actuadores — P0/P1

**Archivos:** `commandService.ts`, `simulatedAdapter.ts`, refactor de `mqttWorker.ts`, rutas v1 modo/actuadores, páginas Security, tests de IoT y correlación.

**Interfaces:** `setMode(ctx,mode,expected_revision):Promise<ModeView>`; `requestActuatorCommand(ctx,{code,state,event_id?,idempotency_key}):Promise<CommandView>`; `receiveActuatorAck(ack):Promise<CommandView>`.

- [ ] Tests: AWAY+cruce+puerta dentro 15 s produce una alarma simulada; sin puerta no; DISARMED suprime intrusión; invitado 403; ACK repetido no duplica acción; timeout no muestra confirmado ON.
- [ ] Ejecutar `npm run test -- tests/security/mode.test.ts tests/actuators/commandService.test.ts tests/events/correlation.test.ts` en rojo.
- [ ] Hacer cambio de modo transaccional con fuente de verdad en DB y auditoría, evitando el estado de módulo que cambia antes de que falle SQL. No mantener dos procesos con `modoActual` divergente.
- [ ] Adaptar telemetría/energía/umbrales existentes a eventos nuevos sin duplicar alertas en motor viejo y nuevo. Si se escribe también `AlertaCorrelacionada` por compatibilidad, guardar mapeo único entre evento nuevo y legacy.
- [ ] Simulador de actuador responde ACK `confirmation_source=SIMULATOR`, visible en pantalla. Enviar comando OFF manual al resolver incidente solo cuando la política lo indique; nunca inferir que resolver historial debe accionar hardware.
- [ ] Regresión de incendio/fuga/energía de demostración y comandos repetidos. Commit `feat(security): orchestrate audited simulated alarm commands`.

### B08. Perfil y máquina de emergencias — P1

**Archivos:** `policyService.ts`, `incidentService.ts`, migración 020, endpoints perfil/política/incidentes, componentes de respuesta web, tests con reloj falso.

**Interfaces:** `openIncident(event,policy,profile):Promise<IncidentView>`; `respondIncident(ctx,id,{response,expected_revision},idempotency_key):Promise<IncidentView>`; `advanceDueIncidents(now):Promise<AdvanceReport>`.

- [ ] Tests: observaciones sin visibilidad no cumplen inmovilidad; I_AM_OK cancela; REQUEST_HELP escala; cancelación y deadline concurrentes generan una sola transición coherente; reinicio no pierde deadline; replay va solo a central simulada.
- [ ] Ejecutar `npm run test -- tests/emergencies/incidentService.test.ts` en rojo usando reloj inyectado, sin sleeps de 30 s por test.
- [ ] Validar perfil ficticio y política; sin datos mínimos o consentimiento de demo no habilitar escalamiento. La política snapshot queda en el incidente para explicar las decisiones. Modo emergencia no depende de que el teléfono tenga abierta la app.
- [ ] Usar estados del contrato con transacciones/revisión y restricción UNIQUE(event_id). El scheduler persistente avanza deadlines aunque la web no esté abierta. Una respuesta I_AM_OK tardía antes de aceptación del operador puede cancelar la llamada pendiente; si ya está CONNECTED_SIMULATED, informa al operador y registra cancelación solicitada, sin ocultar la llamada anterior.
- [ ] Diferenciar aviso de evento y desafío de emergencia. Si notify está apagado, el desafío local sigue disponible; push de emergencia solo con preferencia explícita de override. La configuración advierte ese comportamiento y permite no habilitar escalamiento sin canal de respuesta probado.
- [ ] Si se reinicia tras haber vencido un plazo, marcar incidente `NEEDS_REVIEW` operacional y ofrecer recuperación manual; no originar automáticamente una llamada por un evento de hace horas. El estado NEEDS_REVIEW forma parte del contrato común y del CHECK de la tabla; reanudar desde él exige acción administrativa explícita.
- [ ] Probar doble click, dos teléfonos, usuario sin permiso y respuesta después de cierre. Commit `feat(emergencies): persist cancellable simulated escalation`.

**Ejemplo:** una persona se agacha para recoger algo: A no confirma la secuencia y no se abre emergencia. Si A entrega caída posible con la ventana de inmovilidad ya observada, B verifica esa evidencia y solicita respuesta y solo luego abre la llamada simulada conforme a la política.

### B09. Central simulada y voz — P1

**Archivos:** `simulatedCallService.ts`, `voiceService.ts`, rutas de operador, `OperatorConsole`, `CallDetail`, adaptador Piper, fixtures de audio sintético y tests.

**Interfaces:** `createSimulatedCall(incident):Promise<SimulatedCallView>`; `acceptSimulatedCall(operatorCtx,call_id,expected_revision):Promise<CallView>`; `renderIncidentSpeech(snapshot):Promise<ArtifactRef>`.

- [ ] Tests: ninguna ruta SIMULATED llama un cliente PSTN/SIP externo; un solo operador acepta; caída sin diagnóstico produce texto “posible caída”; error Piper permite texto y no bloquea cierre; ningún dato proviene de un prompt libre sin validar.
- [ ] Ejecutar `npm run test -- tests/emergencies/simulatedCallService.test.ts tests/emergencies/voiceService.test.ts` en rojo.
- [ ] Implementar consola de operador en la web con una sesión de administrador de demo y permiso específico `demo.operator`; no crear una ruta pública “por ser simulada”. Estado espera/sonando/aceptada/cerrada/fallida y historial de acciones.
- [ ] Seleccionar voz española Piper con licencia apta, fijar modelo/hash y ejecutar mediante args seguros. Plantilla: “Este es un aviso automatizado de HomeGuard en modo demostración. Se observó una posible caída en [zona], a las [hora]. Dirección de prueba: [dato ficticio]. Estado de respuesta: [dato observado].” No afirmar “ambulancia enviada”.
- [ ] La primera versión reproduce el mensaje al aceptar y permite acuse estructurado. Audio bidireccional WebRTC y Whisper son P2; no llamar “conversación” a una reproducción unidireccional. La consola puede funcionar en el mismo equipo o por LAN autorizada.
- [ ] Probar browser autoplay: botón Aceptar constituye interacción para reproducir audio; si hay bloqueo, mostrar Reproducir y transcripción. Commit `feat(emergencies): demonstrate operator calls with local speech`.

### B10. Aplicación Android — P0/P1

**Archivos:** `mobile-app`, módulos por función, cliente API, SecureStore, registro push y deep links; tipos derivados del contrato, configuración pública por entorno.

**Interfaces:** mismas APIs v1; `registerInstallation()`, `onNotificationOpened(event_id)`, `respondToIncident(incident_id,response)`. Ni DB ni broker ni Codex se exponen al móvil.

- [ ] Tests: origen de servidor inválido informa configuración; token en SecureStore y nunca logs; push abre evento correcto después de login; clip de otro hogar rechazado; botón I_AM_OK envía respuesta idempotente y muestra confirmación de servidor.
- [ ] Ejecutar suite móvil de dominio/navegación en rojo; preparar development build para teléfono físico, no asumir soporte completo en Expo Go.
- [ ] Pantallas P0: login, inicio/resumen, cámaras y detalle, historial/detalle/clip, ajustes de servidor y permisos push. P1: Personas manuales, reglas y controles independientes, borrador asistido, estado de emergencia y respuesta. Para geometría compleja, el móvil puede consultar y abrir editor web autenticado; no declarar edición completa nativa si aún no existe.
- [ ] Reproducción móvil: probar HLS desde MediaMTX con reproductor compatible para vista remota local; WebRTC puede añadirse con development build si se requiere menor demora. Elegir el componente tras smoke test de codecs en Android real y no cargar diez reproductores full HD a la vez. Mosaico con thumbnails y stream completo al abrir detalle.
- [ ] Configurar `EXPO_PUBLIC_API_BASE_URL` con IP/nombre del servidor de la LAN; teléfono y PC comparten red sin aislamiento de clientes. HTTP solo como excepción documentada de development build en LAN de pruebas con datos ficticios; para entrega fuera de demo usar HTTPS confiable. No desactivar validación TLS ni poner secretos en variables EXPO_PUBLIC.
- [ ] Verificar segundo plano, permiso denegado, rotación, pérdida de WiFi y logout. La app no realiza vigilancia continua en segundo plano: eso ocurre en el servidor. Build Android y commit `feat(mobile): connect Android clients to HomeGuard workflows`.

### B11. Supervisor y diagnóstico — P0

**Archivos:** ampliar `Iniciar.ps1`, `Detener.ps1`, lanzadores CMD y `scripts/*local.ps1`, `backend-next/scripts/doctor.ts`, health de servicios y manifest de PIDs.

**Interfaces:** `start-local -Mode Demo`, `stop-local`, `doctor-local`; salud sana en `/api/v1/health` sin credenciales/paths sensibles. Reportar por separado DB, broker, medios, visión, IA, push y voz.

- [ ] Tests de scripts o harness: start dos veces no duplica procesos; puerto ocupado por tercero produce error; stop solo termina procesos cuyo ejecutable/cmdline/workspace coinciden; proceso IA caído no termina detección.
- [ ] Ejecutar pruebas en carpeta de test y registrar rojo antes de adaptar el supervisor.
- [ ] Incorporar comandos A con rutas absolutas seguras, procesos ocultos para servicios, logs rotados y cleanup ordenado. No escribir secretos en argumentos visibles o consola. Migraciones y seed son pasos explícitos, no reset automático de DB cada arranque.
- [ ] Diagnóstico guiado: cámara ocupada, IP equivocada, firewall, WiFi aislado, falta de CUDA, Codex sin login, credenciales FCM ausentes, disco bajo. No convertir todo en “error interno”.
- [ ] Ejecutar detener/iniciar/reiniciar con dos cámaras y datos existentes. Commit `chore(runtime): supervise reproducible local demo services`.

### B12. Aceptación y entrega B — P0/P1

**Archivos:** tests de integración, regresión legacy, scripts smoke-demo, reporte medido y guía de presentación.

- [ ] Mapear cada endpoint B a prueba de permiso y de hogar ajeno; cada estado terminal tiene evidencia de un caso real o de fixture claramente marcado.
- [ ] Ejecutar builds frontend/backend, suites TS de módulos nuevos, pruebas móvil y Playwright de auth/eventos/emergencias. No usar el antiguo script `next lint` sin revisar compatibilidad con la versión de Next; definir un lint reproducible durante B01/B03.
- [ ] Integrar pytest A y validación común de contratos en un comando CI, con base/broker de pruebas separados. Los tests destructivos apuntan solo a recursos cuyo nombre termina `_test` y verifican esa condición antes de limpiar.
- [ ] Repetir H1-H6 con webcam real y Android físico; comprobar persistencia después de reinicio y migración sobre copia legacy. Completar las dos variantes notify/clip y la cancelación de emergencia.
- [ ] Ambos firman la lista de cierre y preparan evidencia de la demo sin secretos ni datos personales reales. Commit `test(platform): verify complete academic HomeGuard demo`.

## 14. Escenarios de aceptación específicos de B

| ID | Preparación y acción | Resultado esperado |
|---|---|---|
| B-S01 | Login admin y residente en navegadores separados | Cada `/me` devuelve el sujeto real; sesiones distintas |
| B-S02 | Invitado intenta activar sirena por HTTP manual | 403 y auditoría saneada; no mensaje MQTT |
| B-S03 | Evento llega 100 veces por MQTT | Un evento, un clip/job y un incidente como máximo |
| B-S04 | Evento activo con notify=false, clip=true | Historial y clip, cero push |
| B-S05 | Evento notify=true, clip=false | Push abre detalle sin video, no MP4 de evidencia |
| B-S06 | Regla se desactiva antes de enviar alarma | Se cancela job crítico no iniciado y se conserva historia |
| B-S07 | Sirena no responde al comando | UI pendiente/fallida, nunca ON confirmado |
| B-S08 | App cerrada recibe push y usuario abre | Login si hace falta, luego evento propio con datos frescos |
| B-S09 | Token push inválido | Se desactiva ese token; los demás dispositivos siguen |
| B-S10 | Posible caída, usuario pulsa Estoy bien | Incidente CANCELLED y ninguna llamada nueva |
| B-S11 | Posible caída sin respuesta, demo habilitada | Central recibe llamada simulada y audio observacional |
| B-S12 | Cancelación y deadline coinciden | Una transición válida y rastro de la otra solicitud |
| B-S13 | Reinicio tras horas con deadline vencido | NEEDS_REVIEW, no llamada automática tardía |
| B-S14 | Sin Internet durante demostración | Historial/clip local funcionan, push/IA muestran estado real |
| B-S15 | Volver a conectar tras muchos eventos viejos | No ráfaga de avisos caducados ni llamadas históricas |
| B-S16 | Clip está listo pero usuario perdió permiso | No se reproduce ni se entrega URL válida |
| B-S17 | Reproducir video de prueba de intrusión | Marca REPLAY en web, móvil y central; efectos simulados |
| B-S18 | Sensores legacy normales/energía/fuga | Datos y alertas previas siguen visibles con permisos y sin duplicados |

## 15. Guion completo de presentación universitaria

### 15.1 Preparación

Usar una red privada conocida; comprobar que el teléfono pueda alcanzar la PC. Iniciar supervisor y doctor. Cargar hogar de demo y sesiones admin/residente/operador. Confirmar cámara LIVE, modelo real, política de emergencia SIMULATED y cupo/asistente si se va a demostrar. Explicar que la central es de práctica y que los datos de domicilio son ficticios.

Preparar una escena de reserva grabada y marcada REPLAY por si el dispositivo falla, sin presentarla como cámara en vivo. No improvisar caídas por escaleras: usar una secuencia grabada segura o movimiento controlado sobre superficie adecuada, con persona informada.

### 15.2 Secuencia sugerida

1. Mostrar módulos originales de HomeGuard y continuidad del repositorio.
2. Abrir Cámaras, registrar/probar webcam y marcar una zona con A.
3. Entrar a la zona: evento LIVE aparece en historial y llega al Android.
4. Abrir detalle desde el push; observar clip PENDING y luego READY con contexto anterior/posterior.
5. Desactivar notificaciones de esa regla, mantener clip, repetir y demostrar que no llega push.
6. Activar aviso y desactivar clip, repetir y mostrar evento sin archivo de evidencia.
7. Abrir Personas, asociar manualmente encuentro a una etiqueta y aclarar que no es identificación biométrica automática.
8. Crear borrador por instrucción con Codex si el spike real pasó; pedir aclaraciones, ensayar, revisar limitaciones y activar una versión compatible. Si IA no está disponible, mostrar el estado y editor manual, sin fingir respuesta en vivo.
9. Probar modo AWAY y correlación visual+sensor simulado para alarma con ACK de simulador.
10. Mostrar caída posible de prueba, responder Estoy bien y comprobar cancelación.
11. Repetir sin respuesta y aceptar en la central simulada; reproducir la voz y cerrar con acuse.
12. Desconectar webcam: mostrar OFFLINE y ausencia de falsa emergencia por pérdida de video.
13. Finalizar mostrando pruebas y métricas, incluyendo límites de las escenas y de cámaras simultáneas.

### 15.3 Evidencias de evaluación

Entregar commit/versión, diagrama de procesos, contratos, inventario de herramientas/licencias, resultados de escenarios, métricas por número de fuentes y problemas conocidos. Un video preparado es evidencia de una ejecución, no prueba de precisión general. La nota técnica distingue funciones completas, experimentales, simuladas y fuera de alcance.

## 16. Lista de cierre B y coordinación con A

- [ ] Auth real, sesiones revocables y permisos en API/medios/SSE/clip.
- [ ] Migraciones reproducibles sin pérdida de la base instalada.
- [ ] Orquestador persistente independiente de rutas Next.js.
- [ ] Eventos, jobs y llamadas resistentes a duplicados y reinicios.
- [ ] Historial útil incluso cuando clip/push/IA fallan.
- [ ] Dos controles notify/clip verdaderamente independientes.
- [ ] Alarma diferencia solicitud de confirmación del simulador.
- [ ] Android físico recibe aviso y abre el evento autorizado.
- [ ] Emergencia puede cancelarse y solo usa central simulada.
- [ ] Voz tiene licencia registrada y texto sin diagnósticos inventados.
- [ ] Funciones legacy siguen disponibles con permisos.
- [ ] Supervisor no interfiere con otros procesos del equipo.
- [ ] Scenarios B-S01 a B-S18 y H1-H6 completados con A.

El documento A contiene el detalle de captura/modelos, zonas, reglas, Personas, Codex y clips. Antes de cambiar cualquiera de esos contratos, revisar el impacto en ambas mitades. El compañero debe poder ejecutar tu lado con fixtures mientras vos consumís sus endpoints; la entrega final obliga a reemplazar esos mocks por la integración real.

No quedan implícitas las ampliaciones: identificación automática por rostro no forma parte de estos planes; llamadas reales, vigilancia comercial alojada, acceso fuera de LAN y conversación telefónica bidireccional son temas separados del prototipo descrito. Dejar sus botones ocultos o claramente no disponibles, no conectarlos a una simulación que el usuario pueda confundir con un servicio real.
