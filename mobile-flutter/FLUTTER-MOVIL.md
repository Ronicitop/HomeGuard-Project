# HomeGuard móvil — Flutter

Aplicación nativa Android/iOS conectada al mismo backend, usuarios y hogar del sistema web. La app activa está en `mobile-flutter`; `mobile-app` conserva la versión Expo anterior. No es una WebView.

## Instalar y conectar Android

APK de pruebas ARM64: `.local/artifacts/HomeGuard-android-arm64-debug.apk`. Requiere Android 7/API24 o superior y teléfono ARM64. Copiar el archivo al teléfono e instalarlo autorizando esa fuente si Android lo solicita. Es una compilación de demostración con firma de pruebas, sin publicación en tiendas.

1. Consultar la IP privada de la PC con `ipconfig`.
2. Desde la raíz del proyecto, detener e iniciar HomeGuard en esa interfaz:

```powershell
.\Detener.ps1
.\Iniciar.ps1 -Interfaz 192.168.1.50 -SinNavegador
```

Reemplazar la IP por una asignada realmente a la PC. Puede ser necesario permitir los puertos del sistema solo en el firewall de la red privada. No abrir puertos del router.

3. Conectar teléfono y PC a la misma Wi-Fi.
4. En la app → Conexión con mi hogar → Dirección del servidor: `http://IP_PC:3000`.
5. Iniciar sesión con la misma cuenta del sistema web.

El valor inicial `http://10.0.2.2:3000` sirve para el emulador Android estándar; en teléfono físico se cambia por la IP de la PC. No incluir `/api`, rutas, parámetros ni credenciales en la dirección. HTTP solo se permite en red privada/localhost; servidores públicos requieren HTTPS. La contraseña nunca se guarda y la sesión se almacena de forma segura, vinculada al servidor.

## Funciones actuales

| Sección | Qué incluye |
|---|---|
| Cuenta | Acceso, restauración segura, revocación, salida, servidor configurable, permisos de administrador/residente/invitado. |
| Resumen | Modo, contadores, eventos recientes, incidentes pendientes y evento de prueba identificado como simulado. |
| Cámaras | Cámaras existentes, vista WebRTC/WHEP, análisis del servidor y cierre/renovación de concesiones. WHIP desde la cámara del teléfono hacia un registro ya existente, solo al pulsar explícitamente Transmitir desde este teléfono. |
| Personas | Perfiles faciales y encuentros existentes; administrador puede iniciar/cancelar registro facial consentido y eliminar perfiles desde la integración de cámaras. |
| Movimientos | Muestra el servicio completo de reglas como pendiente, igual que la web actual. Los eventos de movimiento existentes se consultan en Eventos. No inventa catálogo/acciones GPT ni APIs faltantes. |
| Eventos | Categoría/estado/origen, búsqueda, paginación, detalle, revisión/resolución/falsa alarma, entregas y evidencia cuando el servicio de clips esté conectado. |
| Seguridad | Modos En casa/Ausencia/Desarmado, sensores reales existentes y lecturas con fecha, órdenes físicas solicitadas/enviadas/confirmadas. Simulador en sección separada. |
| Conexiones | Consultar equipos y controlar salidas existentes. Administrador puede editar nombre/ubicación/modelo/frecuencia/habilitación, renovar clave y eliminar vínculo. Se conservan canales y transporte. |
| Emergencias | Incidentes, cuenta regresiva, Estoy bien/Solicitar ayuda simulada, perfil ficticio y cinco contactos, política y tiempos, prueba de caída. |
| Central simulada | Administrador puede aceptar/cerrar, leer transcripción y escuchar WAV autenticado. No representa un servicio público ni realiza llamadas reales. |
| Configuración | Categorías/horarios, permiso de avisos, registros push, servicios y gestión de miembros/roles. |

No hay formularios ni llamadas de alta de cámaras, sensores o actuadores. Las dos rutas de registro de hardware están bloqueadas también en el cliente móvil. Las altas y la preparación técnica de canales se hacen desde la web. Cambiar permisos se vuelve a verificar en el servidor; ocultar un botón no sustituye la autorización del backend.

El invitado solo accede al resumen y al cierre de sesión. Las etiquetas avanzadas de personas y las reglas nuevas siguen pendientes de sus APIs en el sistema web. La app conserva esos límites de manera explícita.

## Video y medios

El video requiere MediaMTX e inferencia del proyecto. Se utiliza el hostname del servidor y el puerto8889 (compilable con `HOMEGUARD_MEDIA_PORT`). Mirar cámaras no pide acceso a la cámara del teléfono. Solo transmitir a un registro existente solicita permiso de video, sin audio. Al pasar al fondo, salir de la pantalla o revocar la sesión se liberan recursos. Los diálogos de permiso Android no se tratan como cierre de la cámara.

