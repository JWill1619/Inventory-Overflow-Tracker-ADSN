import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { importCatalog } from "../lib/catalog-import";
loadEnvConfig(process.cwd());
async function main() {
  const path = process.argv[2];
  if (!path)
    throw new Error(
      "Usage: npm run products:import -- /absolute/path/to/stock-items.csv",
    );
  if (!process.env.ADMIN_DATABASE_URL)
    throw new Error("Set ADMIN_DATABASE_URL for this supervisor-only import.");
  const source = await readFile(path, "utf8");
  const c = new Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "require"
        ? { rejectUnauthorized: true }
        : false,
  });
  await c.connect();
  try {
    const count = await importCatalog(c, source);
    console.log(
      `Imported ${count} official stock items. Pallet balances and history were not changed.`,
    );
  } finally {
    await c.end();
  }
}
main().catch(() => {
  console.error(
    "Directory import failed; nothing was imported. Check CSV headers, unique stock codes, descriptions, and administrator database access.",
  );
  process.exitCode = 1;
});
