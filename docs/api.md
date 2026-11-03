# API reference

Envelope: `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message", "details?" } }`.
Codes: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, PDF_PROCESSING_ERROR 422, RATE_LIMITED 429, EMBEDDING_ERROR 502, DATABASE_ERROR/INTERNAL_ERROR 500.
Pagination: `page>=1`, `pageSize` 1-50 -> `{ items, page, pageSize, total, totalPages }`.

| Method & path | Auth | Notes |
|---|---|---|
| POST /api/auth/register | public, 10/15 min/IP | creates RESEARCHER, starts session |
| POST /api/auth/login | public, 10/15 min/IP | HttpOnly cookie |
| POST /api/auth/logout, GET /api/auth/me | - / any user | |
| GET /api/papers?yearFrom&yearTo&venue&categoryId&page&pageSize | papers:read | |
| GET /api/papers/{id} | papers:read | includes `saved` for caller |
| GET /api/papers/{id}/evidence?q=&topK= | evidence:read, 20/min/user | semantic search inside one paper |
| POST /api/search | search:run | body `{query, page, pageSize, yearFrom...}`; logged to history |
| POST /api/semantic-search | search:run, 20/min/user | body `{query, topK?, filters?}` |
| POST /api/questions | qa:ask, 10/min/user | `{question}` -> `{status, answer, evidence[]}` |
| GET /api/questions, /api/questions/{id}, /api/questions/{id}/evidence, /api/evidence/{answerId} | own (admin: any) | ownership enforced |
| GET/POST /api/saved, PUT/DELETE /api/saved/{paperId} | saved:manage | per-user; save idempotent |
| GET /api/history?kind=KEYWORD\|SEMANTIC\|QUESTION | own | |
| GET /api/categories, /api/authors | papers:read | |
| GET /api/admin/users, /papers, /processing, /analytics | admin | |
| POST /api/admin/papers | admin, 10/h | multipart: `file` (PDF <= 20 MB) + optional metadata |
| GET /api/admin/github/releases | admin, 30/h | release assets with persisted import status |
| POST /api/admin/github/sync | admin, 10/h | idempotently registers release metadata in PostgreSQL |
| POST /api/admin/github/import | admin, 120/h | `{assetId}`; downloads a registered asset and runs existing ingestion |
| GET/POST /api/admin/categories, PATCH/DELETE /api/admin/categories/{id} | admin | delete blocked while assigned |
