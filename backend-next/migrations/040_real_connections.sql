ALTER TABLE Camara ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE Camara ADD COLUMN webcam_device_id text;
CREATE TABLE hg_connections(
 id uuid PRIMARY KEY,household_id uuid NOT NULL REFERENCES hg_households(id),
 name text NOT NULL,kind text NOT NULL CHECK(kind IN ('CAMERA','SENSOR','ACTUATOR','GATEWAY')),
 transport text NOT NULL CHECK(transport IN ('WEBCAM','MQTT','HTTP')),location text NOT NULL DEFAULT '',model text NOT NULL DEFAULT '',
 enabled boolean NOT NULL DEFAULT true,heartbeat_seconds integer NOT NULL DEFAULT 15 CHECK(heartbeat_seconds BETWEEN 5 AND 3600),
 camera_id integer UNIQUE REFERENCES Camara(id),webcam_device_id text,
 credential_hash text,credential_generation integer NOT NULL DEFAULT 1,revision integer NOT NULL DEFAULT 1,
 last_seen timestamptz,last_sample_at timestamptz,window_started_at timestamptz,packet_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 UNIQUE(household_id,id),CHECK((kind='CAMERA' AND transport='WEBCAM') OR (kind<>'CAMERA' AND transport IN ('MQTT','HTTP')))
);
CREATE TABLE hg_connection_channels(
 id uuid PRIMARY KEY,household_id uuid NOT NULL,connection_id uuid NOT NULL,key text NOT NULL,name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('SENSOR','ACTUATOR')),type text NOT NULL,unit text NOT NULL DEFAULT '',
 last_value jsonb,last_observed_at timestamptz,last_received_at timestamptz,deleted_at timestamptz,
 FOREIGN KEY(household_id,connection_id) REFERENCES hg_connections(household_id,id),UNIQUE(connection_id,key)
);
CREATE TABLE hg_connection_messages(connection_id uuid NOT NULL REFERENCES hg_connections(id),message_id uuid NOT NULL,body_hash text NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(connection_id,message_id));
CREATE TABLE hg_connection_samples(id bigserial PRIMARY KEY,household_id uuid NOT NULL,connection_id uuid NOT NULL,channel_id uuid NOT NULL REFERENCES hg_connection_channels(id),message_id uuid NOT NULL,value jsonb NOT NULL,observed_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),late boolean NOT NULL DEFAULT false,source text NOT NULL DEFAULT 'LIVE' CHECK(source='LIVE'),FOREIGN KEY(household_id,connection_id) REFERENCES hg_connections(household_id,id));
CREATE INDEX hg_connection_samples_recent ON hg_connection_samples(connection_id,received_at DESC);
CREATE TABLE hg_device_commands(
 id uuid PRIMARY KEY,household_id uuid NOT NULL,connection_id uuid NOT NULL,channel_id uuid NOT NULL REFERENCES hg_connection_channels(id),
 requested_state text NOT NULL CHECK(requested_state IN ('ON','OFF')),reported_state text CHECK(reported_state IN ('ON','OFF')),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENT','ACKNOWLEDGED','FAILED','EXPIRED','CANCELLED','UNKNOWN')),
 credential_generation integer NOT NULL,requested_by integer NOT NULL REFERENCES Usuario(id),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '15 seconds',sent_at timestamptz,ack_at timestamptz,
 error_code text,FOREIGN KEY(household_id,connection_id) REFERENCES hg_connections(household_id,id)
);
CREATE INDEX hg_device_commands_due ON hg_device_commands(connection_id,status,expires_at);
INSERT INTO hg_connections(id,household_id,name,kind,transport,camera_id,webcam_device_id,enabled)
 SELECT gen_random_uuid(),household_id,nombre,'CAMERA','WEBCAM',id,webcam_device_id,enabled FROM Camara;
