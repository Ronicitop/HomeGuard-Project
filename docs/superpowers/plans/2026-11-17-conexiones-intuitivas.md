# Conexiones intuitivas — diseño y plan

Objetivo solicitado: que una persona sin conocimientos técnicos pueda registrar equipos sin completar protocolos, heartbeat o claves de canales.

Diseño: asistente de dos pasos, primero elegir Cámara, Sensor, Luces/alarma o Equipo con varios sensores; después nombre, ubicación y la función concreta. La webcam se busca mediante permiso explícito. Los sensores/actuadores conservan los valores técnicos predeterminados del contrato actual; una sección Opciones avanzadas permite al instalador cambiarlos. No se promete descubrimiento universal ni conexión física automática. La edición conserva transporte, claves y metadatos existentes al guardar desde la vista sencilla.

La credencial posterior se presenta como preparación de conexión: estado registrado/pendiente, descarga privada de configuración para el instalador y detalles técnicos desplegables. El archivo incluye el secreto mostrado una sola vez, sin persistirlo en localStorage. Se aclara que la dirección de red debe configurarse para el equipo real.

Decisión de implementación: aplicar el cambio directamente al flujo existente en tiago, conforme a la solicitud y al contexto de desarrollo; no se necesita otro ciclo de aprobación para ocultar opciones avanzadas. Se conserva HTTP como valor inicial compatible con el backend; no se hace pasar ese valor por detección del hardware.

Archivos: extraer ConnectionForm.tsx desde ConnectionsPage.tsx para separar el asistente; adaptar ProvisionDialog en la página; ampliar connections.css; helper de archivo en models.ts; pruebas de componentes y E2E y guía de conexiones.

1. Pruebas RED del asistente, opciones técnicas ocultas, cámara y conservación de datos al editar; prueba de archivo privado.
2. Implementar selección guiada, campos contextuales, opciones avanzadas y descarga. Mantener validación, permisos y contratos backend.
3. GREEN de componentes; adaptar pruebas de navegación para selección por tarjetas y descarga. Build y lint frontend; verificar escritorio/móvil y liberar captura después de detectar webcams.
4. Actualizar guía, compilar y dejar la aplicación local con el formulario nuevo. Sin cambios de infraestructura, de base ni publicación remota.

## Ejecución

- Pruebas de componentes RED por módulo de asistente ausente → GREEN para selección sencilla, cámara y edición conservando los ajustes del instalador.
- Prueba de exportación RED por helper ausente → GREEN para JSON privado HTTP/MQTT sin parámetros del transporte incorrecto.
- Frontend: 14/14 pruebas. TypeScript/build Vite y ESLint correctos.
- Navegador: 2/2 flujos de conexión y cámaras; se comprobó descarga de JSON, ausencia de claves en el listado, móvil sin desbordamiento, edición/habilitación/baja y ausencia de lecturas inventadas.
- Capturas inspeccionadas de formulario sencillo en escritorio y móvil en .local/verification; el diseño conserva el tema existente.
- Un intento inicial de navegación cargó la compilación anterior mientras se estaba reconstruyendo el frontend; se corrigieron errores de tipado de las pruebas y se repitieron los dos flujos sobre la compilación nueva, ambos correctos.

Revisión final independiente completa. Detectó un caso de pérdida de la credencial si se cerraba el formulario durante el POST pendiente. Se reprodujo en navegador (RED: Cancelar seguía habilitado), se bloquearon Cancelar, Cerrar y Escape durante el guardado, y se comprobó que después se entrega la configuración (GREEN). La suite frontend volvió a pasar 14/14, los flujos de navegador 2/2 y build/lint correctos. No quedaron hallazgos pendientes.

El revisor dejó fuera de su inspección estática el hardware, el comportamiento específico del navegador y el render visual. Resolución: se conserva explícitamente la limitación de hardware; la navegación real y las capturas revisadas cubren el flujo de formularios y el diseño en escritorio/móvil. No se afirma calibración de sensores ni captura física probada.

Se conservan los límites de compatibilidad física y permisos del sistema previo; el asistente no descubre ni enlaza hardware automáticamente. Aplicación local actualizada mediante el build del frontend existente, sin reiniciar ni modificar backend/DB. Trabajo conservado en tiago; no se publica remotamente esta iteración.
