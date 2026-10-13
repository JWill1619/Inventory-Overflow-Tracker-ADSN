# Local verification — 13 October 2026

The verified user story is: a worker signs in, creates or activates an overflow pallet, searches products, replenishes/corrects/transfers stock, and sees database-confirmed balances on another signed-in device.

| Check                             | Observed result                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ESLint                            | Passed, no errors or warnings                                                                                                  |
| Strict TypeScript                 | Passed                                                                                                                         |
| Unit + integration tests          | 34 passed, including real isolated PostgreSQL tests with the restricted application role and nine pallet-form regression cases |
| Desktop browser scenarios         | 3 passed                                                                                                                       |
| Mobile browser scenarios          | 3 passed, Chromium with iPhone 13 viewport/touch emulation                                                                     |
| Tablet browser scenarios          | 3 passed, Chromium with iPad Mini viewport/touch emulation                                                                     |
| Production build                  | Passed; Next.js app and API routes compiled                                                                                    |
| Client static bundle scan         | Passed; no database URL, password hash, service-role marker or test DB credential found                                        |
| Production dependency audit       | 0 vulnerabilities reported                                                                                                     |
| Full development dependency audit | 5 linked high-severity advisories in the lint dependency chain, documented in SECURITY.md                                      |

Integration assertions cover normalized product identity, duplicate and invalid quantities, correction reasons, self-transfer rejection, unauthenticated reads/writes, invalid/expired sessions, CSRF checks, three-product pallet creation, draft activation, deductions, concurrent write conflict handling, request retry deduplication and mismatched-key rejection, product consolidation, total conservation, automatic source closure, multi-line rollback, audited correction, unauthorized database reads, immutable history, database quantity constraints, session identifier rotation, and shared login lockout.

Browser assertions exercise actual Next.js APIs and the database: login, create, forgiving search, replenish, count correction with confirmation, complete transfer with confirmation, source closure, destination total, history, draft save/edit/activate, directory autocomplete, added stock, cross-context synchronization within ten seconds, CSV download, offline notice, cookie flags, and logout invalidation. Screenshots were inspected at desktop/mobile sizes and horizontal overflow was checked. These tests do not replace physical-device Safari/Android installation testing.

Production acceptance remains incomplete: official logo/PWA icons, a private Supabase deployment, production HTTPS/network policies, real approved-device enrolment and revocation, encrypted scheduled backups, and a restore drill require company assets and infrastructure access. No production deployment or security claim is made.

Follow-up fixes: unused blank product rows are ignored, whole-number decimal notation is accepted, and validation identifies the exact incomplete row. Stock-operation controls now receive focus and scroll into view; merge shows an explanation when no other active destination exists. The merge-panel visibility was verified in the running preview without moving stock. Lint, strict TypeScript, and all 34 unit/integration tests passed again before the initial Git commit.

Stock-code update: the supplied 788-row directory was imported into the local preview with its 307-unit balance unchanged. Source data stays in ignored local storage. Database tests now cover leading-zero codes, quoted CSV commas, duplicate import rejection, idempotent reimport, distinct codes sharing descriptions, official identity enforcement, unified 10+24 unit totals, and audited legacy identity matching without changing total stock.

Current stock-code verification: 38 unit/database tests and four dedicated desktop/mobile browser scenarios passed. The browser scenarios verify official code selection, combined totals, rejection of unselected text, and explicit legacy matching with unchanged pallet units. Lint, strict TypeScript, production build and the client static bundle check also passed.

## Isolated Shelves trial

The verified story is: select an official stock item → review a pallet-to-shelf movement or direct delivery → authenticated API → atomic immutable movement → searchable shelf totals beside current overflow. The original preview database is not migrated.

- 42 unit/real-PostgreSQL tests passed, including shelf grouping by code, UTC date boundaries, draft exclusion, direct-delivery validation, retry deduplication, stale/overdrawn movement rejection, empty-pallet closure, and immutable history permissions.
- Six catalog/shelves browser scenarios passed on desktop and mobile. Shelf scenarios exercise review before mutation, pallet deduction, direct delivery with unchanged overflow, date filters, persistent API records, offline controls, no browser exceptions, and no horizontal overflow.
- Production build (webpack), TypeScript, ESLint and client secret-marker scan passed. Desktop and mobile shelf screenshots were inspected.
- The trial was restored from a consistent private snapshot. Original and trial products, pallets, items, movements and idempotency requests matched before interactive testing. See [SHELVES-TRIAL.md](SHELVES-TRIAL.md) for recovery paths and limitations.
- All nine existing warehouse browser scenarios passed again across desktop, tablet and mobile, including the newly reviewed shelf-movement step, corrections, merges, draft editing and cross-device updates.

Overview product comparison: All products now includes items with shelf records even when their current overflow is zero. Eight catalog/shelves browser scenarios passed on desktop and mobile, including stock-code searches, separate overflow/replenishment figures, date filtering that leaves current overflow unchanged, and opening matching shelf history with filters preserved. Production build, TypeScript, ESLint, and client bundle checks passed. This change adds no database migration and leaves the original preview untouched.
