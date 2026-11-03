# ResearchIQ — Verification Report

**Date:** 2026-11-02

## Environment
- Next.js 15.5.27 at http://127.0.0.1:3000; root HTTP 200.
- Dependencies already installed; no install or migration was run.
- PostgreSQL 16.15, researchiq_dev, port 5433, role researchiq_app.
- pgvector 0.6.0; migrations 001–005 verified through local admin connection.
- Gemini generation model gemini-3.5-flash-lite; stored vectors use gemini-embedding-001 at 768 dimensions. No secrets printed.

## Live feature status

| Check | Result | Evidence |
|---|---|---|
| App root | PASS | HTTP 200 |
| Admin authentication/RBAC | PASS | Existing admin authenticated |
| Dashboard | PASS | Page and analytics API HTTP 200 |
| Paper list/detail | PASS | One paper, detail COMPLETED |
| Existing PDF ingestion output | PASS | GitHub asset 677255871 linked; 42 chunks/vectors |
| Keyword search | PASS | Returned imported paper |
| Semantic search | PASS | Three chunks from imported paper |
| Existing RAG answer | PASS | Gemini model, ANSWERED state |
| Citation/evidence lookup | PASS | Two stored citations resolve to real chunks |
| Answer history | PASS | Matching question appears ANSWERED |
| GitHub admin page | PASS | HTTP 200 |
| GitHub release-list API | BLOCKED | HTTP 429 from rate limiter; no retry |
| New PDF import or GitHub sync | NOT RUN | Existing data reused |
| Screenshot | PASS | Public landing page only |

Live DB snapshot: 1 paper, 42 chunks, 42 embeddings, 3 questions, 3 answers (1 ANSWERED, 2 FAILED), 2 answer_evidence rows. Existing FAILED records remain FAILED. Two normal searches were run and stored.

## Automated checks

| Command | Result |
|---|---|
| npm.cmd test | PASS — 100 passed, 0 failed; DB suites skipped because TEST_DATABASE_URL was unset |
| npm.cmd run typecheck | PASS — exit 0 |
| npm.cmd run lint | PASS — exit 0; Next.js notes next lint is deprecated for a future major |
| npm.cmd run build | PASS — exit 0 |
| git diff --check | PASS — exit 0; Git emitted line-ending conversion warnings |

No automated DB suite used researchiq_dev. Live read-only database and authenticated app checks were run separately.
The SQL examples file was executed successfully in a read-only transaction through local PostgreSQL access; its integrity checks returned zero missing/orphan vectors and EXPLAIN selected the HNSW index.

## Limitations
- One paper is insufficient to claim scale or performance.
- GitHub release listing was rate-limited; sync was not attempted.
- No new PDF was uploaded; the existing real ingestion output was verified.
- Answer state is ANSWERED, not SUCCESS.

