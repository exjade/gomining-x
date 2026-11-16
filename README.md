# GoMining / MinerX — Client Storefront (`main`)

Customer-facing web application (`gomining-local-replica`) built with **React 19**, **TypeScript**, **Vite 6**, **Firebase Web SDK**, and **EVM / Solana Wallet Connectors** (Reown AppKit, Wagmi, Viem, `@solana/web3.js`).

---

## 1. Repository Architecture & Branch Lines

This repository separates the customer storefront from the administrative panel and API server across two distinct release lines:

| Component | Branch Line | Operational Worktree | Canonical Local URL |
| :--- | :--- | :--- | :--- |
| **Client Storefront** | `origin/main` | `Y:\ChatGPT\go-minning\_worktrees\current-client` | `http://127.0.0.1:5175` |
| **Admin Dashboard** | `origin/release/pouw-admin-backend` | `Y:\ChatGPT\go-minning\_worktrees\current-admin-backend` | `http://127.0.0.1:5174` |
| **Backend API (Express)** | `origin/release/pouw-admin-backend` | `Y:\ChatGPT\go-minning\_worktrees\current-admin-backend` | `http://127.0.0.1:3001` |

- **Client (`main`)** serves the customer storefront, miner builder/customizer, checkout, referrals, and user dashboard, proxying `/api/catalog` and `/api/purchases` to the local Backend on port `3001`.
- **Admin + Backend (`release/pouw-admin-backend`)** runs the Node.js/Express API server on port `3001` and the Admin Dashboard frontend on port `5174`.
- **Do not merge** `release/pouw-admin-backend` into `main` (or vice versa); each line is developed and verified in its own isolated worktree.

### Local Environment Architecture Map

```text
Cliente (Storefront)
current-client
origin/main
http://127.0.0.1:5175
        |
        | /api/catalog, /api/purchases
        v
Backend (API Express)
current-admin-backend
origin/release/pouw-admin-backend
http://127.0.0.1:3001
        ^
        | /api
        |
Admin Dashboard
current-admin-backend
origin/release/pouw-admin-backend
http://127.0.0.1:5174
```

---

## 2. Environment Configuration (`.env.local`)

Client and Admin/Backend use **separate `.env.local` files** located in their respective worktrees. Never commit `.env.local` or service-account JSON files to Git.

### 2.1 Client `.env.local` (`_worktrees/current-client/.env.local`)

Copy `.env.example` to `.env.local` inside the Client worktree and populate all six Firebase Web App keys:

```env
VITE_FIREBASE_API_KEY=<your-firebase-web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<your-project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<your-firebase-project-id>
VITE_FIREBASE_STORAGE_BUCKET=<your-project-id>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<your-messaging-sender-id>
VITE_FIREBASE_APP_ID=<your-firebase-web-app-id>
```

#### Troubleshooting: `AIzaSyMockKeyForTestingOnly` / `auth/api-key-not-valid`

In `src/firebase.ts`, if `VITE_FIREBASE_API_KEY` is missing or `.env.local` is absent in the active Client worktree, the app falls back to the placeholder string `'AIzaSyMockKeyForTestingOnly'`. Any Firebase Authentication request (login, registration, password reset, or anonymous sign-in) sent with that placeholder fails with:

```text
Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.)
```

To resolve this:
1. Confirm `.env.local` exists directly inside the active Client worktree (for example `Y:\ChatGPT\go-minning\_worktrees\current-client\.env.local`), not only in the repository root directory.
2. Verify all six `VITE_FIREBASE_*` variables are non-empty and match the Firebase Web App configuration without quotes or angle brackets.
3. Restart the Vite dev server (`Ctrl+C` and re-run `npx vite --host 127.0.0.1 --port 5175 --strictPort`) so `import.meta.env` reloads the updated environment variables.
4. For Node-based unit tests, keep `VITE_FIREBASE_PROJECT_ID` unset or pointed to a non-production test ID (`src/firebase.ts` blocks direct Node connections to `salad-miners`).

---

### 2.2 Admin Dashboard & Backend `.env.local` (`_worktrees/current-admin-backend/.env.local`)

