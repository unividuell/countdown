-- Peer review: the other players' judgement of one tip, and the game master's own.
CREATE TABLE game.round_play_votes (
    id             UUID        PRIMARY KEY DEFAULT uuidv7(),
    round_play_id  UUID        NOT NULL REFERENCES game.round_plays(id) ON DELETE CASCADE,
    -- Cross-schema FK, as in round_plays: `game` depends on `iam` in code, so Modulith migrates
    -- iam first. See modules-and-migrations.md.
    voter_user_id  UUID        NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    -- CONFIRM or FLAG. One ballot with two sides, so nobody can hold both at once.
    value          TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    -- One ballot per voter and tip: changing your mind is an UPDATE, not a second row.
    UNIQUE (round_play_id, voter_user_id)
);

CREATE INDEX idx_round_play_votes_play ON game.round_play_votes (round_play_id);

-- The game master's verdict, and only theirs: NULL lets the vote decide, true keeps the tip
-- whatever the flags say, false strikes it whatever the confirmations say. A stored input, never
-- a hand-written score — the re-evaluation stays a pure function.
ALTER TABLE game.round_plays
    ADD COLUMN admin_override BOOLEAN NULL;
