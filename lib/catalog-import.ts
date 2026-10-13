import { parse } from "csv-parse/sync";
import type { Client } from "pg";
import { z } from "zod";
import { normalize } from "./validation";
const rowSchema = z
  .object({
    stock_code: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((s) => s.toUpperCase()),
    short_desc: z.string().trim().min(1).max(160),
  })
  .strict();
export function parseCatalog(source: string) {
  const rows = z
    .array(rowSchema)
    .min(1)
    .max(50000)
    .parse(
      parse(source, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        max_record_size: 8192,
      }),
    );
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.stock_code))
      throw new Error(
        `Duplicate stock code ${row.stock_code}. Import cancelled.`,
      );
    seen.add(row.stock_code);
  }
  return rows;
}
export async function importCatalog(client: Client, source: string) {
  const rows = parseCatalog(source);
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(74102)");
    for (const row of rows)
      await client.query(
        `insert into adsn.products(stock_code,name,normalized_name) values($1,$2,$3) on conflict(stock_code) where stock_code is not null do update set name=excluded.name,normalized_name=excluded.normalized_name,updated_at=now() where adsn.products.name is distinct from excluded.name`,
        [row.stock_code, row.short_desc, normalize(row.short_desc)],
      );
    await client.query("commit");
    return rows.length;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}
