CREATE TABLE hg_households(id uuid PRIMARY KEY, name text NOT NULL, timezone text NOT NULL DEFAULT 'America/La_Paz', demo_mode boolean NOT NULL DEFAULT true);
INSERT INTO hg_households(id,name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Mi hogar');
CREATE TABLE hg_memberships(household_id uuid NOT NULL REFERENCES hg_households(id), user_id integer NOT NULL REFERENCES Usuario(id), role text NOT NULL CHECK(role IN ('ADMINISTRADOR','RESIDENTE','INVITADO')), PRIMARY KEY(household_id,user_id));
INSERT INTO hg_memberships SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',u.id,COALESCE(MAX(CASE WHEN r.nombre='ADMINISTRADOR' THEN 'ADMINISTRADOR' WHEN r.nombre='RESIDENTE' THEN 'RESIDENTE' ELSE 'INVITADO' END),'INVITADO') FROM Usuario u LEFT JOIN RolUsuario ru ON ru.usuario_id=u.id LEFT JOIN Rol r ON r.id=ru.rol_id GROUP BY u.id;
-- Prefer administrator if legacy users have more than one role.
UPDATE hg_memberships m SET role='ADMINISTRADOR' WHERE EXISTS(SELECT 1 FROM RolUsuario ru JOIN Rol r ON r.id=ru.rol_id WHERE ru.usuario_id=m.user_id AND r.nombre='ADMINISTRADOR');
CREATE TABLE hg_sessions(id uuid PRIMARY KEY, user_id integer NOT NULL, household_id uuid NOT NULL,token_hash text UNIQUE NOT NULL,csrf_token text NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(household_id,user_id) REFERENCES hg_memberships(household_id,user_id));
CREATE INDEX hg_sessions_expiry ON hg_sessions(expires_at);
CREATE TABLE hg_login_attempts(key text NOT NULL,attempted_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX hg_login_attempts_key ON hg_login_attempts(key,attempted_at);
CREATE TABLE hg_modes(household_id uuid PRIMARY KEY REFERENCES hg_households(id), mode text NOT NULL DEFAULT 'AWAY' CHECK(mode IN ('HOME','AWAY','DISARMED')), revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO hg_modes(household_id,mode) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',COALESCE((SELECT modo_actual FROM ModoHogar WHERE activo ORDER BY fecha_activacion DESC LIMIT 1),'AWAY'));
