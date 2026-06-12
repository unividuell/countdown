CREATE SCHEMA IF NOT EXISTS iam;

CREATE TABLE iam.users (
    id              UUID         PRIMARY KEY DEFAULT uuidv7(),
    github_id       BIGINT       NOT NULL UNIQUE,
    github_login    TEXT         NOT NULL,
    github_name     TEXT         NULL,
    display_name    TEXT         NULL,
    email           TEXT         NULL,
    bg_color_hex    TEXT         NULL,
    is_super_admin  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
