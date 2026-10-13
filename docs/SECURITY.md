# Deployment acceptance checklist

Do not describe the system as fully secure until its real environment is verified.

- [ ] Official original logo installed, and manifest/home-screen icons tested on iOS and Android.
- [ ] Company approves private host, private Supabase topology, device policy and backup recovery objectives.
- [ ] App is unreachable from a non-tailnet device and the public internet, including origin IP/ports.
- [ ] PostgreSQL and every Supabase service are unreachable publicly.
- [ ] An unapproved tailnet device cannot connect; an approved warehouse device can.
- [ ] Tailscale Funnel is disabled; broad default allow rules removed; admin/device grants reviewed.
- [ ] Node and database OS dependencies are patched and monitored.
- [ ] `adsn` is NOT an exposed Supabase Data API schema. Anonymous/authenticated roles have no grants on it.
- [ ] App runs as `adsn_app`, never postgres/superuser; no admin database URL exists in its runtime.
- [ ] Shared password is unique and strong; supervisor rotation revokes an existing live session.
- [ ] HTTP-only, Secure, SameSite Strict cookies verified through production HTTPS, along with expiration and logout.
- [ ] Missing/invalid session rejects inventory, history, export and stock operations.
- [ ] Cross-origin requests are rejected and `APP_ORIGIN` matches the exact HTTPS service.
- [ ] Lockout verified through actual proxy topology; no client IP header is trusted for bypassing it.
- [ ] Concurrent deduction and retry tests pass against target PostgreSQL version.
- [ ] Failed multi-item transfer leaves both pallets unchanged; quantities conserved after merge.
- [ ] Backup restore drill completed; restored sessions revoked before service resumes.
- [ ] No credentials or inventory in static assets/service-worker caches; bundle scan passes.
- [ ] Device revocation practiced and old copied sessions invalidated by password rotation.
- [ ] Five-second synchronization and loss/reconnect tested with two physical devices.
- [ ] Dependency advisories reviewed and deployment approved with documented residual risks.

## Known boundaries and residual risks

The application deliberately uses a shared account and cannot attribute actions to individual workers. Anyone holding the company password on an approved device can change stock. The audit log is immutable to the app role; a database administrator remains able to change database schema or disable triggers, so infrastructure-level backups and log access controls matter.

Stock operations serialize through one advisory transaction lock. This favors correctness at warehouse scale over write throughput. Each open browser currently fetches a full inventory/history snapshot every five seconds; a large deployment requires cursor pagination and server-indexed search. Data APIs and public Realtime are unused.

The content security policy disallows foreign resources and framing but currently permits inline scripts/styles required by the Next.js shell. Nonce-based script CSP would further harden against XSS; no raw user HTML is rendered. Password requests are bounded by Zod, but the reverse proxy should also impose a request body limit (64 KiB) and connection rate limits against resource exhaustion. Do not enable proxy body logging.

At implementation time, `npm audit` reported five linked high-severity advisories in the **development-only** Next ESLint / fast-glob / micromatch / braces chain (GHSA-vfj7-8cjw-p6xm). The registry offered no patched braces release; the proposed automatic fix downgraded Next ESLint to an old major and was not applied. Production dependency audit is recorded in the verification report. Avoid linting untrusted glob patterns and reassess before CI adoption.

An operator setting `PRIVATE_ACCESS_CONFIRMED=true` does not prove network privacy. No production host, device policy, real Supabase project, network scan, backups, TLS certificate, or official logo has been provided or verified by this implementation.
