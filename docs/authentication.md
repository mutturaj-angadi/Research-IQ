# Authentication and authorization

- **Passwords:** scrypt (N=16384, r=8, p=1, 16-byte random salt) via `node:crypto`; stored as `scrypt$N$r$p$salt$hash` in `users.password_hash`. Policy: 10-128 chars, upper+lower+digit. Login uses constant-time comparison and verifies a dummy hash for unknown emails.
- **Sessions:** cookie `riq_session` = `base64url(payload).base64url(HMAC-SHA256)`; payload holds only user id and iat/exp. `HttpOnly`, `SameSite=Lax`, `Secure` in production, max age `SESSION_MAX_AGE_SECONDS` (default 7 days). `SESSION_SECRET` (>=32 chars) is server-only.
- **Per request:** `getCurrentUser()` verifies signature+expiry, then reloads the user and roles from PostgreSQL (`is_active` only), so disabling a user or changing roles takes effect immediately. Logout deletes the cookie; there is no server-side token revocation (stateless), so expiry bounds a stolen cookie.
- **Helpers:** `getCurrentUser`, `requireAuth(permission?)` (API, throws 401/403), `requireRole`, `requirePageUser(permission?)` (pages, redirects), `logout`.
- **RBAC:** `lib/auth/policy.ts` matrix, enforced in every route via `route({ permission })` and in page guards; `/admin/**` is guarded in `app/admin/layout.tsx`. `middleware.ts` only redirects cookie-less visitors (UX), it is not the security boundary.

| Feature | Researcher | Admin |
|---|---|---|
| Browse/search/semantic/ask/evidence/save | yes | yes |
| History, questions | own | own (+ can read any question) |
| Dashboard | own activity | own + system totals |
| Upload/process papers, categories, users, analytics | no | yes |
