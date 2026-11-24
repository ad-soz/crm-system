-- Rename step 2 of 2: what was called an Activity (a call, email, meeting or note with a
-- person) is now a Contact. This runs after the migration that renamed the old Contact to
-- Person, so the table name "contacts" is free.
--
-- Tables and columns are renamed in place: every row, id and link survives untouched.

-- The database rules (triggers and indexes) named after the old tables are removed first.
-- The server creates the same rules under the new names at start-up (src/reference-data/guards.ts),
-- and refuses to run without them. Leaving the old ones would duplicate every rule.
DROP INDEX IF EXISTS "crm_ux_activity_types_name";
DROP INDEX IF EXISTS "crm_ux_activity_types_one_default";
DROP TRIGGER IF EXISTS "crm_activity_types_name_ins";
DROP TRIGGER IF EXISTS "crm_activity_types_name_upd";
DROP TRIGGER IF EXISTS "crm_activities_type_id_active_ins";
DROP TRIGGER IF EXISTS "crm_activities_type_id_active_upd";
DROP TRIGGER IF EXISTS "crm_activity_types_default_active_ins";
DROP TRIGGER IF EXISTS "crm_activity_types_default_active_upd";
DROP TRIGGER IF EXISTS "crm_activity_types_keep_active_upd";
DROP TRIGGER IF EXISTS "crm_activity_types_keep_active_del";

ALTER TABLE "activities" RENAME TO "contacts";
ALTER TABLE "activity_types" RENAME TO "contact_types";

-- Role profiles keep their permissions as text such as ["activities.view", ...].
-- Renaming the keys keeps every profile's access exactly as it was.
UPDATE "role_profiles"
SET "permissions" = replace("permissions", '"activities.', '"contacts.')
WHERE "permissions" LIKE '%"activities.%';
