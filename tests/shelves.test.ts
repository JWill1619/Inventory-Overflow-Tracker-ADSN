import { expect, it } from "vitest";
import { shelfReport } from "../lib/shelves";
import type { Snapshot, Movement } from "../lib/types";
const movement = (
  id: string,
  action_type: string,
  quantity: number,
  productId = "a",
  created_at = "2026-10-13T10:00:00.000Z",
): Movement => ({
  id,
  action_type,
  quantity,
  productId,
  created_at,
  product: "Shampoo",
  stockCode: productId === "a" ? "00123" : "00124",
  source: "Pallet 01",
  destination: null,
  quantity_before: null,
  quantity_after: null,
  notes: null,
  movement_group_id: id,
});
const data: Snapshot = {
  products: [
    { id: "a", name: "Shampoo", brand: "", stockCode: "00123" },
    { id: "b", name: "Shampoo", brand: "", stockCode: "00124" },
  ],
  pallets: [
    {
      id: "p",
      pallet_identifier: "Pallet 01",
      status: "ACTIVE",
      version: 1,
      created_at: "",
      updated_at: "",
      items: [{ productId: "a", name: "Shampoo", brand: "", quantity: 50 }],
    },
    {
      id: "draft",
      pallet_identifier: "Draft",
      status: "DRAFT",
      version: 1,
      created_at: "",
      updated_at: "",
      items: [{ productId: "a", name: "Shampoo", brand: "", quantity: 100 }],
    },
  ],
  history: [
    movement("1", "STOCK_REPLENISHED", 20),
    movement("2", "SHELF_DELIVERY", 30),
    movement("3", "STOCK_TRANSFERRED", 70),
    movement("4", "STOCK_ADJUSTED", -10),
    movement("5", "SHELF_DELIVERY", 5, "b"),
    movement("6", "STOCK_REPLENISHED", 3, "a", "2026-10-12T23:59:59.000Z"),
  ],
};
it("counts only replenishment events, keeps codes distinct, and excludes draft overflow", () => {
  const result = shelfReport(data);
  expect(result.products[0]).toMatchObject({
    overflow: 50,
    fromPallets: 23,
    direct: 30,
    entries: 3,
  });
  expect(result.products[1]).toMatchObject({
    overflow: 0,
    fromPallets: 0,
    direct: 5,
  });
});
it("filters shelf records by inclusive UTC date and code without changing current overflow", () => {
  const result = shelfReport(data, "00123 shampoo", "2026-10-13", "2026-10-13");
  expect(result.events.map((m) => m.id)).toEqual(["1", "2"]);
  expect(result.products).toHaveLength(1);
  expect(result.products[0]).toMatchObject({
    overflow: 50,
    fromPallets: 20,
    direct: 30,
  });
  expect(shelfReport(data, "00123", "2026-10-14").products[0]).toMatchObject({
    overflow: 50,
    fromPallets: 0,
    direct: 0,
  });
});
