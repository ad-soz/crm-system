-- Remember when stage-move history began, so reports can say what they do and do not know.
--
-- Before this moment the CRM did not record stage moves, so for an older deal it
-- cannot know when it was won, lost or moved. Reports use this timestamp to tell
-- "no moves yet" (certain) apart from "may have moved before history began" (unknown).
--
-- It is taken from when the stage-history migration was applied. Prisma stores that
-- time as whole milliseconds since 1970 (an integer), so it is converted from that.
-- If it cannot be read for any reason, the time now is used. INSERT OR IGNORE keeps
-- the first value for good.
INSERT OR IGNORE INTO "app_settings" ("key", "value", "updatedAt")
SELECT
    'stage_history_since',
    COALESCE(
        (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', "finished_at" / 1000.0, 'unixepoch')
           FROM "_prisma_migrations"
          WHERE "migration_name" = '20261108230000_deal_stage_changes'
            AND "finished_at" IS NOT NULL),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
