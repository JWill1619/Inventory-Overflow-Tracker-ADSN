import { describe, expect, it } from "vitest";
import { validatePalletForm } from "../lib/pallet-form";
const complete = { name: "NouNou Shampoo", brand: "", quantity: "10" };
describe("pallet form validation", () => {
  it("accepts completed fields with an unused extra product row", () => {
    const result = validatePalletForm("Pallet 05", [
      complete,
      { name: "", brand: "", quantity: "" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([
      { name: "NouNou Shampoo", brand: "", quantity: 10 },
    ]);
  });
  it("accepts whole-number values entered with decimal notation or surrounding spaces", () => {
    expect(
      validatePalletForm("Pallet 05", [{ ...complete, quantity: " 10.0 " }])
        .errors,
    ).toEqual([]);
  });
  it("identifies the exact incomplete row without discarding it", () => {
    expect(
      validatePalletForm("Pallet 05", [
        complete,
        { name: "", brand: "", quantity: "5" },
      ]).errors,
    ).toEqual(["Product row 2: enter a product name or remove this row."]);
  });
  it.each(["", "0", "-2", "1.5", "1000001"])(
    "rejects invalid units %s with a specific product message",
    (quantity) => {
      const errors = validatePalletForm("Pallet 05", [
        { ...complete, quantity },
      ]).errors;
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Product row 1 (NouNou Shampoo)");
    },
  );
  it("reports only the missing pallet identifier when product fields are complete", () => {
    expect(validatePalletForm("", [complete]).errors).toEqual([
      "Enter a pallet identifier above the product list.",
    ]);
  });
});
