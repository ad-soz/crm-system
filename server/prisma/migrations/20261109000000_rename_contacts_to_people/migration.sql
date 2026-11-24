-- Rename step 1 of 2: what was called a Contact (a person you deal with) is now a Person.
--
-- Nothing is copied or recreated: tables and columns are renamed in place, so every
-- row, id and link survives exactly as it was. SQLite updates the foreign keys that
-- point at a renamed table by itself.
--
-- Step 2 (Activity -> Contact) is a separate, later migration, so the word "contact"
-- never means two things at once.

ALTER TABLE "contacts" RENAME TO "people";

ALTER TABLE "deals" RENAME COLUMN "contact_id" TO "person_id";
ALTER TABLE "activities" RENAME COLUMN "contact_id" TO "person_id";
ALTER TABLE "tasks" RENAME COLUMN "contact_id" TO "person_id";

-- Role profiles keep their permissions as text such as ["contacts.view", ...].
-- The keys are renamed too, or every profile would lose its access to people.
UPDATE "role_profiles"
SET "permissions" = replace("permissions", '"contacts.', '"people.')
WHERE "permissions" LIKE '%"contacts.%';
