# IA en servidor y pruebas locales

El celular y la webcam publican video por WebRTC/WHIP. MediaMTX entrega una lectura RTSP/TCP privada al servicio `inference`; FFmpeg conserva únicamente el último fotograma en memoria. COCO-SSD 2.2.3 y Human 3.3.6 se ejecutan mediante TensorFlow Node 4.22.0 en CPU sobre Node.js 22. La API de resultados funciona en un proceso separado de la inferencia para responder aunque una operación facial tarde. El navegador visualiza video y resultados SSE, sin modelos ni descriptores. No se escriben fotogramas, videos ni muestras faciales a disco.

## Arranque LAN

Las variables existentes de `.env.lan`, la IP, certificados y volúmenes PostgreSQL se conservan. Añadir `INFERENCE_SECRET` aleatorio de al menos 32 caracteres; el mismo valor se comparte entre backend e inferencia. Se ha generado para este entorno local. Nunca subirlo a Git.

```powershell
docker compose --env-file .env.lan -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

Entrar en la dirección HTTPS de la PC documentada en LAN-CAMERAS.md. En Android abrir Cámaras → Transmitir, seleccionar cámara e iniciar. En PC abrir Cámaras → Panel de vigilancia y conectar. Webcam transmite y visualiza en el mismo equipo. Un publicador, un visor remoto y un procesador simultáneos. Mantener la pantalla del celular activa. Si el sistema libera Wake Lock o la pestaña deja de capturar, reactivar la pantalla.

El análisis continúa si se cierra el panel de PC. Al detener o vencer la publicación se libera el procesador; la recuperación tarda varios segundos por las concesiones y limpieza. Al cerrar sesión se revocan las sesiones de cámara de ese usuario.

## Registro facial y acceso

Administrador: desde Webcam o Panel, iniciar video, escribir nombre, aceptar consentimiento y capturar cinco muestras. La captura vence en 60 segundos y exige un solo rostro visible. Las muestras numéricas se almacenan únicamente al completar el registro. Cancelar descarta la captura pendiente. Los perfiles anteriores se validan por modelo, longitud y valores; la calibración de similitud entre entornos requiere prueba física separada del registro. Umbral inicial 0,65, sin garantía de precisión.

`GET /api/vision` devuelve metadatos de perfiles y eventos paginados. Ya no acepta perfiles ni eventos creados por el navegador. `GET /api/analysis?cameraId=...` es SSE autenticado con estado, generación, secuencia, hora, dimensiones canónicas 640×480 y cajas normalizadas. `POST /api/analysis` permite al administrador iniciar/cancelar el registro. La API interna de inferencia no publica puertos y exige secreto; los descriptores se obtienen de PostgreSQL dentro de Docker.

El video conserva proporciones mediante bandas en 640×480. El panel retira etiquetas de resultados de más de cinco segundos. Sin servidor no hay detección local. Los eventos se confirman en tres observaciones, adaptando ventana a duración efectiva; deduplicación transaccional de 30 segundos y retención diaria de 30 días. Desconocidos generan WARNING solamente en AWAY, sin tocar sirena ni reglas de sensores.

## Diagnóstico

```powershell
docker compose --env-file .env.lan -f docker-compose.yml -f docker-compose.lan.yml ps
docker compose --env-file .env.lan -f docker-compose.yml -f docker-compose.lan.yml logs --tail 80 inference backend mediamtx
docker stats --no-stream
docker compose --env-file .env.lan -f docker-compose.yml -f docker-compose.lan.yml run --rm --no-deps inference node smoke.mjs
```

No compartir `.env`, credenciales ni URLs RTSP con token. La inferencia tiene límite de dos CPU y 1800 MiB, pool PostgreSQL de tres conexiones para inferencia y una para su API y threads TensorFlow limitados. En esta laptop el servidor también consume recursos: desplegar Docker local no equivale a descargar el trabajo a otra máquina. El objetivo de menos de dos segundos queda sujeto a medición.

## Pruebas físicas pendientes

Realizar 30 minutos con Android y PC, midiendo duración del análisis mostrada, latencia percibida, CPU/RAM inicial y cada cinco minutos; probar rostro registrado con muestras distintas, desconocidos, rostro parcial, varias personas, gato/perro, orientación y cambios de cámara. Verificar interrupción Wi-Fi, cierre de panel (el análisis continúa), cierre del publicador (se detiene), reinicio de inferencia y reconexión. Registrar falsos positivos/negativos sin prometer precisión. Ninguna prueba sintética sustituye esta sesión.

## Nube

`docker-compose.prod.yml` incorpora el mismo servicio. Configurar dominio, HTTPS público, IP anunciada de medios y conectividad WebRTC (STUN/TURN si la red lo requiere) antes de publicar. PostgreSQL, RTSP y la API de inferencia permanecen privados. Dimensionar la VM con las mediciones; no se necesita GPU para arrancar. No se contrató infraestructura ni se publicó en Internet. Copias/restauración de PostgreSQL: DEPLOYMENT.md. No ejecutar `down -v`: elimina los volúmenes.

## Validación automatizada realizada

- Compilaciones de frontend y backend, imágenes Docker y carga real de COCO/BlazeFace/FaceRes con TensorFlow Node en CPU.
- Seis pruebas de clasificación, compatibilidad de perfiles, cajas y confirmación temporal.
- API: hashes, sesiones HttpOnly, cierre de sesión, roles administrador/residente/invitado, rechazo de eventos y descriptores desde navegador, metadatos sin descriptores y borrado de identidad.
- Pruebas transaccionales de deduplicación, modos HOME/DISARMED/AWAY y rechazo de procesador vencido; cambios de prueba revertidos.
- Autorización de medios, exclusividad y vencimiento de sesiones.
- 55 comprobaciones responsive con APIs simuladas, a 360/390/768/1366/1920, orientación y texto ampliado al 200 %; capturas en frontend-react/test-results.
- Recorrido real con cámara sintética de Chrome: WHIP → MediaMTX → RTSP/TCP → modelos de servidor → SSE → panel remoto. Segundo visor rechazado; análisis continúa al cerrar el visor.

Para repetir: `node --test inference/test.mjs`; `npm run test:responsive` dentro de frontend-react con `UI_URL` apuntando a Vite; `node scripts/e2e-camera.mjs` dentro de frontend-react con `TEST_ORIGIN` HTTPS. El test de video usa cámara sintética, no la webcam física. Los scripts de integración se ejecutan dentro de Docker con acceso al backend y PostgreSQL. El binario estático FFmpeg usa la IP privada resuelta por Node para evitar su fallo con resolución DNS interna.

Medición de la última prueba sintética local: 4394 ms para un análisis completo (objetos más rostro). No equivale a latencia total extremo a extremo y supera el objetivo inicial de dos segundos. La prueba física de 30 minutos y una medición en la VM de destino siguen pendientes. Tras las pruebas, el frontend compilado consumía aproximadamente 15 MiB y el servicio de inferencia en reposo aproximadamente 255 MiB; estos valores no representan picos ni garantizan estabilidad prolongada.

## Detecciones por cámara

En la rama tiago, aplicar las migraciones numeradas del backend (incluida 051_camera_detections.sql) antes de iniciar los servicios actualizados. Reconstruir la imagen de inferencia para incluir MoveNet. En Cámaras, abrir una cámara registrada y cambiar los interruptores con una cuenta administradora. Los residentes pueden consultar los ajustes desde la web y Flutter. Los cambios se guardan aunque la cámara esté desconectada.

Para probar solo video, apagar las cinco funciones. Para probar movimiento, activar únicamente Movimiento y abrir una puerta frente a un teléfono fijo. Para probar postura, activar únicamente Postura, encuadrar el cuerpo completo y mantener cada posición durante al menos tres análisis. El historial indica el inicio de cada episodio o cambio confirmado. Los cambios generales de iluminación se filtran; mover el teléfono puede detectarse como movimiento en la escena.

Con la configuración LAN existente, desde la raíz del proyecto:

```powershell
docker compose --env-file .env.lan -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

El servicio `migrate` del Compose LAN ejecuta las migraciones antes del backend. Abrir `https://<IP-LAN-de-la-PC>:8443` con la misma autoridad local de confianza. Para la app Flutter, usar la configuración de conexión de la instalación y actualizar la app compilada para ver los interruptores.

Para la sesión física de 30 minutos, usar la misma escena con postura apagada durante 15 minutos y encendida durante otros 15. Comparar duración de análisis, memoria y CPU del contenedor con docker stats, registrar las transiciones observadas y comprobar la continuidad con el visor cerrado y tras reconectar. La duración de análisis no incluye latencia WebRTC.
