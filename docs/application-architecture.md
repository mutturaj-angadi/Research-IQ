# Application architecture (Member 2)

```
Browser -> Next.js pages / client components -> /api route handlers
Route handler: same-origin check -> rate limit -> authenticate -> authorize (policy.ts) -> Zod validation
   -> application service (lib/services/{researchiq,library,users}.ts)
   -> Member 1 researchService() / parameterised SQL -> PostgreSQL + pgvector
```
- **Server pages** call application services directly (no HTTP hop) after `requirePageUser(permission)`.
- **Client components** (forms, semantic search, Ask, save button, upload) call `/api/*` only; they never import `pg`, config or keys.
- `lib/services/researchiq.ts` is the adapter over Member 1's `researchService()`; it builds `AuthContext` from the session user.
- `lib/services/library.ts` holds the SQL Member 1's contract lacks (saved list/unsave, history by type, dashboard, admin, analytics).
- DTOs: Member 1 DTOs (`lib/types.ts`) are returned as-is; user queries select explicit columns, never `password_hash` or `storage_path`.
- No sessions table (schema unchanged): stateless signed cookie, user reloaded from DB per request.
- Uploaded PDFs are parsed in memory by Member 1's pipeline; the file itself is not persisted (only text chunks/embeddings), so there is no storage path to expose.
