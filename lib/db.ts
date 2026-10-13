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
      ACCESS_MODE: z.enum(["private", "public-login"]).default("private"),
    })
    .parse(process.env);
  if (
    process.env.NODE_ENV === "production" &&
    (!env.APP_ORIGIN.startsWith("https://") ||
      (env.ACCESS_MODE === "private" &&
        env.PRIVATE_ACCESS_CONFIRMED !== "true") ||
      (env.ACCESS_MODE === "public-login" && env.DATABASE_SSL !== "require"))
  )
    throw new Error(
      "Configure HTTPS and the selected deployment access mode. Public-login mode requires database TLS.",
    );
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
