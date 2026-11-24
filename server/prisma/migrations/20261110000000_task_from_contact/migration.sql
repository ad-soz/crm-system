-- A task may now say which Contact (touchpoint such as an email or call) it came from.
--
-- This only adds an empty, optional link to the tasks table, so every existing task
-- is kept exactly as it is (it simply has no originating Contact). One Contact can
-- have many tasks. If the Contact is deleted its tasks stay and the link is cleared.
-- The rule that a task must agree with its Contact is a database trigger created by
-- the server at start-up (see server/src/reference-data/guards.ts).

ALTER TABLE "tasks" ADD COLUMN "contact_id" TEXT REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tasks_contact_id_idx" ON "tasks"("contact_id");
