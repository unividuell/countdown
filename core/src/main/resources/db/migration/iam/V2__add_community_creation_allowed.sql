ALTER TABLE iam.users
    ADD COLUMN community_creation_allowed BOOLEAN NOT NULL DEFAULT FALSE;
