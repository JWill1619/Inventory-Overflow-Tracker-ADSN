import { beforeAll, afterAll, describe, it, expect } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
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
async function pallet(id: string | null) {
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
  for (const migration of (await readdir("supabase/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await admin.query(
      await readFile(`supabase/migrations/${migration}`, "utf8"),
    );
  }
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

it("imports official codes without changing stock, preserves identities, and enforces selection", async () => {
  const { importCatalog } = await import("../lib/catalog-import");
  const before = await snapshot(token);
  const originalUnits = before.pallets.reduce(
    (s, p) => s + p.items.reduce((n, i) => n + i.quantity, 0),
    0,
  );
  const legacyPallet = await create("Legacy matching", [7]);
  const legacyItem = (await pallet(legacyPallet.palletId)).items[0];
  const csv =
    "stock_code,short_desc\n00123,Official shampoo 1L\n00124,Official shampoo 1L\n";
  expect(await importCatalog(admin, csv)).toBe(2);
  const imported = await snapshot(token);
  expect(
    imported.pallets.reduce(
      (s, p) => s + p.items.reduce((n, i) => n + i.quantity, 0),
      0,
    ),
  ).toBe(originalUnits + 7);
  const a = imported.products.find((p) => p.stockCode === "00123")!;
  const b = imported.products.find((p) => p.stockCode === "00124")!;
  expect(a.id).not.toBe(b.id); // Identical descriptions are not enough to merge codes.
  await importCatalog(admin, csv);
  expect(
    (await snapshot(token)).products.find((p) => p.stockCode === "00123")?.id,
  ).toBe(a.id);
  const first = await mutate(token, {
    action: "create",
    key: crypto.randomUUID(),
    identifier: "Coded A",
    draft: false,
    lines: [{ productId: a.id, name: "A typed variation", quantity: 10 }],
  });
  const second = await mutate(token, {
    action: "create",
    key: crypto.randomUUID(),
    identifier: "Coded B",
    draft: false,
    lines: [{ productId: a.id, name: "Another variation", quantity: 24 }],
  });
  expect((await pallet(first.palletId)).items[0]).toMatchObject({
    productId: a.id,
    name: "Official shampoo 1L",
    stockCode: "00123",
    quantity: 10,
  });
  expect((await pallet(second.palletId)).items[0].productId).toBe(a.id);
  expect(
    (await snapshot(token)).pallets
      .flatMap((p) => p.items)
      .filter((i) => i.productId === a.id)
      .reduce((s, i) => s + i.quantity, 0),
  ).toBe(34);
  await expect(
    mutate(token, {
      action: "create",
      key: crypto.randomUUID(),
      identifier: "Unselected",
      draft: false,
      lines: [{ name: "Official shampoo 1L", quantity: 2 }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    mutate(token, {
      action: "create",
      key: crypto.randomUUID(),
      identifier: "Forged ID",
      draft: false,
      lines: [
        {
          productId: crypto.randomUUID(),
          name: "Official shampoo 1L",
          quantity: 2,
        },
      ],
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    mutate(token, {
      action: "create",
      key: crypto.randomUUID(),
      identifier: "Duplicate code",
      draft: false,
      lines: [
        { productId: a.id, name: "One", quantity: 2 },
        { productId: a.id, name: "Two", quantity: 4 },
      ],
    }),
  ).rejects.toThrow();
  await expect(
    importCatalog(
      admin,
      "stock_code,short_desc\n00123,Changed\n00123,Duplicate\n",
    ),
  ).rejects.toThrow("Duplicate stock code");
  expect(
    (await snapshot(token)).products.find((p) => p.id === a.id)?.name,
  ).toBe("Official shampoo 1L");
  await importCatalog(
    admin,
    "stock_code,short_desc\n00123,Official shampoo revised description\n",
  );
  expect((await pallet(first.palletId)).items[0]).toMatchObject({
    productId: a.id,
    quantity: 10,
    name: "Official shampoo revised description",
  });
  const legacyBefore = await pallet(legacyPallet.palletId);
  await mutate(token, {
    action: "link",
    key: crypto.randomUUID(),
    palletId: legacyBefore.id,
    productId: legacyItem.productId,
    officialProductId: a.id,
    version: legacyBefore.version,
  });
  expect((await pallet(legacyBefore.id)).items).toEqual([
    expect.objectContaining({
      productId: a.id,
      stockCode: "00123",
      quantity: 7,
    }),
  ]);
  const linkedEvents = (await snapshot(token)).history.filter(
    (m) =>
      m.source === "Legacy matching" &&
      m.notes?.startsWith("Identity correction:"),
  );
  expect(linkedEvents).toHaveLength(2);
  expect(linkedEvents.reduce((sum, m) => sum + m.quantity, 0)).toBe(0);
  expect(linkedEvents[0].movement_group_id).toBe(
    linkedEvents[1].movement_group_id,
  );
});

it("records direct shelf deliveries once, validates codes, and preserves overflow", async () => {
  const before = await snapshot(token);
  const official = before.products.find((p) => p.stockCode === "00123")!;
  const payload = {
    action: "shelfDelivery",
    key: crypto.randomUUID(),
    productId: official.id,
    quantity: 12,
    reference: "Delivery DN-100",
  };
  await expect(mutate(undefined, payload)).rejects.toMatchObject({
    status: 401,
  });
  const [a, b] = await Promise.all([
    mutate(token, payload),
    mutate(token, payload),
  ]);
  expect(a).toEqual(b);
  expect(a.palletId).toBeNull();
  const after = await snapshot(token);
  expect(after.pallets).toEqual(before.pallets);
  expect(
    after.history.filter((m) => m.action_type === "SHELF_DELIVERY"),
  ).toEqual([
    expect.objectContaining({
      productId: official.id,
      quantity: 12,
      source: null,
      quantity_before: null,
      quantity_after: null,
      notes: "Delivery DN-100",
    }),
  ]);
  await expect(
    mutate(token, { ...payload, quantity: 13 }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    mutate(token, {
      ...payload,
      key: crypto.randomUUID(),
      productId: before.products.find((p) => !p.stockCode)!.id,
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    mutate(token, { ...payload, key: crypto.randomUUID(), quantity: 1.5 }),
  ).rejects.toThrow();
  await expect(
    mutate(token, { ...payload, key: crypto.randomUUID(), reference: " " }),
  ).rejects.toThrow();
  expect(
    (await snapshot(token)).history.filter(
      (m) => m.action_type === "SHELF_DELIVERY",
    ),
  ).toHaveLength(1);
});

it("logs shelf moves atomically, rejects stale/overdrawn moves, and closes empty pallets", async () => {
  const official = (await snapshot(token)).products.find(
    (p) => p.stockCode === "00124",
  )!;
  const created = await mutate(token, {
    action: "create",
    key: crypto.randomUUID(),
    identifier: "Shelf move safety",
    draft: false,
    lines: [{ productId: official.id, name: official.name, quantity: 10 }],
  });
  const payload = {
    action: "take",
    key: crypto.randomUUID(),
    palletId: created.palletId,
    productId: official.id,
    version: 1,
    quantity: 6,
  };
  await Promise.all([mutate(token, payload), mutate(token, payload)]);
  expect((await pallet(created.palletId)).items[0].quantity).toBe(4);
  await expect(
    mutate(token, { ...payload, key: crypto.randomUUID() }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    mutate(token, {
      ...payload,
      key: crypto.randomUUID(),
      version: 2,
      quantity: 5,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await snapshot(token)).history.filter(
      (m) =>
        m.action_type === "STOCK_REPLENISHED" &&
        m.source === "Shelf move safety",
    ),
  ).toHaveLength(1);
  await mutate(token, {
    ...payload,
    key: crypto.randomUUID(),
    version: 2,
    quantity: 4,
  });
  const after = await snapshot(token);
  expect((await pallet(created.palletId)).status).toBe("EMPTY");
  const moved = after.history.filter(
    (m) =>
      m.action_type === "STOCK_REPLENISHED" && m.source === "Shelf move safety",
  );
  expect(moved.reduce((n, m) => n + m.quantity, 0)).toBe(10);
  expect(moved.every((m) => m.productId === official.id)).toBe(true);
  await expect(
    db().query(
      "update adsn.inventory_movements set quantity=1 where action_type='SHELF_DELIVERY'",
    ),
  ).rejects.toMatchObject({ code: "42501" });
});
