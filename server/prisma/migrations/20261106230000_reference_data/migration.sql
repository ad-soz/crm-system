-- Reference data: fixed lists for industries, deal stages, activity types, task
-- statuses and task priorities. Existing data is carried over:
--   * companies.industry text -> industries list + company_industries links
--   * deals.stage / activities.type / tasks.status / tasks.priority text codes
--     -> links to the matching list value (same names as before)

-- CreateTable
CREATE TABLE "industries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'secondary',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "company_industries" (
    "company_id" TEXT NOT NULL,
    "industry_id" TEXT NOT NULL,

    PRIMARY KEY ("company_id", "industry_id"),
    CONSTRAINT "company_industries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_industries_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deal_stages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'secondary',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT NOT NULL DEFAULT 'OPEN'
);

-- CreateTable
CREATE TABLE "activity_types" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'secondary',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT NOT NULL DEFAULT 'file-text'
);

-- CreateTable
CREATE TABLE "task_statuses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'secondary',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_done" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "task_priorities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'secondary',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "reference_field_settings" (
    "field_key" TEXT NOT NULL PRIMARY KEY,
    "allow_multiple" BOOLEAN NOT NULL DEFAULT false
);

-- Starting values (the same names the app used before)
INSERT INTO "deal_stages" ("id", "name", "colour", "sort_order", "is_active", "is_default", "outcome") VALUES
  ('stage-lead', 'Lead', 'secondary', 0, true, true, 'OPEN'),
  ('stage-qualified', 'Qualified', 'info', 1, true, false, 'OPEN'),
  ('stage-proposal', 'Proposal', 'warning', 2, true, false, 'OPEN'),
  ('stage-negotiation', 'Negotiation', 'warning', 3, true, false, 'OPEN'),
  ('stage-won', 'Won', 'success', 4, true, false, 'WON'),
  ('stage-lost', 'Lost', 'destructive', 5, true, false, 'LOST');

INSERT INTO "activity_types" ("id", "name", "colour", "sort_order", "is_active", "is_default", "icon") VALUES
  ('type-email', 'Email', 'info', 0, true, false, 'mail'),
  ('type-call', 'Call', 'success', 1, true, true, 'phone'),
  ('type-meeting', 'Meeting', 'default', 2, true, false, 'users'),
  ('type-note', 'Note', 'warning', 3, true, false, 'file-text');

INSERT INTO "task_statuses" ("id", "name", "colour", "sort_order", "is_active", "is_default", "is_done") VALUES
  ('status-todo', 'To Do', 'secondary', 0, true, true, false),
  ('status-in-progress', 'In Progress', 'warning', 1, true, false, false),
  ('status-done', 'Done', 'success', 2, true, false, true);

INSERT INTO "task_priorities" ("id", "name", "colour", "sort_order", "is_active", "is_default") VALUES
  ('priority-low', 'Low', 'secondary', 0, true, false),
  ('priority-medium', 'Medium', 'info', 1, true, true),
  ('priority-high', 'High', 'destructive', 2, true, false);

-- Several industries per company are allowed to begin with; this is a switch in Settings.
INSERT INTO "reference_field_settings" ("field_key", "allow_multiple") VALUES ('company.industry', true);

-- Industries: one list value per distinct industry already typed in (ignoring case and spacing)
INSERT INTO "industries" ("id", "name", "colour", "sort_order", "is_active")
SELECT lower(hex(randomblob(16))), name, 'secondary', ROW_NUMBER() OVER (ORDER BY lower(name)) - 1, true
FROM (
  SELECT MIN(TRIM("industry")) AS name
  FROM "companies"
  WHERE "industry" IS NOT NULL AND TRIM("industry") <> ''
  GROUP BY lower(TRIM("industry"))
);

INSERT INTO "company_industries" ("company_id", "industry_id")
SELECT c."id", i."id"
FROM "companies" c
JOIN "industries" i ON lower(i."name") = lower(TRIM(c."industry"))
WHERE c."industry" IS NOT NULL AND TRIM(c."industry") <> '';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "user_id" TEXT,
    CONSTRAINT "activities_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "activity_types" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "activities_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_activities" ("contact_id", "createdAt", "deal_id", "description", "id", "subject", "type_id", "user_id")
SELECT "contact_id", "createdAt", "deal_id", "description", "id", "subject",
  CASE "type" WHEN 'EMAIL' THEN 'type-email' WHEN 'MEETING' THEN 'type-meeting' WHEN 'NOTE' THEN 'type-note' ELSE 'type-call' END,
  "user_id"
