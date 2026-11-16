# Verificación de la mitad B

Última ejecución: 15/11/2026, aproximadamente 22:18, America/La_Paz. Rama local feat/mitad-b. Sin push, merge o publicación.

| Comprobación | Resultado observado |
|---|---|
| Backend Vitest con PostgreSQL exclusivo | 62/62 pruebas, 12 archivos |
| Backend TypeScript y Next production build | Correctos |
| Web Vitest | 7/7 pruebas, 4 archivos |
| Web ESLint y Vite production build | Correctos |
| Móvil dominio | 5/5 pruebas |
| Móvil TypeScript y Expo lint | Correctos |
| Expo doctor | 20/20 comprobaciones |
| Expo export Android | Correcto, 1212 módulos; bundle Hermes, no APK |
| ACL MQTT y seguridad de procesos | 4/4 pruebas |
| Navegador Playwright, demo local reiniciada | 1/1 recorrido integral, 9,5 segundos |
| Respaldo DB y restauración separada | Verificados antes de migrar homeguard_db |
| Instalador de voz y hashes fijados | Verificados contra manifiesto versionado |

El recorrido de navegador inicia sesión, genera y revisa un evento SIMULATED, espera ACK real del simulador, guarda perfil ficticio y política, genera caída posible, solicita ayuda, acepta en la central, obtiene un WAV RIFF realmente generado por Piper y cierra el incidente. Deshabilita la política al finalizar. No envía push externo ni llamadas públicas. La vista móvil se comprobó además con viewport390, menú cerrado y sin desbordamiento horizontal.

## Fallos reproducidos y corregidos

Cada fallo siguiente tuvo una prueba que falló antes de corregirlo y después pasó:

1. Las rutas MQTT de clips tienen seis segmentos. La ACL anterior exigía cinco y rechazaba solicitudes/resultados. Ahora valida el prefijo y la ruta completa contra su lista permitida, conservando el aislamiento de hogares y rechazando sufijos extra.
2. Una alarma automática encolada podía publicarse después de desarmar o deshabilitar su regla. Ahora se vuelve a comprobar comando, antigüedad, modo, regla y versiones antes de despachar; una orden manual posterior prevalece. Las órdenes rechazadas quedan CANCELLED y auditadas.
3. Una entrega podía quedar QUEUED cuando su job agotaba reintentos. Ahora termina FAILED; si un envío quedó incierto durante un reinicio, queda UNKNOWN y no se reenvía ciegamente.
4. “Solicitar ayuda” podía eludir una política global deshabilitada. La respuesta usa el mismo bloqueo de política que su configuración y exige que siga habilitada.
5. Logout móvil no desvinculaba atómicamente su instalación. Ahora una operación revoca sesión y dispositivo propio. Si no hay conexión, el teléfono informa que solo pudo cerrar la sesión local. La web permite desvincular instalaciones propias.
6. Una respuesta HTTP cancelada se convertía en datos vacíos exitosos y podía romper pantallas. Web/móvil propagan el error; la web oculta además datos del recurso anterior al cambiar de incidente.
7. Conocer un installation_id podía desactivar un dispositivo de otro hogar. La reasignación ahora exige poseer el mismo token privado del proveedor y se serializa por instalación; un token diferente no revoca al otro usuario.
8. Diferencias CRLF/LF rompían checksums de migraciones entre Windows/Linux. Se normalizan finales de línea y se conservan verificaciones contra cambios reales de SQL.

También se comprobaron deduplicación concurrente, scopes, CSRF, membresías deshabilitadas, revisiones optimistas, cooldown, caducidad, preferencias al despachar, receipts, cancelación, recuperación administrativa y ausencia de efectos cuando la evidencia no es visible.

## Alcance de la revisión

Se solicitó una única revisión independiente del rango63175c3..5952281. Alcanzó a revisar autenticación/scope y señaló los tres primeros defectos. El revisor se interrumpió por límite de uso antes de emitir informe final. Se corrigieron esos defectos con regresiones y se completó una revisión propia de los cambios restantes, que detectó los casos4–7. **No existe un dictamen independiente completo de aprobación.** La suite final quedó verde; esa evidencia no sustituye la revisión que falta.

## Decisiones de ejecución

- Se conservó el checkout dedicado y se creó una rama, manteniendo la instalación local. Coste: no editar este mismo directorio simultáneamente desde otra rama.
- Se llevó el registro de tareas con herramientas Windows, ya que los helpers de planificación estaban escritos para Bash. Coste: el seguimiento es manual y queda en el registro de ejecución.
- Se ejecutó primero el núcleo backend para que las pantallas consumieran servicios verificados. Coste: los commits agrupan dominios dependientes de varios IDs del plan.
- Se implementó todo el código B independiente disponible, dejando A, FCM y teléfono como dependencias de aceptación. Coste: H1-H6 y la aceptación nativa no pueden declararse aprobados.
- Se actualizó Next del baseline vulnerable y se adaptó su router. Coste: cambio de versión mayor; el build actual fue comprobado, queda aviso de React18 deprecado.
- La migración021 se difiere sin registrar aplicación mientras falten tablas A. Coste: sus claves cruzadas se incorporan al integrar A.
- Piper usa un cache privado B detrás de autorización hasta contar con el registro de artefactos A. Coste: integrar almacenamiento/retención VOICE antes de la aceptación conjunta.
- Se aplicó Expo Router requerido por el AGENTS del scaffold, conservando una ruta raíz y parámetros de vista. Coste: navegación nativa más rica y back stacks quedan para una iteración posterior.
- La rama se conserva localmente, sin menú de publicación o mezcla innecesario para la petición actual. Coste: el equipo debe decidir cómo integrarla en su colaboración.

## Pendientes y observaciones menores

La ausencia de A, credenciales FCM y Android físico/SDK está detallada en ESTADO-Y-ENTREGA.md. No se certificó reconocimiento facial, detección real, clips reales, diez cámaras, codecs Android o notificaciones en segundo plano. No se conectó hardware ni telefonía pública.

Quedan el aviso de React18 del backend, el aviso de raíz inferida por varios lockfiles, avisos moderados transitivos de npm audit y una advertencia Node sobre inferir el tipo del módulo de tests móvil. No impidieron builds/pruebas. El cache de voz y la navegación móvil tienen las limitaciones descritas arriba. El prototipo es una demo académica local; no se afirma preparación para producción.
