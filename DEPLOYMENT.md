> Actualización: el reconocimiento se ejecuta en el servidor. Consultar [SERVER-VISION.md](SERVER-VISION.md) para arquitectura, variables y validación actuales. Las referencias anteriores a procesamiento en navegador quedan sustituidas.

# HomeGuard: cámaras y despliegue

## Desarrollo

1. `docker compose up -d db mqtt`
2. Instalar dependencias en backend y frontend con `npm ci`.
3. En backend: configurar DB_HOST, DB_PORT, DB_USER, DB_PASS y DB_NAME para PostgreSQL. Ejecutar `npm run migrate` antes de iniciar la aplicación. La migración agrega tablas y convierte las contraseñas anteriores a scrypt; no borra datos. El archivo init-db solamente inicializa volúmenes nuevos: nunca ejecutarlo manualmente sobre datos existentes.
4. En backend: `npm run dev` y, en otra terminal con las mismas variables, `npm run worker`. Configurar MQTT_BROKER_URL (localhost:1883 fuera de Docker).
5. En frontend: `npm run models`, `npm run dev`. Abrir http://localhost:5173. La API pasa por el proxy de Vite.
6. Docker de desarrollo: reconstruir backend para instalar tsx; ejecutar `docker compose run --rm backend npm run migrate`, iniciar backend/frontend y `docker compose run --rm backend npm run worker` en otra terminal. Vite usa API_PROXY_TARGET=http://backend:3000.

Si PostgreSQL ya ocupa 5432 en Windows, usar otro puerto publicado; no cambiar contraseñas ni eliminar volúmenes para resolver el conflicto.

## Producción en VM

Copiar `.env.production.example` a `.env.production`, reemplazar todos los valores y apuntar el DNS del dominio a la VM. Abrir TCP 80/443 y UDP 443. Docker y Docker Compose deben estar instalados.

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Caddy obtiene HTTPS automáticamente. PostgreSQL y MQTT no publican puertos. El worker MQTT debe tener una sola réplica. El proyecto es para una vivienda. El ESP32 necesitará un puente de red/VPN para llegar al broker privado; no abrir MQTT anónimo a Internet.

Para pruebas móviles abrir el dominio HTTPS en el teléfono, iniciar sesión y entrar en Cámaras. El dispositivo que abre la página utiliza su propia cámara. Para pruebas por LAN se necesita un certificado confiable en el móvil; HTTP con la IP de la laptop no permite capturar cámara.

El servicio migrate espera la base y se ejecuta antes de backend/worker. ADMIN_EMAIL/ADMIN_PASSWORD actualizan el administrador al ejecutar migraciones: retirarlos del entorno del servicio migrate después del primer arranque si se desea conservar cambios posteriores de contraseña. Mantenerlos protegidos como secretos. No usar credenciales de demostración en nube.

## Respaldo y restauración

Desde una shell POSIX en la VM (el formato binario no debe redirigirse desde Windows PowerShell antiguo):

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > homeguard.dump
# Restaurar en una base vacía previamente creada y verificada:
cat homeguard.dump | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner'
```

Guardar respaldos cifrados fuera de la VM y probar la restauración en otra base. No usar `down -v` sobre datos que se quieran conservar.

## Reconocimiento y privacidad

COCO-SSD lite_mobilenet_v2 detecta personas, perros y gatos; Human 3.3.6 usa BlazeFace y FaceRes. Los pesos se sirven en `/models`; los archivos de licencia se copian durante `npm run models`. Créditos y licencias específicas de pesos: https://github.com/vladmandic/human/wiki/Models . No se envían ni guardan imágenes. Los descriptores son datos biométricos: limitar las cuentas autorizadas y registrar solo personas que acepten participar.

Se requieren cinco muestras con un rostro visible. El umbral inicial de similitud es 0.65; debe calibrarse con muestras distintas antes de interpretar resultados. No incluye protección contra fotografías ni es un mecanismo de acceso/desarmado. Las alertas de cámara son advertencias y no activan sirenas. Las reglas MQTT conservan sus actuadores.

La detección se detiene al salir del módulo o cerrar sesión y se pausa al ocultar la página. Sin Internet continúa con los perfiles cargados; los eventos fallidos se descartan y se informa que no se guardan. Los eventos se purgan diariamente a los 30 días. Borrar un perfil desvincula su identidad del historial.

## Validación manual pendiente

Probar webcam y móvil con permisos denegados, cambio de cámara, interrupción, orientación, baja luz, varios rostros, rostros ocultos, perros y gatos. Medir una sesión de 30 minutos: memoria al inicio/final, tiempo de inferencia y temperatura/consumo. Revisar Network para confirmar que solo se envían metadatos. Usar muestras de registro y evaluación diferentes; registrar coincidencias correctas, falsas identificaciones y desconocidos confundidos con residentes. El objetivo de latencia es menos de dos segundos con buena luz, sujeto al equipo.

## Prueba de integración automatizada

Usar exclusivamente una base desechable inicializada con init-db. Ejecutar migración, iniciar Next en puerto 3100 con esa base y ejecutar `npx tsx scripts/integration.ts` desde backend con las mismas variables. La prueba agrega datos sintéticos y verifica sesiones, permisos, eventos, deduplicación concurrente y modos. No ejecutarla contra producción.

## Comprobaciones ejecutadas

- Builds de React/Vite y Next.js 16.4.6 correctos. Next.js se actualizó desde 14 para resolver vulnerabilidades críticas; sesiones adaptadas a cookies asíncronas.
- Auditoría npm del backend: cero vulnerabilidades después de actualizar dependencias. Frontend: avisos moderados en herramientas de lint; revisar su actualización por separado, sin aplicar downgrades automáticos.
- Prueba de integración API pasada en PostgreSQL desechable: hashes, sesión HttpOnly, invitado rechazado, validación de eventos, deduplicación concurrente, reglas HOME/DISARMED/AWAY y desvinculación al borrar perfiles.
- Publicación MQTT sintética recibida por el worker y persistida en PostgreSQL.
- Docker Compose de producción validado con config --quiet. Modelos descargados y servibles localmente.
- Pendientes de ejecución física: webcam/celular, precisión facial, latencia, consumo y sesión de 30 minutos. No se afirma una precisión o un rendimiento medido todavía.

Las imágenes Docker `homeguard-backend:validation` y `homeguard-frontend:validation` se construyeron correctamente. El backend standalone arrancó en contenedor y respondió health=200 y status sin sesión=401. Se probó inferencia COCO-SSD con pesos locales y un fotograma sintético de 640x480; no reemplaza la evaluación con cámaras reales.
