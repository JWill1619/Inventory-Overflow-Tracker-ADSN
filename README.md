# ADSN Solutions Overflow Pallet Tracker

A mobile-first Next.js application for overflow stock only. The shared company login opens a master board of active pallets and products. Drafts are excluded from confirmed stock. Workers can replenish, add, correct, and consolidate stock; every confirmed stock change creates immutable history.

## Current delivery status

The application, migrations, real PostgreSQL integration tests, browser tests and deployment runbook are included. **No production infrastructure has been deployed or verified.** The official logo was not included with the brief: add the original image to `public/adsn-logo.webp`. Until then the interface uses plain company text, and the manifest icon cannot pass installation acceptance. No substitute logo is generated.

Prerequisites: Node.js 22.13+ or 24 LTS, npm, and an accessible PostgreSQL database (preferably private self-hosted Supabase). For production also provision an approved company server, Tailscale, DNS/TLS, a secret store, and encrypted backup storage. Docker is optional for deployment; the automated tests start a real isolated PostgreSQL binary without Docker.

## Local setup

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local`. Set `ADMIN_DATABASE_URL` to the administrator connection for an **empty development database**. Keep `DATABASE_SSL=require` for remote connections with a trusted certificate; `disable` is for local development only. Set `APP_ORIGIN` to the exact browser origin (for example `http://localhost:3000`).
3. Run `npm run db:migrate`. The migration creates the private `adsn` schema and the `adsn_app` login role, with **no default database password**.
4. Using a trusted SQL administrator session, set a strong, unique password on the `adsn_app` role (`\password adsn_app` in psql avoids command history). Set `DATABASE_URL` to that restricted role. Never run the application using the administrator role.
5. Set the shared company password. In zsh, use a hidden prompt so the password is never in command history or arguments:

   ```zsh
   read -rs 'adsn_company_password?New company password: '
   printf '%s' "$adsn_company_password" | npm run password:rotate
   unset adsn_company_password
   ```

   Use a unique password of 16–256 characters with at least eight distinct characters, ideally a password-manager-generated passphrase. This hashes with Argon2id (64 MiB, three passes), resets lockout and revokes all existing sessions. The command needs the admin connection. Do not leave `ADMIN_DATABASE_URL` in the production web-process environment.

6. Add the supplied official logo at `public/adsn-logo.webp` without altering it.
7. Run `npm run dev`, then open the printed local URL. Login with the password you just set. No VPN is required locally.

Do not use an existing warehouse database for development. The app has no hardcoded company password, demo bypass or fallback storage. An unconfigured database displays a setup/unavailable message.

