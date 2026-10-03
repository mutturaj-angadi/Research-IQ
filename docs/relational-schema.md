# Relational schema

Matches `database/migrations/001_core_schema.up.sql`. PK = primary key, FK = foreign key, UK = unique.

```
ROLES(id PK, name UK, description)
USERS(id PK, email UK, password_hash, full_name, is_active, created_at, updated_at)
USER_ROLES(user_id PK/FK->USERS, role_id PK/FK->ROLES)

PAPERS(id PK, title, abstract, publication_year, doi UK, venue, url, language, citation_count,
       file_hash UK, storage_path, processing_status, processing_error,
       uploaded_by FK->USERS, search_vector, created_at, updated_at)
AUTHORS(id PK, full_name, normalized_name UK, created_at)
PAPER_AUTHORS(paper_id PK/FK->PAPERS, author_id PK/FK->AUTHORS, author_order; UK(paper_id, author_order))
CATEGORIES(id PK, name UK, description)
PAPER_CATEGORIES(paper_id PK/FK->PAPERS, category_id PK/FK->CATEGORIES)

PAPER_CHUNKS(id PK, paper_id FK->PAPERS, chunk_index, section, page_number, content, token_count,
             content_hash, search_vector, created_at, updated_at;
             UK(paper_id, chunk_index), UK(paper_id, content_hash))
CHUNK_EMBEDDINGS(chunk_id PK/FK->PAPER_CHUNKS, embedding vector(768), model, dimension,
                 embedding_version, content_hash, created_at)

SEARCH_QUERIES(id PK, user_id FK->USERS, query_text, search_type, filters, result_count, created_at)
SEARCH_RESULTS(id PK, search_query_id FK->SEARCH_QUERIES, paper_id FK->PAPERS,
               chunk_id FK->PAPER_CHUNKS NULL, rank, score; UK(search_query_id, rank))

QUESTIONS(id PK, user_id FK->USERS, question_text, created_at)
ANSWERS(id PK, question_id FK/UK->QUESTIONS, answer_text, status, model, created_at)
ANSWER_EVIDENCE(answer_id PK/FK->ANSWERS, chunk_id PK/FK->PAPER_CHUNKS, rank, relevance_score; UK(answer_id, rank))

SAVED_PAPERS(user_id PK/FK->USERS, paper_id PK/FK->PAPERS, created_at)
```
Cardinalities: paper 1:N chunks; chunk 1:0..1 embedding; paper N:M authors; paper N:M categories; user 1:N searches/questions; question 1:0..1 answer; answer 1:N evidence; chunk 1:N evidence. See `er-diagram.png` / `er-diagram.mmd`.
