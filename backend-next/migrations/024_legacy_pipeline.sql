CREATE TABLE hg_iot_inbox(message_id uuid PRIMARY KEY,household_id uuid NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hg_legacy_event_map(event_id uuid PRIMARY KEY REFERENCES hg_events(id),legacy_alert_id bigint UNIQUE NOT NULL REFERENCES AlertaCorrelacionada(id));
ALTER TABLE TelemetriaSensor ADD COLUMN source text NOT NULL DEFAULT 'LEGACY_UNVERIFIED';
ALTER TABLE ConsumoElectrico ADD COLUMN source text NOT NULL DEFAULT 'LEGACY_UNVERIFIED';
CREATE TABLE hg_iot_cooldowns(household_id uuid NOT NULL,device_id text NOT NULL,event_type text NOT NULL,until_at timestamptz NOT NULL,PRIMARY KEY(household_id,device_id,event_type));
