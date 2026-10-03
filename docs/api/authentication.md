# Authentication API

## Platform Authentication (Google OAuth)

### `POST /api/auth/start-with-prompt`

Captures user's company idea before redirecting to Google OAuth. Used when a user enters their prompt on the landing page before signing in.

**Body:**
```json
{ "prompt": "An AI tutoring platform for high school students" }
```

**Behavior:**
1. Sets `artha_pending_prompt` httpOnly cookie (10 min TTL)
2. Returns Google OAuth redirect URL

**Response:**
```json
{ "redirectUrl": "https://accounts.google.com/o/oauth2/..." }
```

### `GET /api/auth/google`

Initiates Google OAuth flow.

**Query params:**
- `return` (optional) — URL to redirect to after login (validated against open redirect attacks)

**Behavior:** Redirects to Google OAuth consent screen.

### `GET /api/auth/callback`

OAuth callback handler. Not called directly by clients.

**Query params:**
- `code` — Authorization code from Google
- `state` — Return path encoded in OAuth state

**Behavior:**
1. Exchanges code for Google user data (email, name, google_id)
2. Upserts user in `users` table via `upsertUser()`
3. Creates secure session (stored in `sessions` table)
4. Sets session cookie (httpOnly, secure)
5. Redirects to return path or dashboard

### `POST /api/auth/logout`

Destroys the user's session.

**Behavior:**
1. Calls `destroySession()` to remove from DB
2. Clears session cookie
3. Redirects to home page

## Session Management

Sessions are managed via `src/lib/auth.ts`:

- **`getSession()`** — Retrieves current user from request cookies. Returns `{ id, email, name }` or null.
- **`verifySessionFromRequest(request)`** — Validates request has a valid session. Throws 401 if not.
- Sessions stored in `sessions` table with expiry timestamps.
- JWT tokens signed with `AUTH_SECRET` via `jose` library.

## Site User Authentication

Company websites have their own separate auth system for end-users.

### `POST /api/site/[slug]/auth/signup`

Register a new site user.

**Rate limit:** 5 requests per 10 minutes per IP.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "minimum8chars",
  "name": "Jane Doe"
}
```

**Behavior:**
1. Validates password length (≥8 chars)
2. Hashes password with bcrypt
3. Creates `site_users` record in company's website DB
4. Sends verification email via Postmark
5. Returns user object + session token

### `POST /api/site/[slug]/auth/signin`

Authenticate existing site user.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "their_password"
}
```

**Response:**
```json
{
  "user": { "id": 1, "email": "...", "name": "..." },
  "token": "session_token_here"
}
```

### `GET /api/site/[slug]/auth/verify?token=...`

Verifies email address via token link sent during signup.

### `GET /api/site/[slug]/auth/me`

Returns current site user profile. Requires `Authorization: Bearer <token>` header.

### `POST /api/site/[slug]/auth/signout`

Destroys site user session.

### `POST /api/site/[slug]/auth/resend-verification`

Resends email verification link.
