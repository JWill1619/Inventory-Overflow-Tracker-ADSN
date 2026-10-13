import "server-only";
import { Pool } from "pg";
import { z } from "zod";
let pool: Pool | undefined;
export function config() {
  const env = z
    .object({
      DATABASE_URL: z.string().startsWith("postgres"),
      APP_ORIGIN: z.url(),
      DATABASE_SSL: z.enum(["require", "disable"]).default("require"),
      PRIVATE_ACCESS_CONFIRMED: z.string().optional(),
    })
    .parse(process.env);
  if (
    process.env.NODE_ENV === "production" &&
    (!env.APP_ORIGIN.startsWith("https://") ||
      env.PRIVATE_ACCESS_CONFIRMED !== "true")
  )
    throw new Error("Private HTTPS deployment must be configured.");
  return env;
}
export function db() {
  const env = config();
  return (pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    ssl: env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : false,
  }));
}
