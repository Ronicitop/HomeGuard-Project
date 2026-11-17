> Actualización: el reconocimiento se ejecuta en el servidor. Consultar [SERVER-VISION.md](SERVER-VISION.md) para arquitectura, variables y validación actuales. Las referencias anteriores a procesamiento en navegador quedan sustituidas.

# Celular Android como cámara

1. Celular y PC deben estar en el mismo Wi-Fi, sin aislamiento de clientes. Averiguar la IPv4 Wi-Fi de la PC con ipconfig; reservarla en el router.
2. Crear `.env.lan` con las mismas variables de `.env` y agregar `LAN_IP=192.168.x.x` con la IP real. No cambiar las credenciales existentes de PostgreSQL.
3. Ejecutar `docker compose --env-file .env.lan -f docker-compose.yml -f docker-compose.lan.yml up -d --build`. El backend aplica migraciones sin borrar datos.
4. Exportar solo el certificado público: crear `lan/certs` y ejecutar `docker compose --env-file .env.lan -f docker-compose.yml -f docker-compose.lan.yml cp lan:/data/caddy/pki/authorities/local/root.crt lan/certs/homeguard-ca.crt` después de abrir una vez la URL HTTPS. Nunca copiar root.key ni intermediate.key.
5. Instalar homeguard-ca.crt en Android: Ajustes → Seguridad → Cifrado y credenciales → Instalar certificado → Certificado CA. El nombre varía según el fabricante. En Windows instalarlo en Autoridades de certificación raíz de confianza del usuario actual. Instalar únicamente la CA generada por esta PC. La clave privada permanece en el volumen Docker local. Quitar la CA al finalizar las pruebas.
6. Abrir `https://IP-DE-PC:8443` en ambos dispositivos y comprobar que Chrome no muestre errores de certificado. Iniciar sesión. En PC crear una cámara desde Cámaras si todavía no existe.
7. En Android elegir **Transmitir desde este dispositivo**, seleccionar la cámara registrada, cámara trasera/frontal y pulsar Transmitir. Mantener Chrome abierto y pantalla activa.
8. En PC elegir **Panel de vigilancia**, seleccionar la misma cámara e Iniciar. El reconocimiento y el registro facial se realizan en PC. Detener libera la sesión; si se cierra abruptamente, expira en 45 segundos más hasta 5 segundos de limpieza.

Permitir TCP 8443 y UDP 8189 en el firewall de Windows únicamente para la red privada/local. No abrir puertos del router. No se configura acceso desde Internet. Si cambia la IP, actualizar LAN_IP, recrear servicios e instalar el nuevo certificado si cambió la CA; el certificado de servidor se genera para la nueva IP automáticamente.

Sesiones: una publicación y un procesador simultáneos. Se renuevan cada 10 segundos; si falla la renovación se detienen. MediaMTX no publica HTTP ni API de control al host, usa autenticación de Next.js, rutas aleatorias por transmisión y no graba. El worker revoca las conexiones vencidas. Cerrar sesión o esconder la página puede detener captura/renovación en Android; volver a abrirla y reiniciar si el navegador la suspendió.

Pruebas físicas pendientes: Chrome Android + Chrome/Edge PC, permisos denegados, desconexión Wi-Fi, reconexión, cambio de cámara, múltiples rostros/mascotas, inscripción facial y sesión de 30 minutos midiendo latencia, memoria y estabilidad. Ninguna prueba sintética reemplaza estas mediciones.

## Validación realizada

Builds de React y Next.js correctos. Docker Compose LAN validado. Sesiones verificadas con scripts/stream-integration.mjs: exclusividad, permisos por ruta/acción, bloqueo de eventos sin procesador, vencimiento y renovación. scripts/media-smoke.mjs negoció WHIP real (HTTP 201) con MediaMTX y verificó el candidato ICE LAN; no envía imágenes. HTTPS con la CA exportada responde 200 en /, /api/health y /models/coco/model.json. MediaMTX y Caddy están activos. La variante LAN usa código incorporado en las imágenes: ejecutar up --build tras modificar código.

La IP preparada en este equipo es 192.168.0.9; comprobar que siga vigente. El certificado público exportado está en lan/certs/homeguard-ca.crt. No se instaló confianza automáticamente en Windows ni en Android y no se modificaron reglas de firewall. Las pruebas entre dispositivos reales y los 30 minutos siguen pendientes.
