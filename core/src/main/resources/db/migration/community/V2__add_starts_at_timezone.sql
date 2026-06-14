ALTER TABLE community.communities
    ADD COLUMN starts_at_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin';
