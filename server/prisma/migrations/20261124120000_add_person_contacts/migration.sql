-- CreateTable
CREATE TABLE "person_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "person_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'work',
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "person_contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people" ("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE INDEX "person_contacts_person_id_idx" ON "person_contacts"("person_id");

-- Migrate existing email and phone data
INSERT INTO "person_contacts" (id, person_id, type, value, "createdAt", "updatedAt")
SELECT
  'email_' || lower(hex(randomblob(8))) || '_' || lower(hex(randomblob(4))),
  id,
  'email',
  email,
  createdAt,
  updatedAt
FROM people
WHERE email IS NOT NULL;

INSERT INTO "person_contacts" (id, person_id, type, value, "createdAt", "updatedAt")
SELECT
  'phone_' || lower(hex(randomblob(8))) || '_' || lower(hex(randomblob(4))),
  id,
  'phone',
  phone,
  createdAt,
  updatedAt
FROM people
WHERE phone IS NOT NULL;

-- DropColumn
PRAGMA foreign_keys=OFF;
CREATE TABLE "people_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "company_id" TEXT,
    "owner_id" TEXT,
    CONSTRAINT "people_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE SET NULL,
    CONSTRAINT "people_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE SET NULL
);
INSERT INTO "people_new" SELECT "id", "firstName", "lastName", "title", "createdAt", "updatedAt", "company_id", "owner_id" FROM "people";
DROP TABLE "people";
ALTER TABLE "people_new" RENAME TO "people";
CREATE INDEX "people_company_id_idx" ON "people"("company_id");
CREATE INDEX "people_owner_id_idx" ON "people"("owner_id");
PRAGMA foreign_keys=ON;
