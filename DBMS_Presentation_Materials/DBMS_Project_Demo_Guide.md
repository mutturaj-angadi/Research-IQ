# ResearchIQ Demonstration Guide

## Before class

1. Start PostgreSQL in WSL if required. The app expects researchiq_dev at localhost:5433.
2. From PowerShell at repository root, run npm.cmd run dev if not already running.
3. Open http://127.0.0.1:3000.
4. Use the existing administrator; do not show passwords, cookies, API keys, or .env.local.
5. Use DBMS_SQL_Examples.sql for safe read-only database queries.

## Suggested five-minute walkthrough

1. Landing page: explain semantic discovery and evidence-backed answers.
2. Sign in and open /admin. Show role-protected admin navigation.
3. Open /papers and the imported paper. Show COMPLETED status.
4. Show database relations: paper → chunks → vectors, 42/42 at 768 dimensions.
5. Keyword search for “inter-satellite link distance line-of-sight.”
6. Semantic search with the assigned inter-satellite question.
7. Open the existing answer in /history and inspect evidence links.
8. Explain SQL operator <=>, GIN full-text, and HNSW vector index.

## Verified live answer

Question: “What factors constrain feasible inter-satellite links, and why can snapshot-only approaches be insufficient?”

Answer stored by gemini-3.5-flash-lite:

> Based on the provided sources, the factors that constrain feasible inter-satellite links (ISLs) are geometric constraints—specifically distance and line-of-sight—ensuring that the link is not obstructed by the Earth and remains within allowable distance bounds [1][2].
>
> Snapshot-only approaches can be insufficient because they only evaluate feasibility at a single moment in time, failing to guarantee long-term physical validity as satellites move along their orbits [1]. Relying solely on snapshot-based feasibility can lead to frequent link reconfigurations, which are difficult in practice because reconfiguring optical ISLs requires physically steering laser terminals, re-acquiring beam alignment, and establishing stable connections [1]. These setup processes can take several seconds due to beam acquisition and pointing delays, which introduces non-negligible communication gaps and limits the practicality of frequent link switching [1].

Citation [1] resolves to chunk a9720a7b-dc93-428f-abd1-55951694c9ec; citation [2] resolves to chunk 06bdd226-016b-4460-9145-cc32f8521de1. Both are page 3 chunks of the linked paper.

## Verified in this run

- App root HTTP 200.
- Admin login and role confirmed; dashboard, paper list/detail, admin page and GitHub page returned 200.
- Keyword search returned the imported paper.
- Semantic search returned three chunks from that paper.
- Existing answer/evidence/history APIs returned ANSWERED and two actual chunk IDs.
- PostgreSQL 16.15, researchiq_dev, port 5433, pgvector 0.6.0; migrations 001–005 applied.
- Screenshot screenshots/researchiq-home.png is the public landing page only.

## Safe demo notes and limits

- Corpus currently has one completed paper; this is not a scale benchmark.
- Each Ask creates question/answer/evidence history; reasking creates additional records.
- Keyword and semantic requests create search history/result rows.
- Do not upload the already imported PDF again.
- GitHub admin page rendered, but GET /api/admin/github/releases returned 429 from the configured limiter. No sync was run; do not retry during cooldown.
- TEST_DATABASE_URL is unset. Never point DB test suites at researchiq_dev.
- No student/course details were found; add them manually.
