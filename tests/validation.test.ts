import { describe, it, expect } from "vitest";
import { mutationSchema, normalize } from "../lib/validation";
const base = {
  action: "create",
  key: crypto.randomUUID(),
  identifier: "Pallet 01",
  draft: false,
};
describe("input boundaries", () => {
  it("normalizes spacing and case without conflating sizes", () => {
    expect(normalize("  NouNou   1L ")).toBe("nounou 1l");
    expect(normalize("NouNou 1L")).not.toBe(normalize("NouNou 250ml"));
  });
  it.each([-1, 0, 1.5, 1000001, NaN])(
    "rejects invalid published quantity %s",
    (quantity) => {
      expect(
        mutationSchema.safeParse({
          ...base,
          lines: [{ name: "NouNou", quantity }],
        }).success,
      ).toBe(false);
    },
  );
  it("rejects duplicate normalized lines", () => {
    expect(
      mutationSchema.safeParse({
        ...base,
        lines: [
          { name: " NouNou ", quantity: 1 },
          { name: "nounou", quantity: 2 },
        ],
      }).success,
    ).toBe(false);
  });
  it("accepts three distinct products", () => {
    expect(
      mutationSchema.safeParse({
        ...base,
        lines: ["NouNou", "Minu", "OI Oil"].map((name) => ({
          name,
          quantity: 10,
        })),
      }).success,
    ).toBe(true);
  });
  it("requires a correction reason", () => {
    expect(
      mutationSchema.safeParse({
        action: "correct",
        key: crypto.randomUUID(),
        palletId: crypto.randomUUID(),
        productId: crypto.randomUUID(),
        quantity: 0,
        version: 1,
        reason: "",
      }).success,
    ).toBe(false);
  });
  it("rejects self transfers", () => {
    const id = crypto.randomUUID();
    expect(
      mutationSchema.safeParse({
        action: "transfer",
        key: crypto.randomUUID(),
        palletId: id,
        destinationId: id,
        version: 1,
        lines: [{ productId: crypto.randomUUID(), quantity: 2 }],
      }).success,
    ).toBe(false);
  });
});
