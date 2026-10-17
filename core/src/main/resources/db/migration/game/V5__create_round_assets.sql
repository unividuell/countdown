CREATE TABLE game.round_assets (
    id             UUID        PRIMARY KEY DEFAULT uuidv7(),
    round_game_id  UUID        NOT NULL REFERENCES game.round_games(id) ON DELETE CASCADE,
    -- URL-safe and unique per round: `clip-0`, `board`. The name is the asset's address.
    name           TEXT        NOT NULL,
    -- Who may see it. STAGE is the only one that travels as ciphertext, and it carries its stage.
    visibility     TEXT        NOT NULL CHECK (visibility IN ('SCENE', 'STAGE', 'AFTER_GUESS')),
    stage          INT         NULL,
    -- The real type, also for STAGE: `bytes` is ciphertext there, the client needs this to open it.
    media_type     TEXT        NOT NULL,
    -- 32 bytes, per asset, random. It sits next to the ciphertext on purpose: the encryption keeps a
    -- stage's bytes from the wire until its key opens, it does not protect the database.
    encryption_key BYTEA       NULL,
    -- STAGE: nonce || ciphertext || tag. Otherwise the plain bytes.
    bytes          BYTEA       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A key and a stage belong together, and to STAGE alone.
    CHECK ((visibility = 'STAGE') = (stage IS NOT NULL AND encryption_key IS NOT NULL)),
    -- Also what makes `INSERT ... ON CONFLICT (round_game_id, name) DO NOTHING` the answer to the
    -- announce race: both callers materialise, the first writer's rows stay. Keys are random, so
    -- the loser's rows replacing the winner's would hand out ciphertext nobody can open.
    UNIQUE (round_game_id, name)
);
