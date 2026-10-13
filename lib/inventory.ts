import "server-only";
import type { Snapshot } from "./types";
import type { PoolClient } from "pg";
import { db } from "./db";
import { authenticate, digest } from "./security";
import { AppError, mutationSchema, normalize } from "./validation";
export async function snapshot(token: string | undefined): Promise<Snapshot> {
  const c = await db().connect();
  try {
    await c.query("begin isolation level repeatable read read only");
    await authenticate(token, c);
    const pallets = (
      await c.query(
        `select p.*,coalesce((select jsonb_agg(jsonb_build_object('productId',r.id,'name',r.name,'brand',r.brand,'quantity',i.quantity_remaining) order by r.name) from adsn.pallet_items i join adsn.products r on r.id=i.product_id where i.pallet_id=p.id and i.quantity_remaining>0),'[]') items from adsn.pallets p order by p.pallet_identifier`,
      )
    ).rows;
    const products = (
      await c.query("select id,name,brand from adsn.products order by name")
    ).rows;
    const history = (
      await c.query(
        `select m.*,r.name product,s.pallet_identifier source,d.pallet_identifier destination from adsn.inventory_movements m left join adsn.products r on r.id=m.product_id left join adsn.pallets s on s.id=m.source_pallet_id left join adsn.pallets d on d.id=m.destination_pallet_id order by m.created_at desc,m.id`,
      )
    ).rows;
    await c.query("commit");
    return { pallets, products, history };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
async function product(c: PoolClient, name: string, brand: string) {
  const {
    rows: [p],
  } = await c.query(
    "insert into adsn.products(name,normalized_name,brand) values($1,$2,$3) on conflict(normalized_name,brand) do update set normalized_name=excluded.normalized_name returning id",
    [name, normalize(name), normalize(brand)],
  );
  return p.id as string;
}
export async function mutate(
  token: string | undefined,
  input: unknown,
): Promise<{ palletId: string; message: string }> {
  const v = mutationSchema.parse(input),
    c = await db().connect();
  try {
    await c.query("begin");
    // One transaction lock for the small warehouse: serializes writes and prevents deadlocks.
    // Every stock operation uses this lock, including draft activation and retried requests.
    await c.query("select pg_advisory_xact_lock(74102)");
    await authenticate(token, c);
    const hash = digest(JSON.stringify(v));
    const {
      rows: [existing],
    } = await c.query("select * from adsn.requests where idempotency_key=$1", [
      v.key,
    ]);
    if (existing) {
      if (existing.payload_hash !== hash)
        throw new AppError(409, "Retry key belongs to a different request.");
      await c.query("commit");
      return existing.response;
    }
    const group = crypto.randomUUID();
    async function event(
      action: string,
      pallet: string,
      productId: string | null = null,
      quantity = 0,
      before: number | null = null,
      after: number | null = null,
      destination: string | null = null,
      notes: string | null = null,
    ) {
      await c.query(
        "insert into adsn.inventory_movements(idempotency_key,movement_group_id,action_type,product_id,source_pallet_id,destination_pallet_id,quantity,quantity_before,quantity_after,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          v.key,
          group,
          action,
          productId,
          pallet,
          destination,
          quantity,
          before,
          after,
          notes,
        ],
      );
    }
    async function balance(pallet: string, productId: string) {
      const {
        rows: [i],
      } = await c.query(
        "select quantity_remaining from adsn.pallet_items where pallet_id=$1 and product_id=$2 for update",
        [pallet, productId],
      );
      return Number(i?.quantity_remaining ?? 0);
    }
    async function set(pallet: string, productId: string, quantity: number) {
      if (quantity < 0)
        throw new AppError(
          409,
          "Not enough stock remains. Balances have been refreshed.",
        );
      await c.query(
        "insert into adsn.pallet_items(pallet_id,product_id,quantity_remaining) values($1,$2,$3) on conflict(pallet_id,product_id) do update set quantity_remaining=$3,updated_at=now()",
        [pallet, productId, quantity],
      );
    }
    let id: string;
    if (v.action === "create") {
      const {
        rows: [p],
      } = await c.query(
        "insert into adsn.pallets(pallet_identifier,status,activated_at) values($1,$2,case when $2='ACTIVE' then now() end) returning id",
        [v.identifier, v.draft ? "DRAFT" : "ACTIVE"],
      );
      id = p.id;
      await event("PALLET_CREATED", id);
      for (const l of v.lines) {
        const pid = await product(c, l.name, l.brand);
        await set(id, pid, l.quantity);
        if (!v.draft)
          await event("STOCK_ADDED", id, pid, l.quantity, 0, l.quantity);
      }
      if (!v.draft) await event("PALLET_ACTIVATED", id);
    } else {
      id = v.palletId;
      const {
        rows: [p],
      } = await c.query("select * from adsn.pallets where id=$1 for update", [
        id,
      ]);
      if (!p) throw new AppError(404, "Pallet not found.");
      if (p.version !== v.version)
        throw new AppError(
          409,
          "This pallet changed on another device. Cancel and reopen this action to use the refreshed balances.",
        );
      if (v.action === "draft" || v.action === "activate") {
        if (p.status !== "DRAFT")
          throw new AppError(
            409,
            "Only drafts can be edited or activated this way.",
          );
        if (v.action === "draft") {
          await c.query(
            "update adsn.pallets set pallet_identifier=$2 where id=$1",
            [id, v.identifier],
          );
          await c.query("delete from adsn.pallet_items where pallet_id=$1", [
            id,
          ]);
          for (const l of v.lines)
            await set(id, await product(c, l.name, l.brand), l.quantity);
          await event(
            "PALLET_EDITED",
            id,
            null,
            0,
            null,
            null,
            null,
            "Draft contents updated",
          );
        } else {
          const { rows: items } = await c.query(
            "select * from adsn.pallet_items where pallet_id=$1 and quantity_remaining>0",
            [id],
          );
          if (!items.length)
            throw new AppError(
              400,
              "Add products before activating this pallet.",
            );
          await c.query(
            "update adsn.pallets set status='ACTIVE',activated_at=now() where id=$1",
            [id],
          );
          await event("PALLET_ACTIVATED", id);
          for (const i of items)
            await event(
              "STOCK_ADDED",
              id,
              i.product_id,
              i.quantity_remaining,
              0,
              i.quantity_remaining,
            );
        }
      } else {
        if (
          p.status !== "ACTIVE" &&
          !(v.action === "add" && p.status === "EMPTY")
        )
          throw new AppError(409, "This pallet is not active.");
        if (v.action === "rename") {
          await c.query(
            "update adsn.pallets set pallet_identifier=$2 where id=$1",
            [id, v.identifier],
          );
          await event(
            "PALLET_EDITED",
            id,
            null,
            0,
            null,
            null,
            null,
            `Renamed from ${p.pallet_identifier}`.slice(0, 300),
          );
        } else if (v.action === "transfer") {
          const {
            rows: [destination],
          } = await c.query(
            "select * from adsn.pallets where id=$1 and status='ACTIVE' for update",
            [v.destinationId],
          );
          if (!destination)
            throw new AppError(409, "Destination pallet must be active.");
          for (const l of v.lines) {
            const before = await balance(id, l.productId);
            if (before < l.quantity)
              throw new AppError(
                409,
                "Insufficient stock. Transfer cancelled; nothing was moved.",
              );
            await set(id, l.productId, before - l.quantity);
            const target = await balance(v.destinationId, l.productId);
            await set(v.destinationId, l.productId, target + l.quantity);
            await event(
              "STOCK_TRANSFERRED",
              id,
              l.productId,
              l.quantity,
              before,
              before - l.quantity,
              v.destinationId,
            );
          }
          await c.query(
            "update adsn.pallets set updated_at=now(),version=version+1 where id=$1",
            [v.destinationId],
          );
        } else {
          const pid =
              v.action === "add"
                ? await product(c, v.name, v.brand)
                : v.productId,
            before = await balance(id, pid);
          if (v.action !== "add" && before === 0)
            throw new AppError(
              409,
              "This product is no longer on this pallet.",
            );
          const after =
            v.action === "take"
              ? before - v.quantity
              : v.action === "add"
                ? before + v.quantity
                : v.quantity;
          await set(id, pid, after);
          await event(
            v.action === "take"
              ? "STOCK_REPLENISHED"
              : v.action === "add"
                ? "STOCK_ADDED"
                : "STOCK_ADJUSTED",
            id,
            pid,
            v.action === "correct" ? after - before : v.quantity,
            before,
            after,
            null,
            v.action === "correct" ? v.reason : null,
          );
          if (v.action === "add" && p.status === "EMPTY") {
            await c.query(
              "update adsn.pallets set status='ACTIVE',closed_at=null where id=$1",
              [id],
            );
            await event(
              "PALLET_ACTIVATED",
              id,
              null,
              0,
              null,
              null,
              null,
              "Reopened with added stock",
            );
          }
        }
        const {
          rows: [sum],
        } = await c.query(
          "select coalesce(sum(quantity_remaining),0)::int total from adsn.pallet_items where pallet_id=$1",
          [id],
        );
        if (sum.total === 0) {
          await c.query(
            "update adsn.pallets set status='EMPTY',closed_at=now() where id=$1",
            [id],
          );
          await event("PALLET_CLOSED", id);
        }
      }
      await c.query(
        "update adsn.pallets set updated_at=now(),version=version+1 where id=$1",
        [id],
      );
    }
    const response = {
      palletId: id,
      message: "Inventory updated successfully.",
    };
    await c.query(
      "insert into adsn.requests(idempotency_key,payload_hash,response) values($1,$2,$3)",
      [v.key, hash, JSON.stringify(response)],
    );
    await c.query("commit");
    return response;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
