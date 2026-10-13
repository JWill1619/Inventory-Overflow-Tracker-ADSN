# Shelves trial and rollback

**Archived experiment:** the manager confirmed that shelf tracking is not required. The current preview has no Shelves screen; All products now shows an overflow table. The following documents the earlier experiment and its retained recovery setup, not the current UI. Historical records and backups have not been deleted.

The stable checkpoint is Git tag `checkpoint-before-shelves`, commit `e124c06`, pushed to GitHub. It includes the product/quantity alignment fix. The original checkout stays on `main`. Shelves work lives on `codex/shelves-trial` in a separate managed worktree.

## Try the workflow

- Original preview: http://127.0.0.1:3001
- Shelves trial: http://localhost:3003
- Use the existing local preview password. The different hostname keeps browser sessions separate.
- In a pallet, choose **Move to shelves**, enter a quantity, review, then confirm. The stock deduction and its replenishment record commit in one transaction.
- On **Shelves**, search by stock code or description and optionally filter by dates (UTC). **Put onto shelves** is a cumulative movement quantity for that period; **In overflow now** is current stock on active pallets, independent of the date filter.
- **Record direct delivery** is for units delivered straight to shelves. Select an official code, quantity, and delivery reference/note; review and confirm. It does not deduct pallet stock.
- Entries are timestamped when saved. The existing immutable history stores both routes; retries cannot create duplicates.
- Earlier `STOCK_REPLENISHED` entries in the copied database appear as prior shelf replenishments. The original app used that action for taking stock to replenish shelves.

These are replenishment records, not a current shelf balance, sales record, or total-delivery reconciliation. No sales are inferred. Pallet transfers and count corrections are excluded from shelf totals. Confirm the intended workflow with the manager before adopting it. There is no shelf-entry edit/reversal flow in this first trial; do not use this trial as the live record.

## Isolation and saved data

The trial uses its own PostgreSQL cluster on port **55442**. The original preview remains on **55440**. No trial migration is applied to the original database. Tests use disposable databases on other ports.

A consistent, read-only snapshot of all original `adsn` tables was saved before the trial. The snapshot includes sensitive authentication data, is owner-readable only, and is excluded from Git:

- Original checkout: `.local-data/checkpoints/before-shelves.json`
- Trial worktree: `.local-data/shelves-trial/before-shelves.json`

The trial was restored from that snapshot using the two checkpoint migrations, then upgraded with the shelf migration. Products, pallets, balances, movements, and request records were compared to the snapshot and matched. Browser sessions were deliberately not restored. Initial copied state: 788 products, four pallets, nine pallet-item rows, 18 movement rows, five request records.

The trial database persists in `.local-data/shelves-trial/postgres` when the runner stops. Restart from the trial worktree with:

```sh
TRIAL_SOURCE_DATABASE_URL='postgresql://postgres:browser-test-only@127.0.0.1:55440/postgres' npx tsx scripts/shelves-trial.ts
```

These credentials are exclusively for disposable local development. The runner accepts only the known local source endpoint, reads it only when no snapshot exists, and resumes its existing trial database thereafter. It can restore a fresh trial cluster from the saved snapshot even when the source preview is no longer running. Never archive the worktree without separately preserving any trial data you want to keep; ignored local data is not part of Git.

## Roll back the experiment

Return to **http://127.0.0.1:3001**. That original checkout and database were never upgraded by the trial, so no reverse migration or data replacement is needed. Trial actions do not appear there.

Keep or stop the trial runner as desired. Do not merge `codex/shelves-trial` into `main` until the workflow is accepted. The `checkpoint-before-shelves` tag can always be checked out separately to recover the exact stable code. Git does not restore inventory data; preserve the private snapshot with its checkpoint migrations for data recovery.

Do not restore the old snapshot over newer live data: that would discard later activity. This trial's rollback relies on isolation, not on overwriting the current original database. The local snapshot is a recovery copy, not an off-device production backup.
