-- Audit log: a permanent record of who changed what, and when.
--
-- This only adds two new, empty tables and one setting. No existing data is touched.
-- The triggers that fill audit_log are created by the server at start-up from the
-- current tables and columns (see server/src/audit/audit-triggers.ts), so a new field
-- is covered automatically. Rows are never edited or deleted (database rule).

CREATE TABLE "audit_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "at" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "record_id" TEXT,
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT
);

CREATE TABLE "audit_actor" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "set_at" TEXT NOT NULL
);

CREATE INDEX "audit_log_entity_record_id_idx" ON "audit_log"("entity", "record_id");

CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- When auditing began, so the screen can say what the history does and does not cover.
INSERT OR IGNORE INTO "app_settings" ("key", "value", "updatedAt")
VALUES ('audit_since', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
