import type { Snapshot } from "./types";
import { normalize } from "./validation";

export function shelfReport(data: Snapshot, query = "", from = "", to = "") {
  const tokens = normalize(query).split(" ").filter(Boolean);
  const matching = data.products.filter((p) =>
    tokens.every((t) =>
      normalize(`${p.stockCode ?? ""} ${p.name} ${p.brand}`).includes(t),
    ),
  );
  const ids = new Set(matching.map((p) => p.id));
  const events = data.history.filter(
    (m) =>
      (m.action_type === "STOCK_REPLENISHED" ||
        m.action_type === "SHELF_DELIVERY") &&
      m.productId &&
      ids.has(m.productId) &&
      (!from || m.created_at.slice(0, 10) >= from) &&
      (!to || m.created_at.slice(0, 10) <= to),
  );
  const products = matching
    .map((p) => {
      const entries = events.filter((m) => m.productId === p.id);
      const locations = data.pallets
        .filter((a) => a.status === "ACTIVE")
        .flatMap((a) =>
          a.items
            .filter((i) => i.productId === p.id)
            .map((i) => ({
              palletId: a.id,
              name: a.pallet_identifier,
              quantity: i.quantity,
            })),
        );
      return {
        ...p,
        locations,
        overflow: locations.reduce((s, l) => s + l.quantity, 0),
        fromPallets: entries
          .filter((m) => m.action_type === "STOCK_REPLENISHED")
          .reduce((s, m) => s + m.quantity, 0),
        direct: entries
          .filter((m) => m.action_type === "SHELF_DELIVERY")
          .reduce((s, m) => s + m.quantity, 0),
        entries: entries.length,
      };
    })
    .filter((p) => p.entries || p.overflow);
  return { products, events };
}