The Admin/Backend worktree maintains its own `.env.local` (and terminal runtime environment) separate from the Client:

```env
# Backend server port and Firestore admin allowlist authority
PORT=3001
ADMIN_ALLOWLIST_SOURCE=firestore

# Server-side Firebase Admin credentials (use an external path outside the repository,
# or provide FIREBASE_SERVICE_ACCOUNT_BASE64 in hosted environments)
GOOGLE_APPLICATION_CREDENTIALS=<external-path-outside-repo>/firebase-adminsdk.json

# Admin Dashboard Vite client Firebase Web configuration
VITE_FIREBASE_API_KEY=<your-firebase-web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<your-project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<your-firebase-project-id>
VITE_FIREBASE_STORAGE_BUCKET=<your-project-id>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<your-messaging-sender-id>
VITE_FIREBASE_APP_ID=<your-firebase-web-app-id>
```

#### Operational Notes for Backend & Admin Runtime:

- `FirebaseAdminAuthAdapter` (`server/services/firebaseAdminAuthAdapter.ts`) uses lazy initialization via `ensureInitialized()` and supports same-process recovery (`initialization_recovered`) once credentials or the Firestore allowlist authority become available, without weakening fail-closed behavior.
- Under `ADMIN_ALLOWLIST_SOURCE=firestore`, runtime outcomes for `/api/auth/me` and protected admin endpoints follow `RUNBOOK_ADMIN_AUTH_ALLOWLIST_RUNTIME.md`:
  - `200`: The Firebase ID token is valid and the user is an approved Firestore admin in `/admin_users/{firebaseUid}`.
  - `401`: The token is missing, invalid, expired, not allowlisted, has a role other than `admin`, has a conflicting UID binding, or has no unique legacy email match. (A direct browser navigation to `GET /api/auth/me` without an `Authorization: Bearer <Firebase ID token>` header returns 401 as expected.)
  - `503` (`ADMIN_ALLOWLIST_UNAVAILABLE`): Firebase Admin Auth or the Firestore allowlist authority is unavailable (infrastructure failure; the Admin frontend retains the candidate session during a mount-time 503 so requests can succeed on retry once the authority recovers).
- Ensure `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST` are unset when verifying real Firebase ID tokens against Firebase Auth.
- Never place service-account JSON credentials inside a Git worktree or commit them to source control.

---

## 3. Running the Local Stack

### 3.1 Initial Dependency Setup (First Time / After package-lock.json Changes)

Install dependencies once per worktree on initial setup or after lockfile changes (do not run `npm ci` on every routine server start):

```powershell
npm --prefix "Y:\ChatGPT\go-minning\_worktrees\current-admin-backend" ci
npm --prefix "Y:\ChatGPT\go-minning\_worktrees\current-client" ci
```

### 3.2 Daily Service Startup (Three Terminals)

Start the three services across three separate PowerShell terminals so that `/api/*` proxies resolve cleanly.

#### Terminal 1 — Backend API (`http://127.0.0.1:3001`)

```powershell
cd "Y:\ChatGPT\go-minning\_worktrees\current-admin-backend"
$env:PORT = "3001"
$env:ADMIN_ALLOWLIST_SOURCE = "firestore"
$env:GOOGLE_APPLICATION_CREDENTIALS = "<external-path-outside-repo>\firebase-adminsdk.json"
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue

# API-only local startup (starts Express API on 127.0.0.1:3001 without isMainModule background/Telegram intervals):
node --env-file-if-exists=.env.local --import tsx --input-type=module -e "import('./server/server.ts').then(m => m.app.listen(3001,'127.0.0.1',() => console.log('Backend: http://127.0.0.1:3001')))"
```

> **API-only vs. Full Runtime**: Importing `server/server.ts` and calling `m.app.listen(...)` keeps `isMainModule` false, starting the Express HTTP API cleanly for local Client/Admin development without launching the 60-second autonomous surveillance loop or 8-second Telegram command poller. Use `npm start` (`tsx server/server.ts`) only when you explicitly want the full background-watcher runtime.

Expected output:
```text
Backend: http://127.0.0.1:3001
```

