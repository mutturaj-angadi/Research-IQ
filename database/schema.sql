-- Generated: concatenation of database/migrations/*.up.sql in order. Do not edit; edit migrations instead.
-- ===== migrations/001_core_schema.up.sql =====
-- 001_core_schema: extensions and relational tables.
-- Embedding dimension is fixed at 768 (see docs/vector-search): supported natively or via
-- dimension truncation by OpenAI text-embedding-3, Gemini and common local models.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- Users and roles (password hashing is done by Member 2's auth layer) ----------
CREATE TABLE roles (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL UNIQUE CHECK (name IN ('ADMIN', 'RESEARCHER')),
    description text NOT NULL
);

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    password_hash text NOT NULL CHECK (length(password_hash) >= 20),  -- bcrypt/argon2 output only
    full_name     text NOT NULL CHECK (btrim(full_name) <> ''),
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
    user_id uuid     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id smallint NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_id)
);

-- ---------- Papers, authors, categories ----------
CREATE TABLE papers (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title             text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 1000),
    abstract          text CHECK (abstract IS NULL OR btrim(abstract) <> ''),
    publication_year  smallint CHECK (publication_year BETWEEN 1900 AND 2100),
    doi               text UNIQUE CHECK (doi IS NULL OR (doi = lower(doi) AND doi ~ '^10\.\d{4,9}/\S+$')),
    venue             text CHECK (venue IS NULL OR btrim(venue) <> ''),   -- journal or conference
    url               text CHECK (url IS NULL OR url ~ '^https?://'),
    language          text NOT NULL DEFAULT 'en' CHECK (language ~ '^[a-z]{2,3}$'),
    citation_count    integer NOT NULL DEFAULT 0 CHECK (citation_count >= 0),
    file_hash         char(64) UNIQUE CHECK (file_hash IS NULL OR file_hash ~ '^[0-9a-f]{64}$'),  -- SHA-256 of PDF, duplicate detection
    storage_path      text,
    processing_status text NOT NULL DEFAULT 'PENDING'
                      CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    processing_error  text,
    uploaded_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    search_vector     tsvector GENERATED ALWAYS AS (
                          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                          setweight(to_tsvector('english', coalesce(abstract, '')), 'B')
                      ) STORED,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT papers_error_only_when_failed CHECK (processing_error IS NULL OR processing_status = 'FAILED'),
    CONSTRAINT papers_timestamps_ordered CHECK (updated_at >= created_at)
);

CREATE TABLE authors (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       text NOT NULL CHECK (btrim(full_name) <> ''),
    normalized_name text NOT NULL UNIQUE,   -- lower-cased, whitespace-collapsed; filled by trigger
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paper_authors (
    paper_id     uuid     NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    author_id    uuid     NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
    author_order smallint NOT NULL CHECK (author_order >= 1),
    PRIMARY KEY (paper_id, author_id),
    UNIQUE (paper_id, author_order)
);

CREATE TABLE categories (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
    description text
);

CREATE TABLE paper_categories (
    paper_id    uuid    NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    category_id integer NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    PRIMARY KEY (paper_id, category_id)
);

-- ---------- Chunks and embeddings ----------
CREATE TABLE paper_chunks (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id     uuid    NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    chunk_index  integer NOT NULL CHECK (chunk_index >= 0),
    section      text,
    page_number  integer CHECK (page_number IS NULL OR page_number >= 1),
    content      text    NOT NULL CHECK (btrim(content) <> ''),
    token_count  integer CHECK (token_count IS NULL OR token_count > 0),
    content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (paper_id, chunk_index),
    UNIQUE (paper_id, content_hash)
);

-- One current embedding per chunk. Stale if model differs from the configured model
-- or content_hash differs from paper_chunks.content_hash.
CREATE TABLE chunk_embeddings (
    chunk_id          uuid PRIMARY KEY REFERENCES paper_chunks(id) ON DELETE CASCADE,
    embedding         vector(768) NOT NULL,
    model             text    NOT NULL CHECK (btrim(model) <> ''),
    dimension         integer NOT NULL CHECK (dimension = 768),
    embedding_version integer NOT NULL DEFAULT 1 CHECK (embedding_version >= 1),
    content_hash      char(64) NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------- Search history ----------
CREATE TABLE search_queries (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
    query_text   text NOT NULL CHECK (length(btrim(query_text)) BETWEEN 1 AND 1000),
    search_type  text NOT NULL CHECK (search_type IN ('KEYWORD', 'SEMANTIC')),
    filters      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- variable filter set, not an entity; validated by Zod
    result_count integer NOT NULL DEFAULT 0 CHECK (result_count >= 0),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE search_results (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    search_query_id uuid NOT NULL REFERENCES search_queries(id) ON DELETE CASCADE,
    paper_id        uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    chunk_id        uuid REFERENCES paper_chunks(id) ON DELETE CASCADE,  -- NULL for paper-level keyword hits
    rank            integer NOT NULL CHECK (rank >= 1),
    score           double precision NOT NULL,
    UNIQUE (search_query_id, rank)
);

-- ---------- Question answering ----------
CREATE TABLE questions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
    question_text text NOT NULL CHECK (length(btrim(question_text)) BETWEEN 1 AND 2000),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE answers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
    answer_text text NOT NULL,
    status      text NOT NULL CHECK (status IN ('ANSWERED', 'NO_EVIDENCE', 'FAILED')),
    model       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT answers_text_when_answered CHECK (status <> 'ANSWERED' OR btrim(answer_text) <> '')
);

CREATE TABLE answer_evidence (
    answer_id       uuid NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    chunk_id        uuid NOT NULL REFERENCES paper_chunks(id) ON DELETE CASCADE,
    rank            integer NOT NULL CHECK (rank >= 1),
    relevance_score double precision NOT NULL,
    PRIMARY KEY (answer_id, chunk_id),
    UNIQUE (answer_id, rank)
);

-- ---------- Saved papers ----------
CREATE TABLE saved_papers (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_id   uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, paper_id)
);

INSERT INTO roles (name, description) VALUES
    ('ADMIN', 'Manages papers, categories and users'),
    ('RESEARCHER', 'Searches papers, asks questions and saves papers');

COMMIT;
-- ===== migrations/002_indexes.up.sql =====
-- 002_indexes: every index maps to a query pattern (noted per line).
BEGIN;
-- papers: filter by year, admin lists by status, newest-first pagination, keyword search
CREATE INDEX idx_papers_year        ON papers (publication_year);
CREATE INDEX idx_papers_status      ON papers (processing_status);
CREATE INDEX idx_papers_created     ON papers (created_at DESC);
CREATE INDEX idx_papers_fts         ON papers USING gin (search_vector);
-- junction tables: PK covers paper-first lookups; these cover author/category-first lookups
CREATE INDEX idx_paper_authors_author     ON paper_authors (author_id);
CREATE INDEX idx_paper_categories_category ON paper_categories (category_id);
-- chunks: section/page lookup per paper, chunk-level keyword search
CREATE INDEX idx_chunks_paper_page    ON paper_chunks (paper_id, page_number);
CREATE INDEX idx_chunks_paper_section ON paper_chunks (paper_id, section);
CREATE INDEX idx_chunks_fts           ON paper_chunks USING gin (search_vector);
-- vector: cosine distance (embeddings are normalised); HNSW needs no training data, suits a growing corpus
CREATE INDEX idx_chunk_embeddings_hnsw ON chunk_embeddings USING hnsw (embedding vector_cosine_ops);
-- stale-embedding scans
CREATE INDEX idx_chunk_embeddings_model ON chunk_embeddings (model, embedding_version);
-- history pages and analytics
CREATE INDEX idx_search_queries_user_created ON search_queries (user_id, created_at DESC);
CREATE INDEX idx_search_results_paper        ON search_results (paper_id);
CREATE INDEX idx_search_results_chunk        ON search_results (chunk_id) WHERE chunk_id IS NOT NULL;
CREATE INDEX idx_questions_user_created      ON questions (user_id, created_at DESC);
CREATE INDEX idx_answer_evidence_chunk       ON answer_evidence (chunk_id);
CREATE INDEX idx_saved_papers_paper          ON saved_papers (paper_id);
COMMIT;
-- ===== migrations/003_functions_triggers_views.up.sql =====
-- 003: triggers, functions and views.
BEGIN;

-- Keep updated_at honest.
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER trg_users_updated   BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_papers_updated  BEFORE UPDATE ON papers       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_chunks_updated  BEFORE UPDATE ON paper_chunks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Author names are matched on a normalised form so "  Ada   LOVELACE " and "ada lovelace" are one author.
CREATE FUNCTION normalize_author_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.full_name       := regexp_replace(btrim(NEW.full_name), '\s+', ' ', 'g');
    NEW.normalized_name := lower(NEW.full_name);
    RETURN NEW;
END $$;

CREATE TRIGGER trg_authors_normalize BEFORE INSERT OR UPDATE OF full_name ON authors
    FOR EACH ROW EXECUTE FUNCTION normalize_author_name();

-- A paper may only be COMPLETED when it has chunks and every chunk has an embedding.
CREATE FUNCTION enforce_completed_requires_embeddings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.processing_status = 'COMPLETED' THEN
        IF NOT EXISTS (SELECT 1 FROM paper_chunks WHERE paper_id = NEW.id) THEN
            RAISE EXCEPTION 'paper % cannot be COMPLETED: no chunks', NEW.id USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM paper_chunks c
                   LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id
                   WHERE c.paper_id = NEW.id AND e.chunk_id IS NULL) THEN
            RAISE EXCEPTION 'paper % cannot be COMPLETED: chunks without embeddings', NEW.id USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_papers_completed_guard BEFORE UPDATE OF processing_status ON papers
    FOR EACH ROW WHEN (NEW.processing_status = 'COMPLETED')
    EXECUTE FUNCTION enforce_completed_requires_embeddings();

CREATE VIEW paper_summary_view AS
SELECT p.id, p.title, p.publication_year, p.venue, p.doi, p.citation_count, p.processing_status,
       COALESCE((SELECT string_agg(a.full_name, ', ' ORDER BY pa.author_order)
                 FROM paper_authors pa JOIN authors a ON a.id = pa.author_id
                 WHERE pa.paper_id = p.id), '') AS authors,
       (SELECT count(*) FROM paper_authors pa WHERE pa.paper_id = p.id)    AS author_count,
       (SELECT count(*) FROM paper_categories pc WHERE pc.paper_id = p.id) AS category_count,
       (SELECT count(*) FROM paper_chunks c WHERE c.paper_id = p.id)       AS chunk_count,
       p.created_at
FROM papers p;

CREATE FUNCTION get_paper_statistics(p_paper_id uuid)
RETURNS TABLE (chunk_count bigint, embedded_chunk_count bigint, times_retrieved bigint,
               times_cited_as_evidence bigint, times_saved bigint)
LANGUAGE sql STABLE AS $$
    SELECT (SELECT count(*) FROM paper_chunks c WHERE c.paper_id = p_paper_id),
           (SELECT count(*) FROM paper_chunks c JOIN chunk_embeddings e ON e.chunk_id = c.id WHERE c.paper_id = p_paper_id),
           (SELECT count(*) FROM search_results sr WHERE sr.paper_id = p_paper_id),
           (SELECT count(*) FROM answer_evidence ae JOIN paper_chunks c ON c.id = ae.chunk_id WHERE c.paper_id = p_paper_id),
           (SELECT count(*) FROM saved_papers sp WHERE sp.paper_id = p_paper_id);
$$;

COMMIT;
-- ===== migrations/004_app_role_privileges.up.sql =====
-- 004: least-privilege application role. The migration owner keeps DDL rights; the app role gets DML only.
-- Enable login out of band:  ALTER ROLE researchiq_app LOGIN PASSWORD '<from your secret store>';
BEGIN;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'researchiq_app') THEN
        CREATE ROLE researchiq_app NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO researchiq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO researchiq_app;
REVOKE INSERT, UPDATE, DELETE ON roles FROM researchiq_app;      -- role catalogue is admin-managed
DO $$
BEGIN
    IF to_regclass('public.schema_migrations') IS NOT NULL THEN
        REVOKE ALL ON schema_migrations FROM researchiq_app;
    END IF;
END $$;
GRANT EXECUTE ON FUNCTION get_paper_statistics(uuid) TO researchiq_app;
COMMIT;
