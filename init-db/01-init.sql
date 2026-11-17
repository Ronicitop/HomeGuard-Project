-- ==========================================================
-- HOMEGUARD IoT - Script de Inicialización de Base de Datos
-- ==========================================================

-- 1. ELIMINACIÓN DE TABLAS EN ORDEN INVERSO DE DEPENDENCIAS
DROP TABLE IF EXISTS AlertaCorrelacionada CASCADE;
DROP TABLE IF EXISTS TelemetriaSensor CASCADE;
DROP TABLE IF EXISTS ConfiguracionUmbral CASCADE;
DROP TABLE IF EXISTS ModoHogar CASCADE;
DROP TABLE IF EXISTS ConsumoElectrico CASCADE;
DROP TABLE IF EXISTS DispositivoUbicacion2D CASCADE;
DROP TABLE IF EXISTS Actuador CASCADE;
DROP TABLE IF EXISTS DispositivoESP32 CASCADE;
DROP TABLE IF EXISTS RolUsuario CASCADE;
DROP TABLE IF EXISTS RolPermiso CASCADE;
DROP TABLE IF EXISTS Permiso CASCADE;
DROP TABLE IF EXISTS Rol CASCADE;
DROP TABLE IF EXISTS Usuario CASCADE;

-- 2. MÓDULO: SEGURIDAD, ACCESOS Y USUARIOS
CREATE TABLE Usuario (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telefono INT,
    activo BOOLEAN DEFAULT TRUE,
    ultima_conexion TIMESTAMP,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Rol (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL,
    descripcion VARCHAR(255)
);

CREATE TABLE Permiso (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    descripcion VARCHAR(255)
);

CREATE TABLE RolPermiso (
    rol_id INT NOT NULL REFERENCES Rol(id) ON DELETE CASCADE,
    permiso_id INT NOT NULL REFERENCES Permiso(id) ON DELETE CASCADE,
    PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE RolUsuario (
    usuario_id INT NOT NULL REFERENCES Usuario(id) ON DELETE CASCADE,
    rol_id INT NOT NULL REFERENCES Rol(id) ON DELETE CASCADE,
    PRIMARY KEY (usuario_id, rol_id)
);

-- 3. MÓDULO: DISPOSITIVOS Y HARDWARE IOT
CREATE TABLE DispositivoESP32 (
    device_id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    zona VARCHAR(100) NOT NULL,
    direccion_mac VARCHAR(20) UNIQUE,
    ip_local VARCHAR(45),
    activo BOOLEAN DEFAULT TRUE,
    ultimo_heartbeat TIMESTAMP,
    usuario_id INT REFERENCES Usuario(id) ON DELETE SET NULL
);

-- 4. MÓDULO: MODOS Y UMBRALES DE SEGURIDAD
CREATE TABLE ModoHogar (
    id SERIAL PRIMARY KEY,
    modo_actual VARCHAR(20) NOT NULL CHECK (modo_actual IN ('HOME', 'AWAY', 'DISARMED')),
    activo BOOLEAN DEFAULT FALSE,
    fecha_activacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT REFERENCES Usuario(id) ON DELETE SET NULL
);

CREATE TABLE ConfiguracionUmbral (
    id SERIAL PRIMARY KEY,
    tipo_sensor VARCHAR(50) NOT NULL,
    valor_minimo REAL,
    valor_maximo REAL,
    unidad VARCHAR(20),
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT REFERENCES Usuario(id) ON DELETE SET NULL
);

-- 5. MÓDULO: TELEMETRÍA Y ALERTAS CORRELACIONADAS
CREATE TABLE TelemetriaSensor (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL REFERENCES DispositivoESP32(device_id) ON DELETE CASCADE,
    tipo_sensor VARCHAR(50) NOT NULL,
    valor_numerico REAL,
    estado_texto VARCHAR(50),
    unidad VARCHAR(20),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE AlertaCorrelacionada (
    id BIGSERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    severidad VARCHAR(20) NOT NULL CHECK (severidad IN ('INFO', 'WARNING', 'CRITICAL')),
    regla_disparadora TEXT NOT NULL,
    modo_hogar_id INT REFERENCES ModoHogar(id) ON DELETE SET NULL,
    telemetria_origen_id BIGINT REFERENCES TelemetriaSensor(id) ON DELETE SET NULL,
    resuelta BOOLEAN DEFAULT FALSE,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. MÓDULO SPRINT 3: EFICIENCIA ENERGÉTICA, ACTUADORES Y PLANO 2D
CREATE TABLE ConsumoElectrico (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    voltaje_v REAL,
    corriente_a REAL,
    potencia_w REAL,
    energia_kwh REAL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Actuador (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    estado_actual VARCHAR(20) DEFAULT 'OFF',
    ultima_activacion TIMESTAMP,
    usuario_id INT REFERENCES Usuario(id) ON DELETE SET NULL
);

CREATE TABLE DispositivoUbicacion2D (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    tipo_sensor VARCHAR(50) NOT NULL,
    etiqueta VARCHAR(100) NOT NULL,
    zona_habitacion VARCHAR(100) NOT NULL,
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL
);

-- ÍNDICES DE OPTIMIZACIÓN
CREATE INDEX idx_telemetria_device_fecha ON TelemetriaSensor (device_id, fecha_registro DESC);
CREATE INDEX idx_telemetria_tipo ON TelemetriaSensor (tipo_sensor, fecha_registro DESC);
CREATE INDEX idx_alertas_no_resueltas ON AlertaCorrelacionada (resuelta, fecha_hora DESC);
CREATE INDEX idx_consumo_fecha ON ConsumoElectrico (fecha_registro DESC);

-- ==========================================================
-- 7. SEED DATA (DATOS INICIALES)
-- ==========================================================

-- Roles del Sistema
INSERT INTO Rol (id, nombre, descripcion) VALUES
(1, 'ADMIN', 'Administrador con control total del sistema y gestión de usuarios'),
(2, 'RESIDENTE', 'Usuario residente con permisos de control y visualización'),
(3, 'INVITADO', 'Acceso de solo lectura al estado general');

-- Catálogo de Permisos
INSERT INTO Permiso (id, codigo, descripcion) VALUES
(1, 'GESTION_USUARIOS', 'Creación, edición y listado de usuarios'),
(2, 'CONTROL_DISPOSITIVOS', 'Comandar actuadores y dispositivos'),
(3, 'MODO_ALARMA', 'Conmutación de modos de seguridad del hogar'),
(4, 'VISUALIZAR_DASHBOARD', 'Visualización de telemetría y reportes');

-- Asignación de Permisos a Roles
INSERT INTO RolPermiso (rol_id, permiso_id) VALUES
(1, 1), (1, 2), (1, 3), (1, 4),
(2, 2), (2, 3), (2, 4),
(3, 4);

-- Usuario Administrador Inicial (admin@homeguard.local / admin123)
INSERT INTO Usuario (id, nombre, apellido, email, password_hash, telefono, activo) VALUES
(1, 'Admin', 'HomeGuard', 'admin@homeguard.local', 'admin123', 70000000, TRUE);

INSERT INTO RolUsuario (usuario_id, rol_id) VALUES
(1, 1);

-- Dispositivo Central ESP32
INSERT INTO DispositivoESP32 (device_id, nombre, zona, direccion_mac, ip_local, activo, ultimo_heartbeat, usuario_id) VALUES
('esp32_central_01', 'Nodo Central IoT ESP32', 'Vivienda Principal', '24:6F:28:AE:3C:84', '192.168.1.150', TRUE, NOW(), 1);

-- Modo de Seguridad Inicial (AWAY)
INSERT INTO ModoHogar (id, modo_actual, activo, usuario_id) VALUES
(1, 'AWAY', TRUE, 1);

-- Umbrales de Seguridad
INSERT INTO ConfiguracionUmbral (id, tipo_sensor, valor_minimo, valor_maximo, unidad, usuario_id) VALUES
(1, 'temperatura', 15.0, 40.0, '°C', 1),
(2, 'humo', 0.0, 300.0, 'ppm', 1);

-- Actuadores del Sistema (Sirena, Relé de energía, Electroválvula de agua)
INSERT INTO Actuador (id, device_id, codigo, nombre, tipo, estado_actual, usuario_id) VALUES
(1, 'esp32_central_01', 'ACT_SIRENA_01', 'Sirena Perimetral 12V', 'SIRENA', 'OFF', 1),
(2, 'esp32_central_01', 'ACT_RELE_01', 'Relé Corte Eléctrico General', 'RELE', 'ON', 1),
(3, 'esp32_central_01', 'ACT_VALVULA_01', 'Electroválvula Corte Agua', 'VALVULA', 'ON', 1);

-- Ubicación espacial de sensores en Plano 2D
INSERT INTO DispositivoUbicacion2D (id, device_id, tipo_sensor, etiqueta, zona_habitacion, pos_x, pos_y) VALUES
(1, 'esp32_central_01', 'puerta', 'Puerta Principal', 'Entrada', 18, 78),
(2, 'esp32_central_01', 'movimiento', 'Sensor PIR Sala', 'Sala de Estar', 20, 35),
(3, 'esp32_central_01', 'temperatura', 'Sensor Térmico', 'Pasillo Central', 52, 35),
(4, 'esp32_central_01', 'humo', 'Detector Humo MQ-2', 'Cocina', 80, 30),
(5, 'esp32_central_01', 'agua', 'Sonda Fuga Agua', 'Lavandería', 80, 75);

-- Lectura telemétrica y energética inicial de referencia
INSERT INTO ConsumoElectrico (device_id, voltaje_v, corriente_a, potencia_w, energia_kwh) VALUES
('esp32_central_01', 220.0, 3.8, 836.0, 14.50);

INSERT INTO TelemetriaSensor (device_id, tipo_sensor, valor_numerico, estado_texto, unidad) VALUES
('esp32_central_01', 'puerta', 0, 'CLOSED', ''),
('esp32_central_01', 'movimiento', 0, 'NORMAL', ''),
('esp32_central_01', 'temperatura', 23.5, 'NORMAL', '°C'),
('esp32_central_01', 'humo', 45, 'NORMAL', 'ppm'),
('esp32_central_01', 'agua', 0, 'DRY', '');

-- Sincronizar secuencias
SELECT setval('usuario_id_seq', (SELECT COALESCE(MAX(id), 1) FROM Usuario));
SELECT setval('rol_id_seq', (SELECT COALESCE(MAX(id), 1) FROM Rol));
SELECT setval('permiso_id_seq', (SELECT COALESCE(MAX(id), 1) FROM Permiso));
SELECT setval('modohogar_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ModoHogar));
SELECT setval('configuracionumbral_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ConfiguracionUmbral));
SELECT setval('actuador_id_seq', (SELECT COALESCE(MAX(id), 1) FROM Actuador));
SELECT setval('dispositivoubicacion2d_id_seq', (SELECT COALESCE(MAX(id), 1) FROM DispositivoUbicacion2D));
