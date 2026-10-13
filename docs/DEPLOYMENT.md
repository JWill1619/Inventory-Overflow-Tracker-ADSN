# Private deployment, devices and recovery

## Preferred topology

Company-approved warehouse device → Tailscale tailnet HTTPS service → loopback Next.js app → private Supabase PostgreSQL.

Use a company-managed Linux VM with Tailscale. Run self-hosted Supabase on that private VM or a separate private network VM. The database must bind only to loopback/private interfaces and must have no public ingress. Expose neither PostgreSQL, Supabase Studio, Kong/Data API, nor the app through public firewall rules. Only the server needs database access. The browser does not need a Supabase API key or Realtime endpoint. If using a separate VM, allow database port 5432 only from the application server's approved identity/private IP and verify TLS certificates.

A standard publicly reachable Supabase Cloud endpoint is **not equivalent to this requirement**. Do not claim that an IP allowlist makes a public endpoint fully private. Using managed cloud instead needs a separately reviewed private connectivity solution or explicit approval of the changed requirement. No cloud project was created by this task.

## Application deployment

1. Provision supported Node.js and private Supabase/PostgreSQL. Apply OS security updates and use a dedicated unprivileged app OS user.
2. Install locked dependencies with `npm ci`, apply migrations using the admin credential, set the restricted `adsn_app` password, and rotate the company login password. Store credentials in the company secret manager.
3. Remove the admin connection from the web service. Inject only `DATABASE_URL`, `DATABASE_SSL`, `APP_ORIGIN` and `PRIVATE_ACCESS_CONFIRMED` via a root-readable service environment file/secret mount. Never put credentials in a Docker image, Git, build arguments or browser variables.
4. Run lint, types, tests, build and bundle check. Install the exact original logo before release and verify the manifest icon on phones. Run `npm start` under a supervisor such as systemd as the app user, working in the deployed project directory. Restart on failure and forward logs to the company log store. Bind to 127.0.0.1:3000.
5. Install Tailscale on the server, require device approval, and give only this server `tag:overflow-server`. Enable tailnet HTTPS. With a current Tailscale CLI, verify `tailscale serve --help`, then configure HTTPS Serve to proxy to `http://127.0.0.1:3000` (commonly `tailscale serve --bg http://127.0.0.1:3000`). **Never use Funnel.** Set `APP_ORIGIN` to the exact returned HTTPS hostname.
6. Replace broad default tailnet allow rules with restrictive company policies. Use explicitly approved, admin-controlled warehouse device tags; do not give workers tag-owner permissions. Limit approved device access to this service on TCP 443. Keep administrator SSH in a distinct rule. Validate both allowed and denied policy tests in the Tailscale admin console.
7. Set `PRIVATE_ACCESS_CONFIRMED=true` only after completing the network checks below, then restart the service. Confirm secure cookie behavior, session timeout, API no-store responses, and login lockout through HTTPS.
8. Remove the original public cloud/VM ingress routes. Do not forward public ports 80, 443, 3000, 5432, or Supabase service ports. Tailnet device-to-device connectivity must not expose the application publicly.

Example policy fragment (merge into and validate the real tailnet policy; remove broad allow-all rules):

```json
{
  "tagOwners": {
    "tag:overflow-server": ["autogroup:admin"],
    "tag:warehouse-device": ["autogroup:admin"]
  },
  "grants": [
    {
      "src": ["tag:warehouse-device"],
      "dst": ["tag:overflow-server"],
      "ip": ["tcp:443"]
    }
  ]
}
```

Do not blindly apply this fragment to an existing corporate tailnet: its admins must retain their required management access. Verify the actual policy syntax and account capabilities in the current admin console before deployment.

## Device enrolment

An administrator installs Tailscale on a company-owned device, enrolls it using company identity or a controlled one-use enrollment key, approves that specific device, assigns the warehouse device tag, and applies device lock/OS update requirements. Do not enable unrestricted autoapproval. Test that it can open the tailnet HTTPS URL and authenticate with the shared password. Install to the home screen if desired. Record device serial/asset ID and assigned tailnet identity in the company device register; never add this as picker attribution in the inventory app.

## Stolen or retired device

Immediately disable/delete its device record in Tailscale and revoke its node/enrollment keys. Remove its tag access, test that it cannot connect, and update the device register. Rotate the shared password using `npm run password:rotate` to revoke **all** application sessions, including that device's copied cookies. Redistribute the new password securely to approved devices. If database or host credentials may be compromised, rotate them too and investigate immutable history plus infrastructure logs.

## Password rotation

Run the hidden-input procedure in README from an authorized administrator shell connected to the private database. It hashes with Argon2id, changes the one credential row, revokes all sessions transactionally and resets the login lockout. Active users must sign in again. Back up and secure the admin credential; never create an unauthenticated reset endpoint. Expired sessions are removed on successful login.

## Backup and recovery

Set a company-approved RPO/RTO (for example, hourly recovery points and a four-hour restore objective). Use Supabase's documented self-hosted database backup procedures, or native PostgreSQL `pg_dump` plus WAL archiving/PITR appropriate to the deployment. A nightly logical dump alone does not meet an hourly RPO.

- Schedule encrypted logical backups using `pg_dump --format=custom --schema=adsn`, with credentials from a protected `.pgpass` or secret manager, not command-line passwords. Separately save role grants/migration versions and operational configuration. Protect password hashes and sessions as sensitive data.
- Keep backups off the application host, encrypted, access-controlled and versioned. Define retention (such as 30 daily and 12 monthly copies). Alert on backup failures and stale backups.
- For point-in-time recovery, configure and test continuous WAL archival/full base backups using a supported tool such as pgBackRest on the private database host. Record restore points and encryption keys separately.
- Quarterly, restore to an isolated private database using `pg_restore` under an administrator. Apply matching migrations/roles, revoke all restored sessions, rotate the company password and run consistency checks. Verify every active pallet total equals its item sum, no quantities are negative, and recent movements correspond to physical counts.
- Before actual recovery, stop application writes, preserve the current failed database for investigation, restore the chosen backup/PITR target, reset sessions, verify totals with a supervisor, switch the restricted application connection, and reopen access.
- Document the time restored to. Warehouse movements after that point require supervised physical reconciliation recorded as new correction events. Never silently replay uncertain transactions or rewrite history.

## Alternative hosting

If this topology cannot be supported, prepare a concrete zero-trust authenticated gateway architecture and obtain company approval **before production deployment**. Require managed-device posture/approval, prevent direct-origin bypass, protect every route/API path, enforce HTTPS, and retain the shared application login. Public application authentication alone does not restrict access to employees or approved devices. No alternative has been deployed or approved here.

A systemd unit is supplied at `deploy/adsn-overflow.service`. Adjust the npm path to the host's installation, create the unprivileged `adsn` OS account and deployment directory, and provision `/etc/adsn-overflow.env` as a root-owned mode-0600 file through the company secret manager. Enable the unit only after the private ingress checks above. Keep database administration credentials out of that file. `ProtectSystem` grants the application write access only to its Next.js build/cache directory.
