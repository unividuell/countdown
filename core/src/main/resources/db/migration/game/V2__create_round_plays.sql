CREATE TABLE game.round_plays (
    id             UUID              PRIMARY KEY DEFAULT uuidv7(),
    round_game_id  UUID              NOT NULL REFERENCES game.round_games(id) ON DELETE CASCADE,
    -- Cross-schema FK, allowed because `game` depends on `iam` in code (AuthenticatedUser at the
    -- controller), so Modulith migrates iam first. See modules-and-migrations.md.
    user_id        UUID              NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    -- The clock, set on the first reveal and never reset: a second reveal only bumps the counter.
    revealed_at    TIMESTAMPTZ       NOT NULL,
    -- A signal, not a lockout: repeated reveals are counted and logged, not punished.
    reveal_count   INT               NOT NULL DEFAULT 1,
    -- NULL = not guessed yet. The server stamps guessed_at, never the client.
    guess          JSONB             NULL,
    guessed_at     TIMESTAMPTZ       NULL,
    -- The game's verdict: eligible for points at all, and how far off. Both stay server-side; what
    -- the player is told is `outcome`, in the game's own words.
    qualifies      BOOLEAN           NULL,
    deviation      DOUBLE PRECISION  NULL,
    outcome        JSONB             NULL,
    -- A cache over the round's frozen award rule and every verdict of the round, not a verdict:
    -- NULL = has not guessed, 0 = guessed and came away empty.
    points         INT               NULL,
    -- This index IS the rule "one guess per player and round" — there is no check in a service.
    UNIQUE (round_game_id, user_id)
);

CREATE INDEX idx_round_plays_user ON game.round_plays (user_id);
