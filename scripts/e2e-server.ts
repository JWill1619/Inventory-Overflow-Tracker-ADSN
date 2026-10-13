// Isolated browser-test infrastructure only; never imported by the application.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import argon2 from "argon2";
const dir = await mkdtemp(`${tmpdir()}/adsn-browser-`);
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "browser-test-only",
  port: 55440,
  persistent: false,
  onLog: () => {},
  onError: () => {},
});
await pg.initialise();
await pg.start();
const c = pg.getPgClient();
await c.connect();
await c.query(
  await readFile(
    "supabase/migrations/20261013085224_overflow_foundation.sql",
    "utf8",
  ),
);
await c.query("alter role adsn_app password 'browser-test-only'");
await c.query("insert into adsn.credential(id,password_hash) values(1,$1)", [
  await argon2.hash("Browser test password only 937!", {
    type: argon2.argon2id,
  }),
]);
await c.end();
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3001",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL:
        "postgresql://adsn_app:browser-test-only@127.0.0.1:55440/postgres",
      DATABASE_SSL: "disable",
      APP_ORIGIN: "http://127.0.0.1:3001",
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
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
server.on("exit", () => void stop());
