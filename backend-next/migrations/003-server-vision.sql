ALTER TABLE SesionCamara DROP CONSTRAINT IF EXISTS sesioncamara_tipo_check;
ALTER TABLE SesionCamara ADD CONSTRAINT sesioncamara_tipo_check CHECK(tipo IN ('publish','process','view'));
CREATE UNIQUE INDEX IF NOT EXISTS sesioncamara_view ON SesionCamara(tipo) WHERE tipo='view';