Se mantienen los límites concurrentes del servidor anterior; si una transmisión está ocupada se muestra su error. Los endpoints de clips previstos por la web pueden seguir pendientes del adaptador de evidencia; se informa su estado sin fingir que hay un archivo. El reproductor conserva su estado en actualizaciones del mismo evento. El WAV de central se obtiene con bearer y se reproduce en memoria.

## Notificaciones

- App abierta: SSE autenticado actualiza las pantallas; los avisos locales requieren permiso y respetan la decisión de notificar, categoría y horario de Bolivia. El cursor se conserva al pausar y una instalación nueva inicia desde el final del log.
- Segundo plano/cerrada: FCM Android integrado al backend. Requiere un proyecto Firebase y configuración propia. Sin ella se informa que push está pendiente; no se afirma entrega real.
- Permisos y registros se vinculan a cuenta/hogar/servidor. Operaciones de token y limpieza se serializan para evitar que una cuenta borre el registro de otra.
- Abrir un aviso solo navega al evento/incidente después de autenticar. Nunca responde a emergencias ni realiza llamadas automáticamente.

Para Firebase registrar la app Android con ID `bo.edu.homeguard.homeguard_mobile`. Un archivo de cliente privado como `.local/firebase-mobile.json` puede contener:

```json
{
  "FIREBASE_API_KEY": "CLAVE_PUBLICA_DEL_PROYECTO",
  "FIREBASE_APP_ID": "ID_DE_APP",
  "FIREBASE_PROJECT_ID": "ID_DEL_PROYECTO",
  "FIREBASE_MESSAGING_SENDER_ID": "ID_DEL_REMITENTE"
}
```

No incluir claves privadas de cuentas de servicio en el APK. En el backend, el archivo de cuenta de servicio pertenece al proyecto Firebase y debe permitir el envío HTTPv1:

```dotenv
HG_PUSH_ENABLED=true
HG_FCM_SERVICE_ACCOUNT_FILE=../.local/firebase-service-account.json
```

Se conserva Expo además de FCM. El servidor cifra tokens, vuelve a validar preferencias/permisos y no envía direcciones personales ni evidencia en el texto push. La aceptación del proveedor no demuestra lectura del aviso. Las solicitudes críticas llevan `notification_channel=EMERGENCY_CHALLENGE` y requieren la excepción explícita de emergencia simulada; no se confunden con eventos ordinarios asociados a un incidente.

Referencias oficiales: [Flutter FCM](https://firebase.google.com/docs/cloud-messaging/flutter/get-started), [HTTPv1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [OAuth de cuenta de servicio](https://developers.google.com/identity/protocols/oauth2/service-account).

## Desarrollo y builds

Flutter3.35.7/Dart3.9.2; versiones resueltas en pubspec.lock. Firebase Messaging16/Core4 mantiene el contrato de token de registro compatible con el envío FCM HTTPv1 implementado. El SDK/JDK de esta PC se preparó en `.local/android-toolchain`, sin cambiar variables persistentes del sistema.

```powershell
cd mobile-flutter
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=HOMEGUARD_SERVER=http://IP_PC:3000
```

Desde la raíz:

```powershell
.\Compilar-AppFlutter.ps1
.\Compilar-AppFlutter.ps1 -Arquitectura android-arm -Servidor http://192.168.1.50:3000
.\Compilar-AppFlutter.ps1 -ConfiguracionFirebase .\.local\firebase-mobile.json
.\Iniciar-AppFlutter.ps1
```

La vista de navegador usa5174 y sirve para verificar las pantallas; no sustituye al APK. Los orígenes locales5174 se permiten al iniciar el backend con el script actualizado. `-Release` optimiza, pero la plantilla mantiene firma de pruebas: no equivale a una versión publicada de Play Store. Producción requiere HTTPS, firma propia y configuración de red adecuada.

El proyecto iOS está generado. Compilar/firmar iOS requiere macOS/Xcode y configurar APNs/Firebase. No se produce un IPA desde Windows.

## Verificación y límites

Las pruebas verifican API, permisos, sesión ligada al servidor, cambios de cuenta durante logout/permisos/token, almacenamiento serializado, reproducción conservada al actualizar, selección de avisos, cursor SSE, ciclo de cámara, canal Android y apertura desde notificación local. El backend prueba OAuth/FCM y revocaciones con proveedor simulado; no se enviaron mensajes reales a Google.

Se compila y verifica el manifiesto/arquitectura del APK. No hay teléfono físico conectado ni claves Firebase aportadas para certificar entrega real en segundo plano. Las pruebas tampoco certifican calibración de sensores, relés físicos o precisión del reconocimiento. La central sigue siendo simulada.

Entrega verificada el 18 de noviembre de 2026: 25 pruebas Flutter, 105 pruebas backend, análisis Dart sin incidencias, compilación web y APK Android ARM64 con firma v2. Navegación de ocho módulos contra el servidor real en pantalla de 390×844. El APK de pruebas ocupa aproximadamente 97 MiB; SHA256 `cc39e67ef66669208fb750d009b73760bb301e2e44a9ba2ecd3463c32c306279`.
