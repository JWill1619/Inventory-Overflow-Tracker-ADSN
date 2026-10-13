// Local-only trial: read a snapshot of the existing preview, then use a separate
// persistent PostgreSQL cluster. Never applies migrations to the source.
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { mkdir, readFile, writeFile, readdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const sourceUrl = process.env.TRIAL_SOURCE_DATABASE_URL;
if (!sourceUrl)
  throw new Error(
    "Set TRIAL_SOURCE_DATABASE_URL to the local preview database.",
  );
const source = new URL(sourceUrl);
if (
  source.hostname !== "127.0.0.1" ||
  source.port !== "55440" ||
  source.pathname !== "/postgres"
)
  throw new Error(
    "This trial runner only accepts the original local preview on port 55440.",
  );
const folder = resolve(".local-data/shelves-trial");
await mkdir(folder, { recursive: true, mode: 0o700 });
const snapshotPath = `${folder}/before-shelves.json`;
const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
type Saved = {
  savedAt: string;
  migrations: string[];
  tables: Record<string, Record<string, unknown>[]>;
};
if (!(await exists(snapshotPath))) {
  const c = new Client({ connectionString: sourceUrl });
  await c.connect();
  try {
    await c.query("begin isolation level repeatable read read only");
    const { rows: tables } = await c.query(
      "select tablename from pg_tables where schemaname='adsn' order by tablename",
    );
    const saved: Saved = {
      savedAt: new Date().toISOString(),
      migrations: [],
      tables: {},
    };
    for (const { tablename } of tables) {
      if (!/^[a-z_]+$/.test(tablename))
        throw new Error("Unexpected table name");
      saved.tables[tablename] = (
        await c.query(`select * from adsn."${tablename}"`)
      ).rows;
    }
    await c.query("commit");
    // The source is the pre-shelves checkpoint with these two migrations applied.
    saved.migrations = [
      "20261013085224_overflow_foundation.sql",
      "20261013094409_stock_code_directory.sql",
    ];
    await writeFile(snapshotPath, JSON.stringify(saved, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    console.log(`Saved private pre-trial snapshot: ${snapshotPath}`);
  } finally {
    await c.end();
  }
}
const pg = new EmbeddedPostgres({
  databaseDir: `${folder}/postgres`,
  user: "postgres",
  password: "browser-test-only",
  port: 55442,
  persistent: true,
  onLog: () => {},
  onError: () => {},
});
if (!(await exists(`${folder}/postgres/PG_VERSION`))) await pg.initialise();
await pg.start();
const c = pg.getPgClient();
await c.connect();
try {
  await c.query(
    "create table if not exists public.trial_migrations(name text primary key)",
  );
  await c.query(
    "alter table public.trial_migrations enable row level security",
  );
  await c.query("revoke all on public.trial_migrations from public");
  const { rows: applied } = await c.query(
    "select name from public.trial_migrations",
  );
  if (!applied.length) {
    const saved: Saved = JSON.parse(await readFile(snapshotPath, "utf8"));
    await c.query("begin");
    for (const migration of saved.migrations) {
      await c.query(await readFile(`supabase/migrations/${migration}`, "utf8"));
      await c.query("insert into public.trial_migrations values($1)", [
        migration,
      ]);
    }
    await c.query("truncate adsn.login_control");
    // Foreign keys require products/pallets/requests before their dependent records.
    for (const table of [
      "products",
      "pallets",
      "requests",
      "pallet_items",
      "inventory_movements",
      "credential",
      "login_control",
    ]) {
      await c.query(
        `insert into adsn.${table} select * from json_populate_recordset(null::adsn.${table}, $1::json)`,
        [JSON.stringify(saved.tables[table] ?? [])],
      );
    }
    // Sessions are deliberately not cloned; sign in separately on localhost.
    await c.query("alter role adsn_app password 'browser-test-only'");
    await c.query("commit");
  }
  for (const migration of (await readdir("supabase/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (
        await c.query("select 1 from public.trial_migrations where name=$1", [
          migration,
        ])
      ).rowCount
    )
      continue;
    await c.query("begin");
    await c.query(await readFile(`supabase/migrations/${migration}`, "utf8"));
    await c.query("insert into public.trial_migrations values($1)", [
      migration,
    ]);
    await c.query("commit");
  }
} finally {
  await c.end();
}
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3003",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL:
        "postgresql://adsn_app:browser-test-only@127.0.0.1:55442/postgres",
      DATABASE_SSL: "disable",
      APP_ORIGIN: "http://localhost:3003",
    },
  },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
  await new Promise((done) => setTimeout(done, 500));
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
server.on("exit", () => void stop());
console.log(
  "Shelves trial: http://localhost:3003. Original preview remains on http://127.0.0.1:3001.",
);
