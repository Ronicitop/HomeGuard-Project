# HomeGuard Flutter

App móvil nativa Android/iOS. La app Expo anterior está en ../mobile-app; sus reglas específicas de Expo no aplican aquí.

- Usar `flutter analyze`, `flutter test`, `flutter build apk` y `flutter build web`.
- Conservar permisos por hogar/rol y bearer en almacenamiento seguro. Nunca almacenar contraseñas, tokens o claves de Firebase servidor en el código.
- No agregar cámaras ni sensores desde esta app. Consultar/configurar equipos existentes según permisos; nunca presentar muestras ficticias como hardware.
- Central y llamadas siguen siendo simuladas. Personas/Movimientos dependen de APIs aún pendientes; no inventar endpoints.
- SDK/JDK privados y artefactos están en ../.local y no se versionan.
