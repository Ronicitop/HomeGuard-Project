ALTER TABLE DispositivoESP32 ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
ALTER TABLE ModoHogar ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
ALTER TABLE ConfiguracionUmbral ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
ALTER TABLE AlertaCorrelacionada ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
ALTER TABLE Actuador ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
ALTER TABLE DispositivoUbicacion2D ADD COLUMN IF NOT EXISTS household_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES hg_households(id);
