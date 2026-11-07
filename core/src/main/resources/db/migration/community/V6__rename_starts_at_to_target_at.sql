-- The countdown runs towards this instant; the game starts earlier (gamesFromRound).
ALTER TABLE community.editions RENAME COLUMN starts_at TO target_at;
ALTER TABLE community.editions RENAME COLUMN starts_at_timezone TO target_timezone;