FROM "activities";
DROP TABLE "activities";
ALTER TABLE "new_activities" RENAME TO "activities";
CREATE TABLE "new_companies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_companies" ("address", "createdAt", "email", "id", "name", "phone", "updatedAt", "website") SELECT "address", "createdAt", "email", "id", "name", "phone", "updatedAt", "website" FROM "companies";
DROP TABLE "companies";
ALTER TABLE "new_companies" RENAME TO "companies";
CREATE TABLE "new_deals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "stage_id" TEXT NOT NULL,
    "expectedCloseDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "company_id" TEXT,
    "contact_id" TEXT,
    "owner_id" TEXT,
    CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "deal_stages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "deals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_deals" ("amount", "company_id", "contact_id", "createdAt", "expectedCloseDate", "id", "owner_id", "stage_id", "title", "updatedAt")
SELECT "amount", "company_id", "contact_id", "createdAt", "expectedCloseDate", "id", "owner_id",
  CASE "stage" WHEN 'QUALIFIED' THEN 'stage-qualified' WHEN 'PROPOSAL' THEN 'stage-proposal' WHEN 'NEGOTIATION' THEN 'stage-negotiation' WHEN 'WON' THEN 'stage-won' WHEN 'LOST' THEN 'stage-lost' ELSE 'stage-lead' END,
  "title", "updatedAt"
FROM "deals";
DROP TABLE "deals";
ALTER TABLE "new_deals" RENAME TO "deals";
CREATE TABLE "new_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATETIME,
    "status_id" TEXT NOT NULL,
    "priority_id" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "assignee_id" TEXT,
    CONSTRAINT "tasks_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "task_statuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tasks_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "task_priorities" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tasks" ("assignee_id", "contact_id", "createdAt", "deal_id", "description", "dueDate", "id", "priority_id", "status_id", "title", "updatedAt")
SELECT "assignee_id", "contact_id", "createdAt", "deal_id", "description", "dueDate", "id",
  CASE "priority" WHEN 'LOW' THEN 'priority-low' WHEN 'HIGH' THEN 'priority-high' ELSE 'priority-medium' END,
  CASE "status" WHEN 'IN_PROGRESS' THEN 'status-in-progress' WHEN 'DONE' THEN 'status-done' ELSE 'status-todo' END,
  "title", "updatedAt"
FROM "tasks";
DROP TABLE "tasks";
ALTER TABLE "new_tasks" RENAME TO "tasks";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Database rules for reference data (see src/reference-data/guards.ts)
CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_industries_name ON industries (lower(name));

