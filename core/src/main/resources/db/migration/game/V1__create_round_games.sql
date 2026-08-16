CREATE SCHEMA IF NOT EXISTS game;

CREATE TABLE game.round_games (
    id            UUID         PRIMARY KEY DEFAULT uuidv7(),
    edition_id    UUID         NOT NULL REFERENCES community.editions(id) ON DELETE CASCADE,
    round_number  INT          NOT NULL,
    game_type     TEXT         NOT NULL,
    -- The frozen draw, opaque to the framework and CONTAINING THE SOLUTION. jsonb so the database
    -- rejects a malformed blob at the insert; mapped via a JsonNode converter, see
    -- JdbcConversionsConfiguration.
    params        JSONB        NOT NULL,
    -- Rule and stake are derived from the phase at announce time and frozen with the round, so
    -- moving phase_two_start_round later changes coming rounds and no past one.
    award_rule    TEXT         NOT NULL,
    award_points  INT          NOT NULL,
    announced_at  TIMESTAMPTZ  NOT NULL,
    UNIQUE (edition_id, round_number)
);

CREATE INDEX idx_round_games_edition ON game.round_games (edition_id);
