# Public browser pilot

The owner approved Supabase Cloud in the **daiotaio labs** organization and access from any browser through the shared application login. This explicitly replaces the approved-device-only requirement for this pilot. Ownership, hosting accounts and billing stay with the owner. The company's existing website need not be changed.

## Proposed services

- Supabase Free: a new `ADSN Overflow Tracker` project, preferably London (`eu-west-2`), in `daiotaio labs`.
- Render Free Node web service: the repository's `render.yaml` pins the free service plan, Frankfurt region, and current reviewed branch. Automatic deployments are off.
- Start with the official product directory and no practice pallets, sessions, or movement history. Import from the privately held CSV after the database is provisioned; it must not enter Git or public assets.

Current status: Supabase Free project `gulnvulfwbaoujkknnqg` is provisioned in daiotaio labs (Ireland, eu-west-1). All three migrations and the 788-item directory are applied; pallets and movement history started empty. Security advisors reported no findings. The restricted application role has been verified through the session pooler with TLS certificate validation. Render Free service `srv-db7ajc2d0e5s73ft4qhg` is deployed at https://adsn-overflow-tracker.onrender.com. Live verification passed: health 200, unauthenticated inventory 401, company login 200, secure/HttpOnly/SameSite cookie, authenticated inventory with 788 products and zero pallets/history, CSRF rejection 403, and logout 200. The browser login page was also verified. Stock mutation workflows have not yet been exercised against the live database; perform a supervised pilot before relying on it for daily stock.

## Provision and connect

1. Create the new Free project in the Supabase dashboard and save the database password in a password manager. Check the creation screen shows the Free plan before submitting.
2. Apply the repository migrations to this new empty project. Keep `adsn` outside exposed API schemas. Verify its RLS policies and restricted `adsn_app` grants, then run security advisors.
3. Set a strong, unique password on the restricted `adsn_app` database role. The web server must not use the postgres/admin role. Use the Supabase Connect panel's session-pooler connection details when the host requires IPv4; verify custom-role routing and certificate validation with an actual connection before deployment.
4. Import the stock directory with the supervisor-only import command. Set a fresh company app password with `scripts/rotate-password.ts`; the local test password is not the public pilot password. Administrative connection details are used only for setup, never added to the Render runtime.
5. Sign into Render under the owner's account, connect the GitHub repository and create a Blueprint from `codex/shelves-trial`. Confirm the web service is Free. Set `DATABASE_URL` to the restricted-role connection and `APP_ORIGIN` to the exact assigned HTTPS service origin, without a trailing slash. Both are supplied in the hosting dashboard, not committed to Git.
6. The blueprint sets `ACCESS_MODE=public-login` and `DATABASE_SSL=require`. HTTPS and database TLS are required in this mode. The original private mode remains the default when `ACCESS_MODE` is absent; its network-confirmation guard is not spoofed for the public pilot.
7. Verify sign-in, bad-password throttling, secure cookies, unauthenticated API rejection, CSRF rejection, product lookup, pallet creation, deduction, concurrent updates, and history against the deployed database. The health endpoint confirms process availability only, not database readiness. Verify balances separately before accepting the pilot.
8. Set up off-device database backups and a restore drill before relying on the pilot for actual stock. Preserve the existing local preview and checkpoint for comparison; do not copy test balances into live inventory.

## Pilot limits

Render Free sleeps after 15 minutes without inbound traffic and may take time to wake. Supabase Free may pause projects after a low-activity period and has quota limits. Treat this as a feasibility pilot, not an uptime guarantee. Do not purchase paid upgrades without owner approval.

References: [Render Free](https://render.com/docs/free), [Render Next.js](https://render.com/docs/deploy-nextjs-app), [Render Blueprint reference](https://render.com/docs/blueprint-spec), [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Database certificate

The public Supabase root certificate in `certificates/supabase-ca.crt` was downloaded from the project dashboard’s official certificate link. `NODE_EXTRA_CA_CERTS=./certificates/supabase-ca.crt` adds this trust root while retaining certificate and hostname verification. It contains no private key or secret. Source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