Verify that the storefront catalog endpoint responds:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/catalog/storefront?section=packages"
```

#### Terminal 2 — Admin Dashboard (`http://127.0.0.1:5174`)

```powershell
cd "Y:\ChatGPT\go-minning\_worktrees\current-admin-backend"
npx vite --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/` in your browser. Vite proxies `/api` requests to `http://127.0.0.1:3001`.

#### Terminal 3 — Client Storefront (`http://127.0.0.1:5175`)

```powershell
cd "Y:\ChatGPT\go-minning\_worktrees\current-client"
npx vite --host 127.0.0.1 --port 5175 --strictPort
```

Open `http://127.0.0.1:5175/` in your browser. Vite proxies `/api/catalog` and `/api/purchases` to `http://127.0.0.1:3001`.

---

## 4. Operational Worktrees & Task Branch Workflow

### 4.1 Operational Reference Worktrees

- `Y:\ChatGPT\go-minning\_worktrees\current-client`: Clean baseline checkout tracking `origin/main`. Use this worktree to run and manually verify the current Client storefront without disturbing uncommitted files in the repository root.
- `Y:\ChatGPT\go-minning\_worktrees\current-admin-backend`: Clean baseline checkout tracking `origin/release/pouw-admin-backend`. Use this worktree to run the Express Backend (`3001`) and Admin Dashboard (`5174`).
- **Important**: Do not develop new features, bugfixes, or documentation changes directly inside `Y:\ChatGPT\go-minning` (root), `current-client`, or `current-admin-backend`.
- Historical worktree directories (`fix-SCRUM-*`, `task-*`, `_integration/*`) represent frozen states of previous tasks and do not need to track latest remotes.

### 4.2 Creating a Branch & Worktree for a New Task

Each task (`TASK_ID` / Jira key) must use its own isolated branch and worktree under `_worktrees/`:

1. Fetch latest remote references:
   ```powershell
   git -C "Y:\ChatGPT\go-minning" fetch origin
   ```

2. Create a task worktree from the appropriate baseline:
   - **For Client tasks** (based on `origin/main`):
     ```powershell
     git -C "Y:\ChatGPT\go-minning" worktree add -b task/<JIRA-KEY>-<slug> "Y:\ChatGPT\go-minning\_worktrees\task-<JIRA-KEY>-<slug>" origin/main
     ```
   - **For Admin / Backend tasks** (based on `origin/release/pouw-admin-backend`):
     ```powershell
     git -C "Y:\ChatGPT\go-minning" worktree add -b task/<JIRA-KEY>-<slug> "Y:\ChatGPT\go-minning\_worktrees\task-<JIRA-KEY>-<slug>" origin/release/pouw-admin-backend
     ```

3. Configure local environment & verify:
   - Copy the corresponding `.env.local` into the new task worktree (never stage or commit `.env.local`).
   - Run tests, builds, and `git diff --check` inside the task worktree before committing.
   - After the task is independently reviewed and integrated, remove the temporary task worktree:
     ```powershell
     git -C "Y:\ChatGPT\go-minning" worktree remove "Y:\ChatGPT\go-minning\_worktrees\<worktree-name>"
     ```

---

## 5. Available Client Scripts

Run inside `_worktrees/current-client` (or an active Client task worktree):

- `npm run dev -- --port 5175 --strictPort` / `npx vite --host 127.0.0.1 --port 5175 --strictPort` — Start the Vite development server strictly on `http://127.0.0.1:5175`.
- `npm run build` — Type-check (`tsc -b`) and build the production bundle (`vite build`).
- `npm run preview` — Preview the production build locally (`http://127.0.0.1:4174`).
- `npm test` — Execute the Node.js unit and integration test suite (`test/**/*.test.ts`).
- `npm run audit:contamination` — Run the catalog/storefront contamination audit script.

---

## 6. Security Invariants

- **Never commit `.env.local`** to Git.
- **Never commit service-account JSON** credentials, private keys, or tokens.
- **Never expose Firebase Admin SDK credentials** on the Client storefront.
- Keep Client Firebase Web configuration and Backend Firebase Admin server-side credentials strictly separated.
