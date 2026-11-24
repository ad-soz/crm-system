-- History of deal stage moves: a required comment, who made the move, and when.
-- Existing deals start with no history; it begins with the first move after this.
CREATE TABLE "deal_stage_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deal_id" TEXT NOT NULL,
    "from_stage_id" TEXT NOT NULL,
    "to_stage_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deal_stage_changes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "deal_stage_changes_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "deal_stages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "deal_stage_changes_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "deal_stages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "deal_stage_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "deal_stage_changes_deal_id_created_at_idx" ON "deal_stage_changes"("deal_id", "created_at");

-- The rules that make this record trustworthy (a stage move needs a comment, history
-- cannot be edited or deleted) are database triggers. The server creates them at
-- start-up (see src/reference-data/guards.ts), like the other database rules.
