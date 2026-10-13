import { expect, it } from "vitest";
import { parseCatalog } from "../lib/catalog-import";
import { validatePalletForm } from "../lib/pallet-form";
it("reads quoted commas, BOM and leading-zero codes", () => {
  expect(
    parseCatalog('\uFEFFstock_code,short_desc\r\n00123,"VIEW 3,0 60ML"\r\n'),
  ).toEqual([{ stock_code: "00123", short_desc: "VIEW 3,0 60ML" }]);
});
it("rejects duplicate case-insensitive codes and invalid headers", () => {
  expect(() =>
    parseCatalog("stock_code,short_desc\nab12,One\nAB12,Two"),
  ).toThrow();
  expect(() => parseCatalog("code,name\n00123,Product")).toThrow();
});
it("requires selected directory identity when a master list exists", () => {
  expect(
    validatePalletForm(
      "Pallet 01",
      [{ name: "Typed name", brand: "", quantity: "5" }],
      true,
    ).errors[0],
  ).toContain("select an official item");
  const result = validatePalletForm(
    "Pallet 01",
    [
      {
        productId: crypto.randomUUID(),
        stockCode: "00123",
        name: "Official name",
        brand: "",
        quantity: "5",
      },
    ],
    true,
  );
  expect(result.errors).toEqual([]);
  expect(result.lines[0].productId).toBeDefined();
});
