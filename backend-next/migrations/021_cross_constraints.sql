-- requires-table: hg_cameras
-- requires-table: hg_rule_versions
ALTER TABLE hg_events ADD CONSTRAINT hg_event_camera_home FOREIGN KEY(household_id,camera_id) REFERENCES hg_cameras(household_id,id);
ALTER TABLE hg_events ADD CONSTRAINT hg_event_rule_version_home FOREIGN KEY(household_id,rule_version_id) REFERENCES hg_rule_versions(household_id,id);
