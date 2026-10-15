CREATE SCHEMA IF NOT EXISTS placepatch;

CREATE TABLE placepatch.round_images (
    -- Soft reference into game.round_games, deliberately no foreign key — the same reason as
    -- deduster.round_images: the code arrow points game -> placepatch, so this schema migrates
    -- first, and a cross-schema FK against that arrow cannot be created on a fresh database.
    round_game_id UUID        PRIMARY KEY,
    media_type    TEXT        NOT NULL,
    bytes         BYTEA       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
