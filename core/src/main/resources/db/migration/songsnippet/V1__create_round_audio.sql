CREATE SCHEMA IF NOT EXISTS songsnippet;

CREATE TABLE songsnippet.round_audio (
    id            UUID  PRIMARY KEY DEFAULT uuidv7(),
    -- Soft reference into game.round_games — deliberately NO foreign key: the code arrow points
    -- game -> songsnippet (the adapter lives in game.internal), so Modulith migrates this schema
    -- BEFORE game's, and a cross-schema FK against the code arrow cannot be created on a fresh
    -- database. The plugin pattern: host code calls plugin, plugin data hangs off host data.
    -- Lifecycle is owned by releaseAssets (announce-time cleanup) instead.
    round_game_id UUID  NOT NULL,
    stage         INT   NOT NULL,
    media_type    TEXT  NOT NULL,
    bytes         BYTEA NOT NULL,
    UNIQUE (round_game_id, stage)
);
