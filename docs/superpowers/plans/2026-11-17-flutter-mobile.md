# App móvil Flutter — diseño y plan

Solicitud: crear ya la aplicación Flutter con las funciones existentes del sistema, excluyendo agregar cámaras o sensores. Se aplica directamente la plataforma y alcance indicados, sin otra fase de aprobación.

## Alcance y decisiones

Nueva aplicación nativa en `mobile-flutter`, conservando `mobile-app` (Expo) como referencia histórica. Android es el objetivo instalable desde esta PC Windows; se genera también el proyecto iOS, cuya firma/compilación requiere macOS. Flutter web se usa como vista de desarrollo y verificación, no como sustituto de la app nativa.

Se reutilizan sesiones, hogares, permisos y datos reales del backend Next/PostgreSQL. Autenticación móvil con bearer en almacenamiento seguro y vinculado al servidor; contraseña nunca persistida. Configuración de dirección del servidor para Wi-Fi/emulador, manejo explícito de desconexión/revocación y limpieza de recursos al salir.

Pantallas: acceso; resumen y eventos de prueba identificados; cámaras registradas con visualización WebRTC, análisis y perfiles faciales disponibles; eventos con filtros/paginación/revisión/clip; seguridad y modos; conexiones existentes con lecturas/estado y controles, configuración y eliminación autorizadas; emergencias, respuestas, perfil y política; central simulada y audio; ajustes, preferencias, miembros y servicios. No habrá formularios ni peticiones para dar de alta cámaras/sensores/actuadores. Personas/Movimientos conservan el estado pendiente de sus módulos completos, como la web actual; los perfiles faciales existentes se gestionan desde la integración de cámaras. No se finge que esas APIs aún ausentes funcionan.

Notificaciones: actualización mientras se usa la app mediante eventos del backend; avisos locales con permiso; push FCM Android opcional integrado al backend junto a Expo. Firebase requiere configuración real propia y conectividad con el backend para abrir contenido. Sin configuración, indicar el estado pendiente; no afirmar entrega en segundo plano. Llamadas de emergencia conservan el transporte SIMULATED existente; no se incorpora telefonía real.

Diseño Material 3, español, colores verde y superficies claras del sistema, navegación principal de cinco destinos y menú Más, objetivos táctiles amplios, estados de carga/error/vacío, fechas Bolivia y confirmaciones explícitas de acciones.

## División de trabajo y archivos

La skill dispatching-parallel-agents se aplica a dos tareas independientes: preparación aislada de SDK/JDK en `.local` y adaptación backend FCM. El agente principal implementa Flutter. No se comparten archivos de implementación entre tareas. El backend de pruebas queda asignado exclusivamente al trabajo FCM hasta su entrega.

`lib/core`: API, sesión/almacenamiento, datos/validación, eventos y notificaciones. `lib/ui`: tema, widgets y navegación. `lib/features`: acceso/resumen, eventos, cámaras/video, conexiones/seguridad, emergencias y ajustes. Pruebas Dart/widgets con HTTP simulado y pruebas de integración contra el backend local sin inventar hardware. `README.md` y scripts PowerShell reproducibles para ejecutar/compilar.

## Secuencia

1. Inventariar rutas y permisos, comprobar SDK. Crear proyecto y dependencias compatibles con Flutter instalado.
2. Pruebas RED→GREEN de autenticación, vinculación a servidor, autorización, rutas/deep links y DTO de comandos; implementar núcleo.
3. Implementar todas las pantallas sobre endpoints actuales, sin altas de hardware. Video utiliza concesiones y WHEP existentes; no pide permiso de captura al teléfono para mirar cámaras.
4. Integrar notificaciones FCM/configuración opcional y avisos locales; proteger tokens, cuentas y navegación.
5. Pruebas, analyze, builds web/APK; verificar visualmente teléfonos pequeños y navegación real. Backup antes de migración nueva del backend.
6. Revisión final independiente, correcciones verificadas, documentación y artefacto APK local. No publicar en tiendas, subir cambios ni firmar distribución comercial sin instrucción adicional.

## Límites de validación

No hay hardware doméstico ni teléfono conectado confirmado. La captura y ejecución física no se pueden certificar por pruebas de software. Firebase no tiene credenciales aportadas y su entrega real requiere configuración; la integración y estados se prueban con transporte simulado, claramente separado de datos del hogar.

## Ejecución y cierre — 18 de noviembre de 2026

Implementadas las pantallas, permisos y operaciones del alcance anterior en Flutter nativo. Se conserva Expo y se reutiliza el backend existente. Agregada migración 050 para separar proveedores EXPO/FCM; aplicada a la base local después de una copia de seguridad. Las cuentas de servicio, tokens, herramientas y APK quedan fuera de Git.

La revisión independiente produjo una sola ronda de correcciones, cubierta por pruebas: conservar el reproductor durante una actualización del mismo recurso; respetar decisiones, horarios y excepción explícita de emergencia en avisos; no invalidar tokens nuevos ante respuestas antiguas; serializar almacenamiento de sesión y registro/limpieza de notificaciones; impedir que un permiso tardío se aplique a otra cuenta; distinguir el diálogo de permiso Android del paso al fondo; cerrar recursos de negociación de video que terminan tarde; crear el canal Android y restaurar la apertura desde una notificación local; limitar HTTP a orígenes locales; conservar el cursor SSE e iniciar desde el final para instalaciones nuevas.

La navegación integrada encontró además preflight sin resolver en las rutas heredadas de cámaras. Se reprodujo el 401, se agregó OPTIONS con validación de origen y se verificó la respuesta 204 mediante prueba de regresión y navegación real. Tras reanudar la sesión de trabajo, los servicios de desarrollo estaban detenidos; se reiniciaron con los scripts existentes, sin cambios adicionales de producto.

Verificación final:

- `flutter analyze`: sin incidencias.
- `flutter test`: 25 pruebas aprobadas.
- Backend `npm test -- --maxWorkers=2`: 105 pruebas aprobadas en 17 archivos. Compilación Next completada antes de esta comprobación final, sin cambios posteriores de backend.
- `flutter build web --release --no-web-resources-cdn --dart-define=HOMEGUARD_SERVER=http://127.0.0.1:3000`: compilado. Playwright en 390×844 contra el servidor local: acceso y ocho módulos, sin errores de consola ni botones de alta de equipos; capturas revisadas en `.local/verification`.
- Android: APK debug dividido por ABI, ARM64 exclusivo, versión 1.0.0/código 2001, Android 7/API24 mínimo y target36. Firma v2 verificada con apksigner y manifiesto verificado con aapt2. Compilación definitiva de 92,9 segundos.
- Artefacto `.local/artifacts/HomeGuard-android-arm64-debug.apk`: 101.382.161 bytes; SHA256 `cc39e67ef66669208fb750d009b73760bb301e2e44a9ba2ecd3463c32c306279`. Metadatos, firma y manifiesto disponibles junto al archivo.

Entrega de demostración local. No se probaron hardware físico, captura en un teléfono, entrega FCM real, APNs ni compilación iOS. Los módulos completos de reglas/etiquetas y el adaptador de clips conservan sus pendientes de backend; las llamadas permanecen simuladas. No se publicaron tiendas ni se subió la rama.
