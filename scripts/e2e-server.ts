// Isolated browser-test infrastructure only; never imported by the application.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readdir, readFile, rm, cp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import argon2 from "argon2";
const appPort = process.env.E2E_PORT ?? "3001";
const dbPort = Number(process.env.E2E_DB_PORT ?? "55440");
const dir = await mkdtemp(`${tmpdir()}/adsn-browser-`);
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "browser-test-only",
  port: dbPort,
  persistent: false,
  onLog: () => {},
  onError: () => {},
});
await pg.initialise();
await pg.start();
const c = pg.getPgClient();
await c.connect();
for (const migration of (await readdir("supabase/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  await c.query(await readFile(`supabase/migrations/${migration}`, "utf8"));
}
await c.query("alter role adsn_app password 'browser-test-only'");
await c.query("insert into adsn.credential(id,password_hash) values(1,$1)", [
  await argon2.hash("Browser test password only 937!", {
    type: argon2.argon2id,
  }),
]);
if (process.env.E2E_CATALOG === "true") {
  const { importCatalog } = await import("../lib/catalog-import");
  await importCatalog(
    c,
    "stock_code,short_desc\n00123,Official shampoo 1L\n00124,Official shampoo 250ml\n",
  );
  const {
    rows: [legacy],
  } = await c.query(
    "insert into adsn.products(name,normalized_name) values('Legacy shampoo name','legacy shampoo name') returning id",
  );
  for (const device of ["desktop", "mobile"]) {
    const {
      rows: [pallet],
    } = await c.query(
      "insert into adsn.pallets(pallet_identifier,status,activated_at) values($1,'ACTIVE',now()) returning id",
      [`Legacy ${device}`],
    );
    await c.query(
      "insert into adsn.pallet_items(pallet_id,product_id,quantity_remaining) values($1,$2,7)",
      [pallet.id, legacy.id],
    );
  }
}
await c.end();
let webDir = process.cwd();
if (process.env.E2E_CATALOG === "true") {
  webDir = await mkdtemp(`${tmpdir()}/adsn-web-`);
  for (const entry of [
    "app",
    "components",
    "lib",
    "public",
    "package.json",
    "tsconfig.json",
    "next.config.ts",
    "postcss.config.mjs",
  ])
    await cp(`${process.cwd()}/${entry}`, `${webDir}/${entry}`, {
      recursive: true,
    });
  await symlink(
    `${process.cwd()}/node_modules`,
    `${webDir}/node_modules`,
    "dir",
  );
}
const server = spawn(
  process.execPath,
  [
    `${process.cwd()}/node_modules/next/dist/bin/next`,
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    appPort,
  ],
  {
    stdio: "inherit",
    cwd: webDir,
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://adsn_app:browser-test-only@127.0.0.1:${dbPort}/postgres`,
      DATABASE_SSL: "disable",
      APP_ORIGIN: `http://127.0.0.1:${appPort}`,
    },
  },
);
let stopped = false;
async function stop() {
  if (stopped) return;
  stopped = true;
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await pg.stop();
  await rm(dir, { recursive: true, force: true });
  if (webDir !== process.cwd())
    await rm(webDir, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
server.on("exit", () => void stop());
