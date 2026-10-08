CREATE SCHEMA IF NOT EXISTS imagepool;

CREATE TABLE imagepool.images (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    -- NULL = the global pool. Deliberate exception to the NOT NULL rule in multi-tenancy.md:
    -- a game's read is "community_id = ? OR community_id IS NULL", so forgetting the IS NULL
    -- returns too little rather than another tenant's rows. Two tables would double every path
    -- (upload, thumbnail, delivery) and secure nothing.
    community_id UUID REFERENCES community.communities(id) ON DELETE CASCADE,
    uploaded_by  UUID        NOT NULL REFERENCES iam.users(id),
    media_type   TEXT        NOT NULL,
    width        INT         NOT NULL,
    height       INT         NOT NULL,
    byte_size    INT         NOT NULL,
    sha256       BYTEA       NOT NULL,
    bytes        BYTEA       NOT NULL,
    thumb_bytes  BYTEA       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The same file twice in one pool is an accident. NULLS NOT DISTINCT so the rule also bites
-- in the global pool, where community_id is NULL for every row.
CREATE UNIQUE INDEX images_pool_sha256
    ON imagepool.images (community_id, sha256) NULLS NOT DISTINCT;
