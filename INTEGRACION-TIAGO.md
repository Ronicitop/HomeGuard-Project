# Integración local de tiago, main y camaras

Solicitud del usuario: crear y subir `tiago` con su trabajo y, después, reunir los cambios de `main` y `camaras` en esta PC.

## Ramas y respaldo

- `origin/tiago` se creó y subió en el commit `3b83756`, conservando todo el desarrollo B.
- `origin/main` estaba en `63175c3`; no tenía commits nuevos respecto de la base B.
- `origin/camaras` estaba en `2407486` (`camaras inteligentes`).
- Se fusionó camaras dentro de tiago **localmente**, con dos padres de merge y sin reescribir historia. La unión local no se publica automáticamente ni cambia main/camaras remotos.
- El checkout de trabajo sigue en `outputs/HomeGuard-Project`. Existe un bundle previo en la carpeta de trabajo y se respaldó PostgreSQL antes de migrar. Credenciales, videos, modelos y respaldos permanecen fuera de Git.

## Conflictos resueltos

Había 20 archivos en conflicto. Se conservaron la sesión canónica B, CSRF, roles, eventos, emergencias, migraciones con checksum y el shell del panel. Se incorporaron el componente de cámaras, sus servicios, inferencia, MediaMTX y documentación de camaras.

- Cámaras usa el mismo login `hg_session`/bearer y los roles B; no se mantiene una segunda cookie/Sesion independiente.
- Las APIs de cámaras/streams/análisis verifican hogar y permisos. Los tokens de medios dependen de una sesión B vigente; la revocación impide autorizar conexiones nuevas y el procesador limpia conexiones vencidas.
- Se agregó `030_camaras_integration.sql`, sin editar migraciones ya aplicadas ni ejecutar el migrador antiguo que podía volver a hashear contraseñas. Conserva las tablas/nombres de la rama recibida, añade hogar y vínculo con sesión B y convierte de forma compatible su formato scrypt anterior.
- La página Cámaras se carga dentro del panel existente. Creación/borrado, cookies y CSRF se probaron en navegador. Los estilos quedan limitados a Cámaras.
- Inferencia conserva el algoritmo recibido, pero sus perfiles, detecciones y altas se limitan al hogar y la sesión autorizados. El navegador no puede insertar descriptores/eventos fabricados.
- Se unificaron scripts/dependencias. React19 del backend procede de camaras; el procesador MQTT B continúa siendo único. Next nativo usa next start; standalone queda reservado al build Docker que lo solicita.

## Comprobaciones

- Backend: 69 pruebas, incluyendo 7 de integración de cámaras; TypeScript y build Next correctos.
- Web: 7 pruebas, ESLint y build Vite correctos.
- Inferencia: 6 pruebas de su lógica recibida y verificación sintáctica de los procesos JavaScript.
- Navegador: 2 recorridos aprobados: login/cámara/alta/borrado y el recorrido B de eventos/emergencia/voz Piper.
- Se aplicó la migración030 a la DB local después del respaldo. Se conservó el acceso del administrador existente.

## Límites de esta unión

La unión de código no equivale a una prueba física de video o reconocimiento. Docker está instalado, pero su motor no estaba iniciado durante esta verificación; no se levantaron ni se certificaron MediaMTX/TensorFlow/modelos. El panel local y la administración de cámaras funcionan; las transmisiones reales requieren configurar y arrancar esos servicios.

La rama camaras recibida registra varias cámaras, pero su motor permite un publicador, visor y procesador concurrentes. Se conserva ese límite; no se declara soporte simultáneo para diez streams. Sus eventos se consultan en el historial de Cámaras; el protocolo de reglas/clips HG-CONTRACT y los módulos nativos móviles siguen requiriendo integración adicional. No se afirma que reconocer un rostro active emergencias o que guarde clips.

Los archivos Docker/LAN recibidos quedan disponibles como referencia. Su despliegue completo con el monorepo B, secretos, broker autenticado y servicios de medios requiere un ensayo separado: no se declara validado por los builds nativos de Windows. Las pruebas con imágenes de personas, recepción push y APK en Android permanecen pendientes.

Para abrir el panel nativo: Iniciar HomeGuard.cmd, http://localhost:5173. Credenciales de demo existentes y configuración privada se conservan. La guía original de camaras está en SERVER-VISION.md; no ejecutar SQL destructivo para actualizar esta DB.
