CREATE TABLE community.editions (
    id                        UUID         PRIMARY KEY DEFAULT uuidv7(),
    community_id              UUID         NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE,
    label                     TEXT         NULL,
    starts_at                 TIMESTAMPTZ  NOT NULL,
    starts_at_timezone        TEXT         NOT NULL DEFAULT 'Europe/Berlin',
    phase_two_start_round     INT          NULL,
    games_from_round          INT          NOT NULL,
    games_until_round         INT          NOT NULL DEFAULT 0,
    archived_at               TIMESTAMPTZ  NULL,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Round numbers rise with time, so the window is from <= number <= until.
    CONSTRAINT editions_window_ordered
        CHECK (games_from_round <= games_until_round)
);

-- The invariant: at most one active edition per community. A partial index, not a trigger.
CREATE UNIQUE INDEX idx_editions_one_active_per_community
    ON community.editions (community_id) WHERE archived_at IS NULL;

CREATE INDEX idx_editions_community ON community.editions (community_id);
