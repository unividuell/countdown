CREATE SCHEMA IF NOT EXISTS deduster;

CREATE TABLE deduster.round_images (
    -- Soft reference into game.round_games, deliberately no foreign key — the same reason as
    -- songsnippet.round_audio: the code arrow points game -> deduster, so this schema migrates
    -- first, and a cross-schema FK against that arrow cannot be created on a fresh database.
    round_game_id UUID        PRIMARY KEY,
    media_type    TEXT        NOT NULL,
    bytes         BYTEA       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
