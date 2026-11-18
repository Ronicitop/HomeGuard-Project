ALTER TABLE hg_push_devices ADD COLUMN provider text NOT NULL DEFAULT 'EXPO' CHECK (provider IN ('EXPO','FCM'));
-- Store the provider on the attempt: an installation can change provider later.
ALTER TABLE hg_notifications ADD COLUMN provider text NOT NULL DEFAULT 'EXPO' CHECK (provider IN ('EXPO','FCM'));
