-- Compatibility schema from origin/camaras. Existing data and canonical B sessions are preserved.
CREATE TABLE IF NOT EXISTS Camara(id SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,creado_en timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS PerfilFacial(id SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,modelo text NOT NULL,descriptores jsonb NOT NULL,creado_en timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS EventoCamara(id bigserial PRIMARY KEY,camara_id integer NOT NULL REFERENCES Camara(id) ON DELETE CASCADE,categoria text NOT NULL CHECK(categoria IN ('resident','unknown','person','cat','dog')),confianza real NOT NULL CHECK(confianza BETWEEN 0 AND 1),perfil_id integer REFERENCES PerfilFacial(id) ON DELETE SET NULL,fecha timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS SesionCamara(id text PRIMARY KEY,token_hash text UNIQUE NOT NULL,camara_id integer NOT NULL REFERENCES Camara(id) ON DELETE CASCADE,usuario_id integer NOT NULL REFERENCES Usuario(id) ON DELETE CASCADE,tipo text NOT NULL,ruta text NOT NULL,expira_en timestamptz NOT NULL,media_id text);
ALTER TABLE Camara ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
ALTER TABLE PerfilFacial ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
ALTER TABLE SesionCamara ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
ALTER TABLE SesionCamara ADD COLUMN IF NOT EXISTS auth_session_id uuid REFERENCES hg_sessions(id) ON DELETE CASCADE;
ALTER TABLE SesionCamara DROP CONSTRAINT IF EXISTS sesioncamara_tipo_check;
ALTER TABLE SesionCamara ADD CONSTRAINT sesioncamara_tipo_check CHECK(tipo IN ('publish','process','view'));
CREATE UNIQUE INDEX IF NOT EXISTS sesioncamara_publish ON SesionCamara(tipo) WHERE tipo='publish';
CREATE UNIQUE INDEX IF NOT EXISTS sesioncamara_process ON SesionCamara(tipo) WHERE tipo='process';
CREATE UNIQUE INDEX IF NOT EXISTS sesioncamara_view ON SesionCamara(tipo) WHERE tipo='view';
CREATE INDEX IF NOT EXISTS idx_eventocamara_fecha ON EventoCamara(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_eventocamara_dedupe ON EventoCamara(camara_id,categoria,fecha DESC);
-- The camera branch used Node's default scrypt with this legacy serialization.
-- Converting its prefix preserves passwords, instead of hashing the hash as plaintext.
UPDATE Usuario SET password_hash='$scrypt$16384$'||split_part(password_hash,'$',2)||'$'||split_part(password_hash,'$',3)
 WHERE password_hash ~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$';
INSERT INTO hg_memberships(household_id,user_id,role)
 SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ru.usuario_id,'ADMINISTRADOR' FROM RolUsuario ru JOIN Rol r ON r.id=ru.rol_id WHERE r.nombre='ADMIN'
 ON CONFLICT(household_id,user_id) DO UPDATE SET role='ADMINISTRADOR';
