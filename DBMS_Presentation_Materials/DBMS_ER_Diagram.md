# ResearchIQ ER Diagram

Based on the live schema and migrations 001–005. schema_migrations is operational metadata; paper_summary_view is a view, not a base entity.

~~~mermaid
erDiagram
    users ||--o{ user_roles : receives
    roles ||--o{ user_roles : grants
    users o|--o{ papers : uploads
    papers ||--o{ paper_authors : has
    authors ||--o{ paper_authors : writes
    papers ||--o{ paper_categories : tagged
    categories ||--o{ paper_categories : classifies
    papers ||--o{ paper_chunks : contains
    paper_chunks ||--o| chunk_embeddings : vector
    users o|--o{ search_queries : submits
    search_queries ||--o{ search_results : returns
    papers ||--o{ search_results : matched
    paper_chunks o|--o{ search_results : passage
    users o|--o{ questions : asks
    questions ||--o| answers : answered_by
    answers ||--o{ answer_evidence : cites
    paper_chunks ||--o{ answer_evidence : supports
    users ||--o{ saved_papers : saves
    papers ||--o{ saved_papers : saved
    papers o|--o{ github_release_assets : imported_from
    users o|--o{ github_release_assets : attempts
    users o|--o{ github_release_assets : synchronizes

    users {
        uuid id PK
        text email UK
        text password_hash
        text full_name
        boolean is_active
    }
    roles {
        smallint id PK
        text name UK
        text description
    }
    user_roles {
        uuid user_id PK, FK
        smallint role_id PK, FK
    }
    papers {
        uuid id PK
        text title
        smallint publication_year
        text doi UK
        char64 file_hash UK
        text processing_status
        uuid uploaded_by FK
        tsvector search_vector
    }
    authors {
        uuid id PK
        text full_name
        text normalized_name UK
    }
    paper_authors {
        uuid paper_id PK, FK
        uuid author_id PK, FK
        smallint author_order UK
    }
    categories {
        integer id PK
        text name UK
    }
    paper_categories {
        uuid paper_id PK, FK
        integer category_id PK, FK
    }
    paper_chunks {
        uuid id PK
        uuid paper_id FK
        integer chunk_index UK
        text content
        char64 content_hash UK
        tsvector search_vector
    }
    chunk_embeddings {
        uuid chunk_id PK, FK
        vector768 embedding
        text model
        integer dimension
        integer embedding_version
    }
    search_queries {
        uuid id PK
        uuid user_id FK
        text query_text
        text search_type
        jsonb filters
    }
    search_results {
        uuid id PK
        uuid search_query_id FK
        uuid paper_id FK
        uuid chunk_id FK
        integer rank
        float score
    }
    questions {
        uuid id PK
        uuid user_id FK
        text question_text
    }
    answers {
        uuid id PK
        uuid question_id FK, UK
        text answer_text
        text status
        text model
    }
    answer_evidence {
        uuid answer_id PK, FK
        uuid chunk_id PK, FK
        integer rank UK
        float relevance_score
    }
    saved_papers {
        uuid user_id PK, FK
        uuid paper_id PK, FK
    }
    github_release_assets {
        bigint asset_id PK
        text repository
        bigint release_id
        text filename
        char64 checksum
        uuid paper_id FK
        text processing_status
    }
~~~

## Cardinality notes

- paper_chunks → chunk_embeddings is one-to-zero-or-one because chunk_id is the embedding table's primary key.
- answers → answer_evidence is one-to-many; answer_evidence bridges to source chunks.
- questions → answers is one-to-zero-or-one because answers.question_id is UNIQUE.
- GitHub assets can exist before import; paper_id is nullable. A linked paper cannot be deleted while referenced because the FK is RESTRICT.
- search_results.chunk_id is nullable for paper-level hits. Separate FKs do not enforce that chunk_id belongs to its paper_id.

