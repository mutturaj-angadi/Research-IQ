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
