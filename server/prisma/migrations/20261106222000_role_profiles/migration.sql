-- Role profiles replace the fixed ADMIN / SALES_REP roles.
-- Existing users keep exactly the access they had:
--   ADMIN     -> Administrator (built in, locked, always every permission)
--   SALES_REP -> Sales Rep (editable)

-- CreateTable
CREATE TABLE "role_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "role_profiles_name_key" ON "role_profiles"("name");

-- Built-in profiles
INSERT INTO "role_profiles" ("id", "name", "description", "permissions", "is_system", "updatedAt") VALUES
  ('administrator', 'Administrator', 'Full access to everything, including users and settings. Cannot be changed.',
   '["contacts.view","contacts.create","contacts.edit","contacts.delete","companies.view","companies.create","companies.edit","companies.delete","deals.view","deals.create","deals.edit","deals.delete","activities.view","activities.create","activities.edit","activities.delete","tasks.view","tasks.create","tasks.edit","tasks.delete","users.manage","profiles.manage","appearance.manage","data.import","data.export","datamodel.view","datamodel.edit"]',
   true, CURRENT_TIMESTAMP),
  ('sales-rep', 'Sales Rep', 'Works with contacts, companies, deals, activities, and tasks.',
   '["contacts.view","contacts.create","contacts.edit","contacts.delete","companies.view","companies.create","companies.edit","companies.delete","deals.view","deals.create","deals.edit","deals.delete","activities.view","activities.create","activities.edit","activities.delete","tasks.view","tasks.create","tasks.edit","tasks.delete","data.import","data.export","datamodel.view"]',
   false, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role_profile_id" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" DATETIME,
    "theme_prefs" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "users_role_profile_id_fkey" FOREIGN KEY ("role_profile_id") REFERENCES "role_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_users" ("createdAt", "email", "firstName", "id", "lastName", "must_change_password", "passwordHash", "password_changed_at", "theme_prefs", "updatedAt", "role_profile_id")
SELECT "createdAt", "email", "firstName", "id", "lastName", "must_change_password", "passwordHash", "password_changed_at", "theme_prefs", "updatedAt",
       CASE WHEN "role" = 'ADMIN' THEN 'administrator' ELSE 'sales-rep' END
FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
