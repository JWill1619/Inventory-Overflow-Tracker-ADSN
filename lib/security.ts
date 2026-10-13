import "server-only";
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { PoolClient } from "pg";
import { db, config } from "./db";
import { AppError } from "./validation";
export const cookieName = "adsn_session";
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function csrf(request: Request) {
  if (
    request.headers.get("origin") !== new URL(config().APP_ORIGIN).origin ||
    request.headers.get("x-adsn-request") !== "1"
  )
    throw new AppError(
      403,
      "This request could not be verified. Reload and try again.",
    );
}
export async function authenticate(
  token: string | undefined,
  client?: PoolClient,
) {
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new AppError(401, "Please sign in to continue.");
  const result = await (client ?? db()).query(
    "select id from adsn.sessions where token_hash=$1 and expires_at>now()",
    [digest(token)],
  );
  if (!result.rowCount)
    throw new AppError(401, "Your session has expired. Please sign in again.");
  return result.rows[0].id as string;
}
export async function login(password: string, previous?: string) {
  const client = await db().connect();
  try {
    await client.query("begin");
    // Shared account: global DB-backed limit cannot be bypassed by forged proxy headers.
    await client.query("select pg_advisory_xact_lock(74101)");
    const {
      rows: [attempt],
    } = await client.query(
      "select * from adsn.login_control where id=1 for update",
    );
    if (attempt.locked_until && new Date(attempt.locked_until) > new Date()) {
      await client.query("commit");
      throw new AppError(429, "Unable to sign in. Please try again later.");
    }
    const {
      rows: [credential],
    } = await client.query(
      "select password_hash from adsn.credential where id=1",
    );
    if (!credential)
      throw new AppError(
        503,
        "Company login has not been configured. Contact your supervisor.",
      );
    const valid = await argon2.verify(credential.password_hash, password);
    if (!valid) {
      await client.query(
        "update adsn.login_control set failures=case when window_started<now()-interval '15 minutes' then 1 else failures+1 end, locked_until=case when window_started>=now()-interval '15 minutes' and failures>=4 then now()+interval '15 minutes' else null end,window_started=case when window_started<now()-interval '15 minutes' then now() else window_started end where id=1",
      );
      await client.query("commit");
      throw new AppError(
        401,
        "Unable to sign in. Check the company password or try again later.",
      );
    }
    await client.query(
      "update adsn.login_control set failures=0,locked_until=null,window_started=now() where id=1",
    );
    if (previous)
      await client.query("delete from adsn.sessions where token_hash=$1", [
        digest(previous),
      ]);
    await client.query("delete from adsn.sessions where expires_at<=now()");
    const token = randomBytes(32).toString("hex");
    await client.query(
      "insert into adsn.sessions(token_hash,expires_at) values($1,now()+interval '12 hours')",
      [digest(token)],
    );
    await client.query("commit");
    return token;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