CREATE TRIGGER IF NOT EXISTS crm_industries_name_ins BEFORE INSERT ON industries
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_industries_name_upd BEFORE UPDATE OF name ON industries
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_company_industries_industry_id_active_ins BEFORE INSERT ON company_industries
WHEN (SELECT is_active FROM industries WHERE id = NEW.industry_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That industry has been retired and cannot be chosen'); END;

CREATE TRIGGER IF NOT EXISTS crm_company_industries_industry_id_active_upd BEFORE UPDATE OF industry_id ON company_industries
WHEN NEW.industry_id <> OLD.industry_id AND (SELECT is_active FROM industries WHERE id = NEW.industry_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That industry has been retired and cannot be chosen'); END;

CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_deal_stages_name ON deal_stages (lower(name));

CREATE TRIGGER IF NOT EXISTS crm_deal_stages_name_ins BEFORE INSERT ON deal_stages
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_deal_stages_name_upd BEFORE UPDATE OF name ON deal_stages
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_deals_stage_id_active_ins BEFORE INSERT ON deals
WHEN (SELECT is_active FROM deal_stages WHERE id = NEW.stage_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That deal stage has been retired and cannot be chosen'); END;

CREATE TRIGGER IF NOT EXISTS crm_deals_stage_id_active_upd BEFORE UPDATE OF stage_id ON deals
WHEN NEW.stage_id <> OLD.stage_id AND (SELECT is_active FROM deal_stages WHERE id = NEW.stage_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That deal stage has been retired and cannot be chosen'); END;

CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_deal_stages_one_default ON deal_stages (is_default) WHERE is_default = 1;

CREATE TRIGGER IF NOT EXISTS crm_deal_stages_default_active_ins BEFORE INSERT ON deal_stages
WHEN NEW.is_default = 1 AND NEW.is_active = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: The default deal stage must be active'); END;

CREATE TRIGGER IF NOT EXISTS crm_deal_stages_default_active_upd BEFORE UPDATE OF is_default, is_active ON deal_stages
WHEN NEW.is_default = 1 AND NEW.is_active = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: The default deal stage must be active'); END;

CREATE TRIGGER IF NOT EXISTS crm_deal_stages_keep_active_upd BEFORE UPDATE OF is_active ON deal_stages
WHEN OLD.is_active = 1 AND NEW.is_active = 0 AND (SELECT COUNT(*) FROM deal_stages WHERE is_active = 1 AND id <> NEW.id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: At least one deal stage must stay active'); END;

CREATE TRIGGER IF NOT EXISTS crm_deal_stages_keep_active_del BEFORE DELETE ON deal_stages
WHEN OLD.is_active = 1 AND (SELECT COUNT(*) FROM deal_stages WHERE is_active = 1 AND id <> OLD.id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: At least one deal stage must stay active'); END;

CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_activity_types_name ON activity_types (lower(name));

CREATE TRIGGER IF NOT EXISTS crm_activity_types_name_ins BEFORE INSERT ON activity_types
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_activity_types_name_upd BEFORE UPDATE OF name ON activity_types
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_activities_type_id_active_ins BEFORE INSERT ON activities
WHEN (SELECT is_active FROM activity_types WHERE id = NEW.type_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That activity type has been retired and cannot be chosen'); END;

CREATE TRIGGER IF NOT EXISTS crm_activities_type_id_active_upd BEFORE UPDATE OF type_id ON activities
WHEN NEW.type_id <> OLD.type_id AND (SELECT is_active FROM activity_types WHERE id = NEW.type_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That activity type has been retired and cannot be chosen'); END;

CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_activity_types_one_default ON activity_types (is_default) WHERE is_default = 1;

CREATE TRIGGER IF NOT EXISTS crm_activity_types_default_active_ins BEFORE INSERT ON activity_types
WHEN NEW.is_default = 1 AND NEW.is_active = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: The default activity type must be active'); END;

CREATE TRIGGER IF NOT EXISTS crm_activity_types_default_active_upd BEFORE UPDATE OF is_default, is_active ON activity_types
WHEN NEW.is_default = 1 AND NEW.is_active = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: The default activity type must be active'); END;

CREATE TRIGGER IF NOT EXISTS crm_activity_types_keep_active_upd BEFORE UPDATE OF is_active ON activity_types
WHEN OLD.is_active = 1 AND NEW.is_active = 0 AND (SELECT COUNT(*) FROM activity_types WHERE is_active = 1 AND id <> NEW.id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: At least one activity type must stay active'); END;

CREATE TRIGGER IF NOT EXISTS crm_activity_types_keep_active_del BEFORE DELETE ON activity_types
WHEN OLD.is_active = 1 AND (SELECT COUNT(*) FROM activity_types WHERE is_active = 1 AND id <> OLD.id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: At least one activity type must stay active'); END;

CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_task_statuses_name ON task_statuses (lower(name));

CREATE TRIGGER IF NOT EXISTS crm_task_statuses_name_ins BEFORE INSERT ON task_statuses
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_task_statuses_name_upd BEFORE UPDATE OF name ON task_statuses
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_tasks_status_id_active_ins BEFORE INSERT ON tasks
WHEN (SELECT is_active FROM task_statuses WHERE id = NEW.status_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That task status has been retired and cannot be chosen'); END;

CREATE TRIGGER IF NOT EXISTS crm_tasks_status_id_active_upd BEFORE UPDATE OF status_id ON tasks
WHEN NEW.status_id <> OLD.status_id AND (SELECT is_active FROM task_statuses WHERE id = NEW.status_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That task status has been retired and cannot be chosen'); END;

CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_task_statuses_one_default ON task_statuses (is_default) WHERE is_default = 1;

CREATE TRIGGER IF NOT EXISTS crm_task_statuses_default_active_ins BEFORE INSERT ON task_statuses
WHEN NEW.is_default = 1 AND NEW.is_active = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: The default task status must be active'); END;

CREATE TRIGGER IF NOT EXISTS crm_task_statuses_default_active_upd BEFORE UPDATE OF is_default, is_active ON task_statuses
WHEN NEW.is_default = 1 AND NEW.is_active = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: The default task status must be active'); END;

CREATE TRIGGER IF NOT EXISTS crm_task_statuses_keep_active_upd BEFORE UPDATE OF is_active ON task_statuses
WHEN OLD.is_active = 1 AND NEW.is_active = 0 AND (SELECT COUNT(*) FROM task_statuses WHERE is_active = 1 AND id <> NEW.id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: At least one task status must stay active'); END;

CREATE TRIGGER IF NOT EXISTS crm_task_statuses_keep_active_del BEFORE DELETE ON task_statuses
WHEN OLD.is_active = 1 AND (SELECT COUNT(*) FROM task_statuses WHERE is_active = 1 AND id <> OLD.id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: At least one task status must stay active'); END;

CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_task_priorities_name ON task_priorities (lower(name));

CREATE TRIGGER IF NOT EXISTS crm_task_priorities_name_ins BEFORE INSERT ON task_priorities
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_task_priorities_name_upd BEFORE UPDATE OF name ON task_priorities
WHEN length(trim(NEW.name)) = 0 OR length(NEW.name) > 60
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A name is required and must be 60 characters or fewer'); END;

CREATE TRIGGER IF NOT EXISTS crm_tasks_priority_id_active_ins BEFORE INSERT ON tasks
WHEN (SELECT is_active FROM task_priorities WHERE id = NEW.priority_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That task priority has been retired and cannot be chosen'); END;

CREATE TRIGGER IF NOT EXISTS crm_tasks_priority_id_active_upd BEFORE UPDATE OF priority_id ON tasks
WHEN NEW.priority_id <> OLD.priority_id AND (SELECT is_active FROM task_priorities WHERE id = NEW.priority_id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That task priority has been retired and cannot be chosen'); END;

CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_task_priorities_one_default ON task_priorities (is_default) WHERE is_default = 1;

CREATE TRIGGER IF NOT EXISTS crm_task_priorities_default_active_ins BEFORE INSERT ON task_priorities
WHEN NEW.is_default = 1 AND NEW.is_active = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: The default task priority must be active'); END;

CREATE TRIGGER IF NOT EXISTS crm_task_priorities_default_active_upd BEFORE UPDATE OF is_default, is_active ON task_priorities
WHEN NEW.is_default = 1 AND NEW.is_active = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: The default task priority must be active'); END;

CREATE TRIGGER IF NOT EXISTS crm_task_priorities_keep_active_upd BEFORE UPDATE OF is_active ON task_priorities
WHEN OLD.is_active = 1 AND NEW.is_active = 0 AND (SELECT COUNT(*) FROM task_priorities WHERE is_active = 1 AND id <> NEW.id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: At least one task priority must stay active'); END;

CREATE TRIGGER IF NOT EXISTS crm_task_priorities_keep_active_del BEFORE DELETE ON task_priorities
WHEN OLD.is_active = 1 AND (SELECT COUNT(*) FROM task_priorities WHERE is_active = 1 AND id <> OLD.id) = 0
BEGIN SELECT RAISE(ABORT, 'CRM_REF: At least one task priority must stay active'); END;

CREATE TRIGGER IF NOT EXISTS crm_deal_stages_outcome_ins BEFORE INSERT ON deal_stages
WHEN NEW.outcome NOT IN ('OPEN', 'WON', 'LOST')
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A stage outcome must be Open, Won or Lost'); END;

CREATE TRIGGER IF NOT EXISTS crm_deal_stages_outcome_upd BEFORE UPDATE OF outcome ON deal_stages
WHEN NEW.outcome NOT IN ('OPEN', 'WON', 'LOST')
BEGIN SELECT RAISE(ABORT, 'CRM_REF: A stage outcome must be Open, Won or Lost'); END;

CREATE TRIGGER IF NOT EXISTS crm_company_industries_cardinality BEFORE INSERT ON company_industries
WHEN (SELECT allow_multiple FROM reference_field_settings WHERE field_key = 'company.industry') = 0 AND EXISTS (SELECT 1 FROM company_industries WHERE company_id = NEW.company_id)
BEGIN SELECT RAISE(ABORT, 'CRM_REF: Only one industry is allowed per company. An administrator can allow several'); END;

CREATE TRIGGER IF NOT EXISTS crm_reference_field_settings_single_company_industries BEFORE UPDATE OF allow_multiple ON reference_field_settings
WHEN NEW.allow_multiple = 0 AND NEW.field_key = 'company.industry' AND EXISTS (SELECT 1 FROM company_industries GROUP BY company_id HAVING COUNT(*) > 1)
BEGIN SELECT RAISE(ABORT, 'CRM_REF: Some company records already have more than one industry. Reduce them to one before switching this off'); END;

CREATE TRIGGER IF NOT EXISTS crm_reference_field_settings_keys BEFORE INSERT ON reference_field_settings
WHEN NEW.field_key NOT IN ('company.industry')
BEGIN SELECT RAISE(ABORT, 'CRM_REF: That is not a field that can be configured'); END;

CREATE TRIGGER IF NOT EXISTS crm_reference_field_settings_keep BEFORE DELETE ON reference_field_settings
WHEN 1
BEGIN SELECT RAISE(ABORT, 'CRM_REF: Field settings cannot be deleted'); END;
