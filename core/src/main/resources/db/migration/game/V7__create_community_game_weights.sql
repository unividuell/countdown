-- How often a community wants each game (#37). Only deviations from NORMAL have a row, so a game
-- added later is normal everywhere without a backfill.
CREATE TABLE game.community_game_weights (
    id            UUID        PRIMARY KEY DEFAULT uuidv7(),
    -- Cross-schema FK: `game` depends on `community` in code, so Modulith migrates community first.
    community_id  UUID        NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE,
    game_type     TEXT        NOT NULL,
    -- OFF, RARE or OFTEN.
    weight        TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (community_id, game_type)
);
