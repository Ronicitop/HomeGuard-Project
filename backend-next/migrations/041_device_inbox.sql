-- The broker commits this inbox before MQTT PUBACK. Application work can resume after a worker restart.
CREATE TABLE hg_device_inbox(
 id bigserial PRIMARY KEY,
 household_id uuid NOT NULL,connection_id uuid NOT NULL,
 credential_generation integer NOT NULL,message_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('telemetry','ack')),body jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,error_code text,
 FOREIGN KEY(household_id,connection_id) REFERENCES hg_connections(household_id,id),
 UNIQUE(connection_id,message_id)
);
CREATE INDEX hg_device_inbox_pending ON hg_device_inbox(next_attempt_at,id) WHERE processed_at IS NULL;
