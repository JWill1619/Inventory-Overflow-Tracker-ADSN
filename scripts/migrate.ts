import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.ADMIN_DATABASE_URL)
    throw new Error(
      "Set ADMIN_DATABASE_URL to the migration administrator connection.",
    );
  const client = new Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "require"
        ? { rejectUnauthorized: true }
        : false,
  });
  await client.connect();
  try {
    await client.query(
      "create table if not exists public.adsn_migrations(name text primary key,applied_at timestamptz default now())",
    );
    await client.query("revoke all on public.adsn_migrations from public");
    for (const name of (await readdir("supabase/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query(
            "select 1 from public.adsn_migrations where name=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      await client.query("begin");
      try {
        await client.query(
          await readFile(`supabase/migrations/${name}`, "utf8"),
        );
        await client.query(
          "insert into public.adsn_migrations(name) values($1)",
          [name],
        );
        await client.query("commit");
        console.log(`Applied ${name}`);
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check administrator connection and SQL migration; no credentials are logged.",
  );
  process.exitCode = 1;
});
