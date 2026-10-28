CREATE SCHEMA IF NOT EXISTS audiopool;

CREATE TABLE audiopool.clips (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    -- NULL = the global pool, for the same reason as imagepool.images: a game's read is
    -- "community_id = ? OR community_id IS NULL", so forgetting the IS NULL returns too little
    -- rather than another tenant's rows.
    community_id UUID REFERENCES community.communities(id) ON DELETE CASCADE,
    uploaded_by  UUID        NOT NULL REFERENCES iam.users(id),
    file_name    TEXT        NOT NULL,   -- what the chosen file was called, for the list
    channels     SMALLINT    NOT NULL,
    sample_rate  INT         NOT NULL,
    frames       INT         NOT NULL,   -- duration = frames / sample_rate
    byte_size    INT         NOT NULL,
    sha256       BYTEA       NOT NULL,
    bytes        BYTEA       NOT NULL,   -- the WAV, as uploaded
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The same file twice in one pool is an accident. NULLS NOT DISTINCT so the rule also bites
-- in the global pool, where community_id is NULL for every row.
CREATE UNIQUE INDEX clips_pool_sha256
    ON audiopool.clips (community_id, sha256) NULLS NOT DISTINCT;
