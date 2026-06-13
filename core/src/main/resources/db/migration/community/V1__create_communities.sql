CREATE SCHEMA IF NOT EXISTS community;

CREATE TABLE community.communities (
    id                        UUID         PRIMARY KEY DEFAULT uuidv7(),
    name                      TEXT         NOT NULL,
    slug                      TEXT         NOT NULL UNIQUE,
    starts_at                 TIMESTAMPTZ  NULL,
    phase_two_start_round     INT          NULL,
    invite_token              TEXT         NULL UNIQUE,
    invite_token_expires_at   TIMESTAMPTZ  NULL,
    created_by                UUID         NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE community.community_members (
    id            UUID         PRIMARY KEY DEFAULT uuidv7(),
    community_id  UUID         NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE,
    user_id       UUID         NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    status        TEXT         NOT NULL,
    is_admin      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (community_id, user_id)
);
CREATE INDEX idx_members_user ON community.community_members(user_id);

CREATE TABLE community.community_user_selection (
    user_id       UUID         PRIMARY KEY REFERENCES iam.users(id) ON DELETE CASCADE,
    community_id  UUID         NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
