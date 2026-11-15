ALTER TABLE hg_memberships ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE hg_memberships ADD COLUMN revision integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX usuario_email_lower_unique ON Usuario(lower(email));
ALTER TABLE hg_notifications ADD COLUMN channel text NOT NULL DEFAULT 'EVENT' CHECK(channel IN ('EVENT','EMERGENCY_CHALLENGE'));
ALTER TABLE hg_notifications DROP CONSTRAINT hg_notifications_event_id_installation_id_key;
ALTER TABLE hg_notifications ADD UNIQUE(event_id,installation_id,channel);
