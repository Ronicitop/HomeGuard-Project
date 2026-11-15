-- Non-destructive bootstrap of the original HomeGuard schema.
-- 1. ELIMINACIÓN DE TABLAS EN ORDEN INVERSO DE DEPENDENCIAS 

-- MÓDULO: SEGURIDAD, ACCESOS Y USUARIOS (SPRINT 1)
CREATE TABLE IF NOT EXISTS Usuario ( 
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

CREATE TABLE IF NOT EXISTS Rol ( 
    id SERIAL PRIMARY KEY, 
    nombre VARCHAR(50) UNIQUE NOT NULL, 
    descripcion VARCHAR(255) 
); 

CREATE TABLE IF NOT EXISTS Permiso ( 
    id SERIAL PRIMARY KEY, 
    codigo VARCHAR(50) UNIQUE NOT NULL, 
    descripcion VARCHAR(255) 
); 

CREATE TABLE IF NOT EXISTS RolPermiso ( 
    rol_id INT NOT NULL REFERENCES Rol(id) ON DELETE CASCADE, 
    permiso_id INT NOT NULL REFERENCES Permiso(id) ON DELETE CASCADE, 
    PRIMARY KEY (rol_id, permiso_id) 
);

CREATE TABLE IF NOT EXISTS RolUsuario ( 
    usuario_id INT NOT NULL REFERENCES Usuario(id) ON DELETE CASCADE, 
    rol_id INT NOT NULL REFERENCES Rol(id) ON DELETE CASCADE, 
    PRIMARY KEY (usuario_id, rol_id) 
);

-- MÓDULO: DISPOSITIVOS Y HARDWARE IOT (SPRINT 1)
CREATE TABLE IF NOT EXISTS DispositivoESP32 ( 
    device_id VARCHAR(50) PRIMARY KEY, 
    nombre VARCHAR(100) NOT NULL, 
    zona VARCHAR(100) NOT NULL, 
    direccion_mac VARCHAR(20) UNIQUE, 
    ip_local VARCHAR(45), 
    activo BOOLEAN DEFAULT TRUE, 
    ultimo_heartbeat TIMESTAMP, 
    usuario_id INT REFERENCES Usuario(id) ON DELETE SET NULL 
);

-- MÓDULO: MODOS Y UMBRALES DE SEGURIDAD (SPRINT 2)
CREATE TABLE IF NOT EXISTS ModoHogar ( 
    id SERIAL PRIMARY KEY, 
    modo_actual VARCHAR(20) NOT NULL CHECK (modo_actual IN ('HOME', 'AWAY', 'DISARMED')), 
    activo BOOLEAN DEFAULT FALSE, 
    fecha_activacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    usuario_id INT REFERENCES Usuario(id) ON DELETE SET NULL 
); 

CREATE TABLE IF NOT EXISTS ConfiguracionUmbral ( 
    id SERIAL PRIMARY KEY, 
    tipo_sensor VARCHAR(50) NOT NULL, 
    valor_minimo REAL, 
    valor_maximo REAL, 
    unidad VARCHAR(20), 
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT REFERENCES Usuario(id) ON DELETE SET NULL 
);

-- MÓDULO: TELEMETRÍA Y ALERTAS CORRELACIONADAS (SPRINT 1 + SPRINT 2)
CREATE TABLE IF NOT EXISTS TelemetriaSensor ( 
    id BIGSERIAL PRIMARY KEY, 
    device_id VARCHAR(50) NOT NULL REFERENCES DispositivoESP32(device_id) ON DELETE CASCADE, 
    tipo_sensor VARCHAR(50) NOT NULL, 
    valor_numerico REAL, 
    estado_texto VARCHAR(50), 
    unidad VARCHAR(20), 
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
); 

CREATE TABLE IF NOT EXISTS AlertaCorrelacionada ( 
    id BIGSERIAL PRIMARY KEY, 
    titulo VARCHAR(200) NOT NULL, 
    severidad VARCHAR(20) NOT NULL CHECK (severidad IN ('INFO', 'WARNING', 'CRITICAL')), 
    regla_disparadora TEXT NOT NULL, 
    modo_hogar_id INT REFERENCES ModoHogar(id) ON DELETE SET NULL, 
    telemetria_origen_id BIGINT REFERENCES TelemetriaSensor(id) ON DELETE SET NULL, 
    resuelta BOOLEAN DEFAULT FALSE, 
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
);

-- ÍNDICES DE OPTIMIZACIÓN
CREATE INDEX IF NOT EXISTS idx_telemetria_device_fecha ON TelemetriaSensor (device_id, fecha_registro DESC); 
CREATE INDEX IF NOT EXISTS idx_telemetria_tipo ON TelemetriaSensor (tipo_sensor, fecha_registro DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_no_resueltas ON AlertaCorrelacionada (resuelta, fecha_hora DESC);
CREATE TABLE IF NOT EXISTS ConsumoElectrico (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL REFERENCES DispositivoESP32(device_id),
    voltaje_v REAL NOT NULL,
    corriente_a REAL NOT NULL,
    potencia_w REAL NOT NULL,
    energia_kwh REAL NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS DispositivoUbicacion2D (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL REFERENCES DispositivoESP32(device_id),
    tipo_sensor VARCHAR(50) NOT NULL,
    etiqueta VARCHAR(100) NOT NULL,
    zona_habitacion VARCHAR(100) NOT NULL,
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    UNIQUE(device_id, tipo_sensor)
);
CREATE TABLE IF NOT EXISTS Actuador (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL REFERENCES DispositivoESP32(device_id),
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    estado_actual VARCHAR(3) NOT NULL CHECK (estado_actual IN ('ON', 'OFF')),
    ultima_activacion TIMESTAMP,
    usuario_id INT REFERENCES Usuario(id) ON DELETE SET NULL
);
