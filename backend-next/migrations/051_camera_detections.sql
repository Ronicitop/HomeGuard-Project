ALTER TABLE Camara ADD COLUMN IF NOT EXISTS detection_settings jsonb NOT NULL DEFAULT '{"people":true,"faces":true,"pets":true,"motion":false,"posture":false}',
  ADD COLUMN IF NOT EXISTS detection_revision integer NOT NULL DEFAULT 1;
ALTER TABLE EventoCamara DROP CONSTRAINT IF EXISTS eventocamara_categoria_check;
ALTER TABLE EventoCamara ADD CONSTRAINT eventocamara_categoria_check CHECK (categoria IN ('resident','unknown','person','cat','dog','motion','standing','sitting'));
ALTER TABLE EventoCamara ADD COLUMN IF NOT EXISTS track_key text;
