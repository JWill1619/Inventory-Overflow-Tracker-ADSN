export type DraftLine = {
  name: string;
  brand: string;
  quantity: string;
  productId?: string;
  stockCode?: string | null;
};

/** Ignore untouched extra rows, but never silently discard partially entered stock. */
export function validatePalletForm(
  identifier: string,
  lines: DraftLine[],
  catalogRequired = false,
) {
  const errors: string[] = [];
  if (!identifier.trim())
    errors.push("Enter a pallet identifier above the product list.");
  const entered = lines
    .map((line, index) => ({ ...line, row: index + 1 }))
    .filter(
      (line) => line.name.trim() || line.brand.trim() || line.quantity.trim(),
    );
  if (!entered.length)
    errors.push("Add at least one product and its overflow quantity.");
  for (const line of entered) {
    if (catalogRequired && (!line.productId || !line.stockCode))
      errors.push(
        `Product row ${line.row}: select an official item from the stock-code suggestions.`,
      );
    if (!line.name.trim())
      errors.push(
        `Product row ${line.row}: enter a product name or remove this row.`,
      );
    const quantity = Number(line.quantity.trim());
    if (
      !line.quantity.trim() ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1_000_000
    ) {
      errors.push(
        `Product row ${line.row}${line.name.trim() ? ` (${line.name.trim()})` : ""}: enter overflow units as a whole number from 1 to 1,000,000.`,
      );
    }
  }
  return {
    errors,
    lines: entered.map(({ name, brand, quantity, productId }) => ({
      ...(productId ? { productId } : {}),
      name: name.trim(),
      brand: brand.trim(),
      quantity: Number(quantity.trim()),
    })),
  };
}
