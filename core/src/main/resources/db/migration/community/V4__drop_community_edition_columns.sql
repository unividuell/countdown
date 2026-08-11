-- The schedule now lives on community.editions (V3). Contract half of expand/contract:
-- everything reads and writes the edition, so these three columns are unreferenced.
ALTER TABLE community.communities
    DROP COLUMN starts_at,
    DROP COLUMN starts_at_timezone,
    DROP COLUMN phase_two_start_round;
