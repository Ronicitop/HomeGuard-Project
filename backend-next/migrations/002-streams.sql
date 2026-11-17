CREATE TABLE IF NOT EXISTS SesionCamara(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,camara_id INTEGER NOT NULL REFERENCES Camara(id) ON DELETE CASCADE,usuario_id INTEGER NOT NULL REFERENCES Usuario(id) ON DELETE CASCADE,tipo TEXT NOT NULL CHECK(tipo IN ('publish','process')),ruta TEXT NOT NULL,expira_en TIMESTAMPTZ NOT NULL,media_id TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS sesioncamara_publish ON SesionCamara(tipo) WHERE tipo='publish';
CREATE UNIQUE INDEX IF NOT EXISTS sesioncamara_process ON SesionCamara(tipo) WHERE tipo='process';
