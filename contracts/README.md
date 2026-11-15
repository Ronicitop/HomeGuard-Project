# HG-CONTRACT-1.0

Los schemas JSON son la validación en el límite MQTT; `types.ts` describe los DTO compartidos. `openapi.json` es OpenAPI 3.1 (JSON es también un documento YAML válido).

A implementa cámaras, perfiles/encuentros, reglas, clips y Codex. B implementa sesión, ingesta, historial, jobs, avisos, seguridad y emergencias. B no devuelve cámaras o clips inventados si A aún no está instalado.

Para conectar A: publicar propuestas con el schema y hogar del topic; consumir ACK por message_id; proveer tablas/configuración de A con las columnas del plan. La migración 021 permanece diferida mientras falten esas tablas. Generar fixtures solo con source SIMULATED/REPLAY y no usar como si fueran LIVE.

Autenticación exportada: `backend-next/lib/auth/sessionService.ts` y `permissions.ts`. Extensión A: `backend-next/lib/integrations/vision.ts`. Nombres públicos y contratos requieren revisión de ambos integrantes.
