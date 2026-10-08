-- Accounts are keyed by (provider, subject), the way the auth lib hands every sign-in over. Real
-- rows keep GitHub's numeric id as text; the old seeder's synthetic negative ids become provider
-- 'test', keyed by login, which is exactly how the lib's test users sign in. A github_id of 0
-- matches neither UPDATE and fails the NOT NULL below, loudly, on purpose.
ALTER TABLE iam.users
    ADD COLUMN provider TEXT,
    ADD COLUMN subject  TEXT;

UPDATE iam.users SET provider = 'test',   subject = github_login    WHERE github_id < 0;
UPDATE iam.users SET provider = 'github', subject = github_id::text WHERE github_id > 0;

-- Dropping github_id drops its UNIQUE constraint with it.
ALTER TABLE iam.users
    ALTER COLUMN provider SET NOT NULL,
    ALTER COLUMN subject  SET NOT NULL,
    ADD CONSTRAINT users_provider_subject_key UNIQUE (provider, subject),
    DROP COLUMN github_id;
