-- The final table of an archived run, set exactly when it is archived: rank, name, short name,
-- colour and points per player. No user_id on purpose: deleting an account must neither change the
-- archive nor be blocked by it. The run's game data is deleted at the same moment.
ALTER TABLE community.editions
    ADD COLUMN final_standings JSONB NULL;
