# Runbook: Admin Auth allowlist runtime

## Authority

The production-like Admin/Backend authorization authority is Firestore
collection `/admin_users` when:

```text
ADMIN_ALLOWLIST_SOURCE=firestore
```

The canonical document for a bound Firebase identity is
`/admin_users/{firebaseUid}`. It must declare `role: "admin"`. A verified
Firebase ID token is still required; the allowlist does not replace Firebase
Admin Auth verification.

Legacy email compatibility is read-only: when the exact UID document is
absent, one and only one unbound admin document with the normalized verified
email may authorize. Ambiguous, bound, malformed, or non-admin records deny
authorization. The backend never writes during authentication.

## Firebase Admin credentials

Choose one server-side credential mode for the runtime. The named Firebase
Admin app is `minerx-backend-admin` and the default project is `salad-miners`.

### Managed Google runtime

Cloud Run, Google Cloud, and Firebase-managed runtimes should use the runtime
service identity with Application Default Credentials (ADC). No credential
file or `GOOGLE_APPLICATION_CREDENTIALS` path is required. The service
identity must have the minimum IAM permissions needed for Firebase Auth and
Firestore.

### Generic hosting

Configure the provider's secret manager once with a server-only secret:

```text
FIREBASE_SERVICE_ACCOUNT_BASE64=<secret>
```

The backend decodes and parses this value in memory and uses it only in the
Node runtime. Subsequent automatic deploys reuse the provider secret; no
PowerShell environment assignment is required.

### Local development

For local development, `GOOGLE_APPLICATION_CREDENTIALS` may point to an
external service-account file. The file must remain outside source control.

Never commit service-account JSON, bake it into a Docker image, or put any
credential in a `VITE_*` variable. Credentials must not be returned in HTTP
responses or printed in logs.

## Provisioning

Use the supported external Firebase credential mechanism for the environment.
Do not place a service-account JSON file in the repository, worktree, test
fixture, or runbook, and do not print its contents or path.

The canonical command is run only after the Firebase identity already exists:

```text
npm run admin:provision -- --authority=firestore --uid <firebase-uid>
```

An approved, verified email may be used instead:

```text
npm run admin:provision -- --authority=firestore --email <verified-admin-email>
```

The command verifies the identity through Firebase Admin Auth, requires the
admin role, and idempotently merges the real UID, normalized email, role, and
display name into `/admin_users/{realUid}`. It does not write `users.json` in
Firestore authority mode. `--dry-run` validates the identity without writing.

After provisioning, restart the backend with the same explicit runtime
environment. Do not use audit or audit-repair endpoints as an allowlist
bootstrap mechanism; they remain protected endpoints and do not mutate
authorization state.

## Runtime outcomes

- `200`: the Firebase ID token is valid and the user is an approved Firestore
  admin.
- `401`: the token is missing, invalid, expired, not allowlisted, has a role
  other than `admin`, has a conflicting UID binding, or has no unique legacy
  email match.
- `503` with code `ADMIN_ALLOWLIST_UNAVAILABLE`: Firebase Admin Auth or the
  Firestore allowlist authority is unavailable. This is infrastructure
  failure, not authorization approval.

The frontend retains the candidate session during the safe mount-time `503`
and shows an infrastructure message. A `401` clears the session. A valid
Firebase token plus a newly available allowlist can therefore be retried in
the same running process without weakening fail-closed behavior.

## Safety

Never copy historical `users.json` data into Firestore as an audit repair.
Never copy service-account JSON, passwords, ID tokens, real identity values,
or machine-specific credential paths into source control, tests, logs, or this
runbook. No production data writes are part of this runbook.