## Verification commands

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run check:bundle
npm audit --omit=dev
```

`npm test` creates an isolated temporary PostgreSQL database on port 55439 and exercises the real migration and restricted application role. Browser tests use a second isolated database on port 55440 and an actual Next.js server on port 3001. Test-only credentials are confined to test infrastructure; they are never inserted by deployment migrations. Test databases are removed on shutdown. Stop any process already using these ports first. The first browser run downloads Chromium.

No inventory seed runs automatically. Tests construct explicit sample records; a fresh application database starts empty. You may use the UI to create test stock on a development database. Do not seed fictional inventory into production.

## Architecture

- `app/api/session`: shared login, logout, session status; HTTP-only, SameSite Strict, 12-hour opaque cookies. Secure cookies are mandatory in production. Server stores only SHA-256 hashes of cryptographically random session tokens. Login replaces the previous session.
- `lib/security.ts`: session validation, exact Origin plus custom-header CSRF checks, a serialized database-backed shared-account login limit (five failed attempts per 15-minute window, followed by 15-minute lockout). A shared global lockout is intentionally resistant to spoofed client IP headers but can temporarily block all devices; supervisors can reset it by rotating the password.
- `lib/inventory.ts`: central trusted server operations. Parameterized SQL, Zod validation, transactional writes, version conflicts, retry payload hashes, and a database transaction lock across all stock changes. This simple serialization is appropriate for a small warehouse; measure lock wait time before scaling. No browser connection to Supabase or privileged client credentials.
- Private `adsn` schema: normalized products, immutable pallet UUIDs, unique live pallet names, one balance per pallet/product, grouped immutable movements, unique request keys, credential, hashed sessions, and login controls. Official products have a unique stock-code identity; legacy free-text records normalize whitespace/case with brand as part of their identity. Sizes and distinct codes remain separate. The server role has no schema administration or history deletion privilege. RLS permits only the restricted trusted server role; anonymous/client roles have no schema privileges.
- Full snapshots use a repeatable-read transaction. Authorized clients refresh every five seconds and on focus/reconnection. There is no public Realtime subscription. Stock writes are online only; failed transactions are rolled back and reported. Retry keys persist in memory for an ambiguous response so retrying the same form cannot duplicate stock.
- A zero balance stays in database history but leaves active contents; an empty pallet closes. Adding stock to an empty pallet reopens its UUID, subject to unique active names. Correct-to-zero errors can be recovered with an audited stock addition; no history is overwritten.
- Before a master list is configured, directory entries can be created through authenticated pallet/add-stock operations. Once official codes are imported, those operations require selection from the master list. There is no product deletion or worker identity system.
- Service worker caches only the public offline page, not API responses, login pages, or inventory. The manifest supports standalone mode and safe-area layout. Browser authentication and the private network remain independent controls.

Search currently filters the authenticated snapshot in memory for immediate case/space-insensitive product, brand and pallet matching. Database indexes support status, product joins, identity and history access; no unbounded database substring query runs per keystroke. The snapshot includes full history, suitable for this MVP. For a large archive, add cursor-paginated history and indexed server search before performance degrades.

## Production

Read [the deployment and recovery runbook](docs/DEPLOYMENT.md) and [the security checklist](docs/SECURITY.md). Build with `npm run build`. The production process refuses database access unless `APP_ORIGIN` is HTTPS and `PRIVATE_ACCESS_CONFIRMED=true`; that flag is an operator attestation, **not a network firewall**. Configure and verify the network first. `npm start` binds to loopback by default. Never publish this service to a public platform without an approved authenticated gateway design.

## Troubleshooting

- **Company login has not been configured:** run the supervisor password command against the correct admin database.
- **Unable to sign in / try later:** check the company password; wait 15 minutes after lockout or ask a supervisor to rotate it. No public reset route exists.
- **Request could not be verified:** the browser's scheme, hostname and port must exactly match `APP_ORIGIN`; check proxy configuration.
- **Server unavailable:** check database reachability, role password, TLS certificates, migrations, and environment validation. API logs deliberately omit connection strings, passwords and query parameters.
- **Pallet changed on another device:** review refreshed balances, cancel and reopen the stock operation, then submit again. Corrections retain the version from when the form opened.
- **Duplicate product/name:** combine duplicate lines; include the precise product size and brand. Choose a different live pallet identifier.
- **Offline warning:** reconnect to the private company network and retry. Nothing is queued for later mutation.
- **Missing install icon:** supply the official logo and validate its dimensions and icon compatibility on actual iOS/Android devices. Do not replace it with generated artwork.
- **Browser test port collision:** stop only your existing test server on 3001 / 55440, then rerun.

Technical references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres). The implementation uses native PostgreSQL rather than a public Data API.

## Official stock-code master list

Run `npm run db:migrate` before importing. From an authorized supervisor shell with the admin database connection set, use:

```sh
npm run products:import -- "/absolute/path/to/Stock_Item_Export (45).csv"
```

The CSV must contain exactly `stock_code,short_desc`. Codes are treated as text (leading zeroes are preserved), trimmed and uppercased; duplicate codes and missing descriptions reject the whole import. Quoted commas are supported. Reimporting updates descriptions under the same UUID and never creates balances, alters pallet quantities or deletes absent products. Identical descriptions under different codes remain separate products. No source CSV is embedded in the browser bundle, migrations or public assets. Keep company exports in an ignored local directory such as `.local-data/`, not source control.

Once the directory has official codes, new stock must select an official product from autocomplete. Search supports code or description and keyboard arrow/Enter selection. The server resolves the submitted UUID to the official product and rejects free-text creation or legacy/unrecognized IDs; it never trusts typed descriptions as identity. The existing All products view combines units across pallets using that stable identity. Codes appear in search, details, transfers, history and CSV exports.

Existing free-text records remain visibly **Unlinked legacy item**. To reconcile them, open their pallet, select **Match to master list**, choose the exact official code/description/size, review, and confirm. The transaction moves that item's entire recorded balance on this pallet into the selected official identity (combining with any existing balance). It records two grouped stock-adjustment events with an identity-correction reason; total units are conserved and old history remains intact. Other pallets are not automatically relabelled. This requires a human identity check, not fuzzy matching. Old drafts must select official items before activation.

The supplied export contains stock identities, not rack/shelf addresses. Stock codes help workers identify the matching shelf item; the app does not infer shelf locations.

Catalog browser regression suite: `npx playwright test --config playwright.catalog.config.ts`. It uses an isolated temporary application checkout and PostgreSQL on ports 3002/55441, so it can run while the interactive preview is open. It uses synthetic products; the company CSV is never needed for tests.

## Shelves trial

The `codex/shelves-trial` branch adds a shelf replenishment page, direct-to-shelf delivery records, and reviewed pallet-to-shelf moves. It is an isolated experiment awaiting workflow confirmation, not a live shelf stock balance. See [the trial and rollback guide](docs/SHELVES-TRIAL.md). The stable Git checkpoint is `checkpoint-before-shelves`.
