import { beforeAll, afterAll, describe, it, expect } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import argon2 from "argon2";
import { mutate, snapshot } from "../lib/inventory";
import { authenticate, csrf, login, digest } from "../lib/security";
import { db } from "../lib/db";
let pg: EmbeddedPostgres, admin: Client, token: string, dir: string;
const password = "Test-only warehouse password 83729!";
const create = (name: string, quantities = [10, 12, 3], draft = false) =>
  mutate(token, {
    action: "create",
    key: crypto.randomUUID(),
    identifier: name,
    draft,
    lines: quantities.map((quantity, i) => ({
      name: ["NouNou 1L", "Minu 250ml", "OI Oil"][i],
      brand: "Davines",
      quantity,
    })),
  });
async function pallet(id: string) {
  return (await snapshot(token)).pallets.find((p) => p.id === id)!;
}
beforeAll(async () => {
  dir = await mkdtemp(`${tmpdir()}/adsn-test-`);
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "isolated-test",
    port: 55439,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  admin = pg.getPgClient();
  await admin.connect();
  await admin.query(
    await readFile(
      "supabase/migrations/20261013085224_overflow_foundation.sql",
      "utf8",
    ),
  );
  await admin.query("alter role adsn_app password 'isolated-test'");
  await admin.query(
    "insert into adsn.credential(id,password_hash) values(1,$1)",
    [await argon2.hash(password, { type: argon2.argon2id })],
  );
  process.env.DATABASE_URL =
    "postgresql://adsn_app:isolated-test@127.0.0.1:55439/postgres";
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.DATABASE_SSL = "disable";
  token = await login(password);
});
afterAll(async () => {
  await db().end();
  await admin?.end();
  await pg?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
describe("real PostgreSQL security and stock transactions", () => {
  it("rejects unauthenticated reads and writes", async () => {
    await expect(snapshot(undefined)).rejects.toMatchObject({ status: 401 });
    await expect(
      mutate(undefined, {
        action: "create",
        key: crypto.randomUUID(),
        identifier: "Unauthorized",
        draft: false,
        lines: [{ name: "Oil", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects invalid and expired sessions", async () => {
    await expect(authenticate("a".repeat(64))).rejects.toMatchObject({
      status: 401,
    });
    const expired = "b".repeat(64);
    await admin.query(
      "insert into adsn.sessions(token_hash,expires_at) values($1,now()-interval '1 second')",
      [digest(expired)],
    );
    await expect(authenticate(expired)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects missing or wrong CSRF origin/header", () => {
    expect(() =>
      csrf(
        new Request("http://localhost:3000/api/inventory", { method: "POST" }),
      ),
    ).toThrow();
    expect(() =>
      csrf(
        new Request("http://localhost:3000/api/inventory", {
          headers: { origin: "https://evil.example", "x-adsn-request": "1" },
        }),
      ),
    ).toThrow();
    expect(() =>
      csrf(
        new Request("http://localhost:3000/api/inventory", {
          headers: { origin: "http://localhost:3000", "x-adsn-request": "1" },
        }),
      ),
    ).not.toThrow();
  });
  it("creates three products and aggregates shared identities", async () => {
    const a = await create("Three products"),
      b = await create("Same products");
    expect((await pallet(a.palletId)).items).toHaveLength(3);
    expect((await pallet(a.palletId)).items[0].productId).toBe(
      (await pallet(b.palletId)).items[0].productId,
    );
  });
  it("keeps drafts outside active stock and activates with history", async () => {
    const a = await create("Draft", [5], true);
    expect((await pallet(a.palletId)).status).toBe("DRAFT");
    await mutate(token, {
      action: "activate",
      key: crypto.randomUUID(),
      palletId: a.palletId,
      version: 1,
    });
    expect((await pallet(a.palletId)).status).toBe("ACTIVE");
  });
  it("deducts stock and rejects insufficient stock", async () => {
    const a = await create("Take", [10]);
    const p = await pallet(a.palletId);
    await mutate(token, {
      action: "take",
      key: crypto.randomUUID(),
      palletId: p.id,
      productId: p.items[0].productId,
      version: 1,
      quantity: 6,
    });
    expect((await pallet(p.id)).items[0].quantity).toBe(4);
    await expect(
      mutate(token, {
        action: "take",
        key: crypto.randomUUID(),
        palletId: p.id,
        productId: p.items[0].productId,
        version: 2,
        quantity: 5,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("serializes simultaneous deductions without negative inventory", async () => {
    const a = await create("Concurrent", [10]);
    const p = await pallet(a.palletId);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        mutate(token, {
          action: "take",
          key: crypto.randomUUID(),
          palletId: p.id,
          productId: p.items[0].productId,
          version: 1,
          quantity: 7,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await pallet(p.id)).items[0].quantity).toBe(3);
  });
  it("deduplicates concurrent retries and rejects key reuse", async () => {
    const key = crypto.randomUUID(),
      payload = {
        action: "create",
        key,
        identifier: "Retry",
        draft: false,
        lines: [{ name: "OI Oil", quantity: 8 }],
      };
    const [a, b] = await Promise.all([
      mutate(token, payload),
      mutate(token, payload),
    ]);
    expect(a).toEqual(b);
    expect(
      (await snapshot(token)).pallets.filter(
        (p) => p.pallet_identifier === "Retry",
      ),
    ).toHaveLength(1);
    await expect(
      mutate(token, { ...payload, identifier: "Different" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("merges identical products, conserves units, closes source", async () => {
    const a = await create("Source", [4]),
      b = await create("Destination", [8]);
    const p = await pallet(a.palletId);
    await mutate(token, {
      action: "transfer",
      key: crypto.randomUUID(),
      palletId: p.id,
      destinationId: b.palletId,
      version: 1,
      lines: [{ productId: p.items[0].productId, quantity: 4 }],
    });
    expect((await pallet(p.id)).status).toBe("EMPTY");
    expect((await pallet(b.palletId)).items[0].quantity).toBe(12);
  });
  it("rolls back entire transfer when a later line fails", async () => {
    const a = await create("Rollback source", [4, 5]),
      b = await create("Rollback target", [8]);
    const p = await pallet(a.palletId),
      before = await pallet(b.palletId);
    const lines = p.items.map((i, index) => ({
      productId: i.productId,
      quantity: index === 0 ? 1 : 999,
    }));
    await expect(
      mutate(token, {
        action: "transfer",
        key: crypto.randomUUID(),
        palletId: p.id,
        destinationId: b.palletId,
        version: 1,
        lines,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await pallet(p.id)).items).toEqual(p.items);
    expect((await pallet(b.palletId)).items).toEqual(before.items);
  });
  it("records correction reason and closes emptied pallet", async () => {
    const a = await create("Correction", [4]);
    const p = await pallet(a.palletId);
    await mutate(token, {
      action: "correct",
      key: crypto.randomUUID(),
      palletId: p.id,
      productId: p.items[0].productId,
      version: 1,
      quantity: 0,
      reason: "Physical count after replenishment",
    });
    expect((await pallet(p.id)).status).toBe("EMPTY");
    expect(
      (await snapshot(token)).history.find(
        (m) => m.source === "Correction" && m.action_type === "STOCK_ADJUSTED",
      ),
    ).toMatchObject({
      quantity: -4,
      notes: "Physical count after replenishment",
    });
  });
  it("rejects direct unauthorised database reads and immutable-history changes", async () => {
    await admin.query("create role outsider");
    await admin.query("set role outsider");
    await expect(
      admin.query("select * from adsn.pallets"),
    ).rejects.toMatchObject({ code: "42501" });
    await admin.query("reset role");
    await expect(
      db().query("delete from adsn.inventory_movements"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      admin.query("update adsn.inventory_movements set quantity=1"),
    ).rejects.toThrow("Inventory history is immutable");
  });
  it("has database constraints rejecting negative stock", async () => {
    const a = await create("Constraint", [1]);
    await expect(
      admin.query(
        "update adsn.pallet_items set quantity_remaining=-1 where pallet_id=$1",
        [a.palletId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("rotates session identifiers and revokes the prior token", async () => {
    const next = await login(password, token);
    expect(next).not.toBe(token);
    await expect(authenticate(token)).rejects.toMatchObject({ status: 401 });
    token = next;
  });
  it("locks shared login after five failed attempts", async () => {
    for (let i = 0; i < 5; i++)
      await expect(login("wrong-password")).rejects.toMatchObject({
        status: 401,
      });
    await expect(login(password)).rejects.toMatchObject({ status: 429 });
  });
});
