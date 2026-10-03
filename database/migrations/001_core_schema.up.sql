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
