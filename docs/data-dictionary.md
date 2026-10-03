# Data dictionary

Types: `uuid` = gen_random_uuid() default PK unless noted. All timestamps are `timestamptz` defaulting to `now()`.

## roles
| Column | Type | Null | Constraints / description |
|---|---|---|---|
| id | smallint identity | no | PK |
| name | text | no | UK, CHECK in (ADMIN, RESEARCHER) |
| description | text | no | What the role may do |

## users
| Column | Type | Null | Constraints / description |
|---|---|---|---|
| id | uuid | no | PK |
| email | text | no | UK, lower-case, email-shaped CHECK |
| password_hash | text | no | CHECK length >= 20; hash only, never plaintext |
| full_name | text | no | CHECK non-blank |
| is_active | boolean | no | default true |
| created_at, updated_at | timestamptz | no | updated_at maintained by trigger |

## user_roles
| user_id | uuid | no | PK/FK -> users, ON DELETE CASCADE |
|---|---|---|---|
| role_id | smallint | no | PK/FK -> roles, ON DELETE RESTRICT |

## papers
| Column | Type | Null | Constraints / description |
|---|---|---|---|
| id | uuid | no | PK |
| title | text | no | CHECK non-blank, <= 1000 chars |
| abstract | text | yes | CHECK non-blank when present |
| publication_year | smallint | yes | CHECK 1900..2100 |
| doi | text | yes | UK; CHECK lower-case `10.xxxx/...` |
| venue | text | yes | Journal or conference name |
| url | text | yes | CHECK starts with http(s):// |
| language | text | no | default 'en'; CHECK 2-3 lower-case letters |
| citation_count | integer | no | default 0, CHECK >= 0 |
| file_hash | char(64) | yes | UK; SHA-256 of the PDF (duplicate detection) |
| storage_path | text | yes | Where the PDF is stored (Member 2's storage layer) |
| processing_status | text | no | default PENDING; PENDING/PROCESSING/COMPLETED/FAILED |
| processing_error | text | yes | CHECK only when FAILED; safe message |
| uploaded_by | uuid | yes | FK -> users, ON DELETE SET NULL |
| search_vector | tsvector | no | GENERATED: title weight A + abstract weight B |
| created_at, updated_at | timestamptz | no | CHECK updated_at >= created_at |

## authors
| id | uuid | no | PK |
|---|---|---|---|
| full_name | text | no | CHECK non-blank; whitespace collapsed by trigger |
| normalized_name | text | no | UK; lower(full_name), set by trigger |
| created_at | timestamptz | no | |

## paper_authors
| paper_id | uuid | no | PK/FK -> papers, CASCADE |
|---|---|---|---|
| author_id | uuid | no | PK/FK -> authors, RESTRICT |
| author_order | smallint | no | CHECK >= 1; UK(paper_id, author_order) |

## categories / paper_categories
| categories.id | integer identity | no | PK |
|---|---|---|---|
| name | text | no | UK, non-blank |
| description | text | yes | |
| paper_categories.paper_id | uuid | no | PK/FK -> papers, CASCADE |
| paper_categories.category_id | integer | no | PK/FK -> categories, RESTRICT |

## paper_chunks
| Column | Type | Null | Constraints / description |
|---|---|---|---|
| id | uuid | no | PK |
| paper_id | uuid | no | FK -> papers, CASCADE |
| chunk_index | integer | no | CHECK >= 0; UK(paper_id, chunk_index) |
| section | text | yes | Detected section heading |
| page_number | integer | yes | CHECK >= 1; page of the chunk's first new text |
| content | text | no | CHECK non-blank; original text |
| token_count | integer | yes | Estimate (chars / 4) |
| content_hash | char(64) | no | SHA-256 hex; UK(paper_id, content_hash) |
| search_vector | tsvector | no | GENERATED to_tsvector('english', content) |
| created_at, updated_at | timestamptz | no | |

## chunk_embeddings
| chunk_id | uuid | no | PK/FK -> paper_chunks, CASCADE |
|---|---|---|---|
| embedding | vector(768) | no | L2-normalised; cosine distance |
| model | text | no | Embedding model name, used for stale detection |
| dimension | integer | no | CHECK = 768 |
| embedding_version | integer | no | default 1, incremented on re-embed |
| content_hash | char(64) | no | Hash of the text that was embedded |
| created_at | timestamptz | no | |

## search_queries / search_results
| search_queries.id | uuid | no | PK |
|---|---|---|---|
| user_id | uuid | yes | FK -> users, SET NULL |
| query_text | text | no | CHECK 1..1000 chars |
| search_type | text | no | KEYWORD or SEMANTIC |
| filters | jsonb | no | default '{}' |
| result_count | integer | no | CHECK >= 0 |
| search_results.id | uuid | no | PK |
| search_query_id | uuid | no | FK -> search_queries, CASCADE |
| paper_id | uuid | no | FK -> papers, CASCADE |
| chunk_id | uuid | yes | FK -> paper_chunks, CASCADE; NULL for paper-level hits |
| rank | integer | no | CHECK >= 1; UK(search_query_id, rank) |
| score | double precision | no | ts_rank_cd or cosine similarity |

## questions / answers / answer_evidence
| questions.id | uuid | no | PK |
|---|---|---|---|
| user_id | uuid | yes | FK -> users, SET NULL |
| question_text | text | no | CHECK 1..2000 chars |
| answers.id | uuid | no | PK |
| question_id | uuid | no | FK/UK -> questions, CASCADE (one answer per question) |
| answer_text | text | no | CHECK non-blank when ANSWERED |
| status | text | no | ANSWERED / NO_EVIDENCE / FAILED |
| model | text | yes | Generator model name |
| answer_evidence.answer_id | uuid | no | PK/FK -> answers, CASCADE |
| chunk_id | uuid | no | PK/FK -> paper_chunks, CASCADE |
| rank | integer | no | CHECK >= 1; UK(answer_id, rank) |
| relevance_score | double precision | no | Cosine similarity at retrieval time |

## saved_papers
| user_id | uuid | no | PK/FK -> users, CASCADE |
|---|---|---|---|
| paper_id | uuid | no | PK/FK -> papers, CASCADE |
| created_at | timestamptz | no | |

## Indexes (migration 002)
| Index | Query pattern |
|---|---|
| idx_papers_year / status / created | Year filters, admin status lists, newest-first pagination |
| idx_papers_fts, idx_chunks_fts (GIN) | Keyword search over title/abstract and chunk text |
| idx_paper_authors_author, idx_paper_categories_category | Author-first and category-first filters and counts (PKs cover paper-first) |
| idx_chunks_paper_page / section | Chunks of a paper by page or section |
| idx_chunk_embeddings_hnsw (vector_cosine_ops) | Approximate nearest-neighbour search |
| idx_chunk_embeddings_model | Finding stale embeddings |
| idx_search_queries_user_created, idx_questions_user_created | History pages |
| idx_search_results_paper / chunk, idx_answer_evidence_chunk, idx_saved_papers_paper | "Most retrieved" analytics and reverse lookups |

## Views, functions, triggers
- `paper_summary_view`: paper + ordered authors + author/category/chunk counts.
- `get_paper_statistics(uuid)`: chunk, embedded chunk, retrieval, evidence and save counts.
- Triggers: `set_updated_at` (users, papers, paper_chunks); `normalize_author_name`; `trg_papers_completed_guard` (COMPLETED requires chunks and embeddings).
- Role `researchiq_app` (migration 004): DML only; `roles` read-only.
