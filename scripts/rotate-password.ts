import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import argon2 from "argon2";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.ADMIN_DATABASE_URL)
    throw new Error("Set ADMIN_DATABASE_URL.");
  if (process.stdin.isTTY)
    throw new Error(
      "Read the password from a secret manager or hidden shell prompt and pipe it through stdin. See README.",
    );
  let password = "";
  for await (const chunk of process.stdin) {
    password += chunk;
    if (password.length > 258) throw new Error("Password too long.");
  }
  password = password.replace(/\r?\n$/, "");
  if (
    password.length < 16 ||
    password.length > 256 ||
    new Set(password).size < 8
  )
    throw new Error(
      "Use a unique company password of 16–256 characters with at least 8 different characters.",
    );
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  password = "";
  const c = new Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "require"
        ? { rejectUnauthorized: true }
        : false,
  });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(74101)");
    await c.query("select pg_advisory_xact_lock(74102)");
    await c.query(
      "insert into adsn.credential(id,password_hash) values(1,$1) on conflict(id) do update set password_hash=$1,rotated_at=now()",
      [hash],
    );
    await c.query("delete from adsn.sessions");
    await c.query(
      "update adsn.login_control set failures=0,locked_until=null,window_started=now() where id=1",
    );
    await c.query("commit");
    console.log("Company password changed. All sessions revoked.");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
main().catch((e) => {
  console.error(
    e instanceof Error && !("code" in e)
      ? e.message
      : "Password rotation failed. Check administrator connection.",
  );
  process.exitCode = 1;
});
