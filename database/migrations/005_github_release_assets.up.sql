BEGIN;

-- Tracks external release assets independently from paper content. PDFs remain in memory.
CREATE TABLE github_release_assets (
    repository        text NOT NULL CHECK (repository ~ '^[A-Za-z0-9-]+/[A-Za-z0-9_.-]+$'),
    asset_id          bigint PRIMARY KEY CHECK (asset_id > 0),
    release_id        bigint NOT NULL CHECK (release_id > 0),
    release_tag       text NOT NULL CHECK (btrim(release_tag) <> ''),
    release_name      text NOT NULL CHECK (btrim(release_name) <> ''),
    release_draft     boolean NOT NULL DEFAULT false,
    release_prerelease boolean NOT NULL DEFAULT false,
    filename          text NOT NULL CHECK (btrim(filename) <> ''),
    download_url      text NOT NULL CHECK (download_url ~ '^https://github[.]com/'),
    content_type      text NOT NULL,
    asset_size        bigint NOT NULL CHECK (asset_size > 0),
    checksum          char(64) CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'),
    paper_id          uuid REFERENCES papers(id) ON DELETE RESTRICT,
    processing_status text NOT NULL DEFAULT 'DISCOVERED'
                      CHECK (processing_status IN ('DISCOVERED', 'DOWNLOADING', 'DOWNLOADED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    processing_error  text,
    attempt_count     integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    discovered_at     timestamptz NOT NULL DEFAULT now(),
    last_attempt_at   timestamptz,
    last_attempt_by   uuid REFERENCES users(id) ON DELETE SET NULL,
    last_synced_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    processed_at      timestamptz,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT github_asset_error_only_when_failed CHECK (processing_error IS NULL OR processing_status = 'FAILED'),
    CONSTRAINT github_asset_completed_has_paper CHECK (processing_status <> 'COMPLETED' OR paper_id IS NOT NULL)
);

CREATE INDEX idx_github_release_assets_status ON github_release_assets (processing_status, updated_at DESC);
CREATE INDEX idx_github_release_assets_paper ON github_release_assets (paper_id) WHERE paper_id IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'researchiq_app') THEN
        GRANT SELECT, INSERT, UPDATE ON github_release_assets TO researchiq_app;
    END IF;
END $$;

COMMIT;
