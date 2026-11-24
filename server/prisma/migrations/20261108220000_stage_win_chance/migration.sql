-- Each deal stage gets a win chance (0 to 100), used for the weighted forecast.
ALTER TABLE deal_stages ADD COLUMN win_chance INTEGER NOT NULL DEFAULT 0;

UPDATE deal_stages SET win_chance = 10  WHERE id = 'stage-lead';
UPDATE deal_stages SET win_chance = 25  WHERE id = 'stage-qualified';
UPDATE deal_stages SET win_chance = 50  WHERE id = 'stage-proposal';
UPDATE deal_stages SET win_chance = 75  WHERE id = 'stage-negotiation';
UPDATE deal_stages SET win_chance = 100 WHERE id = 'stage-won';
UPDATE deal_stages SET win_chance = 0   WHERE id = 'stage-lost';

-- The 0 to 100 rule is a database rule like the others; the server creates it
-- at start-up (see src/reference-data/guards.ts).
