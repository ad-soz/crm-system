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
