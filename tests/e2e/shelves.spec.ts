import { test, expect } from "@playwright/test";
import type { Snapshot } from "../../lib/types";

test("puts pallet stock and direct deliveries onto the shelf record", async ({
  page,
  context,
}, info) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/");
  await page
    .getByLabel("Company password")
    .fill("Browser test password only 937!");
  await page.getByRole("button", { name: "Sign in to overflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Overflow overview." }),
  ).toBeVisible();
  const initial: Snapshot = await (
    await page.request.get("/api/inventory")
  ).json();
  const product = initial.products.find((p) => p.stockCode === "00124")!;
  const priorShelf = initial.history
    .filter(
      (m) =>
        m.productId === product.id &&
        ["STOCK_REPLENISHED", "SHELF_DELIVERY"].includes(m.action_type),
    )
    .reduce((s, m) => s + m.quantity, 0);
  const priorOverflow = initial.pallets
    .filter((p) => p.status === "ACTIVE")
    .flatMap((p) => p.items)
    .filter((i) => i.productId === product.id)
    .reduce((s, i) => s + i.quantity, 0);
  const palletName = `Shelves ${info.project.name}`;
  await page
    .getByRole("button", { name: "Create Pallet", exact: true })
    .click();
  await page.getByLabel("Pallet identifier").fill(palletName);
  await page
    .getByRole("combobox", { name: "Product name", exact: true })
    .fill("00124");
  await page
    .getByRole("option", {
      name: "00124 · Official shampoo 250ml",
      exact: true,
    })
    .click();
  await page
    .getByRole("spinbutton", { name: "Quantity for product 1" })
    .fill("10");
  await page.getByRole("button", { name: "Finish & Add to Overflow" }).click();
  await page
    .getByRole("button", { name: `Open ${palletName}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to shelves", exact: true })
    .click();
  await page.getByLabel("Units to put onto shelves").fill("6");
  await page
    .getByRole("button", { name: "Review change", exact: true })
    .click();
  await expect(
    page.getByText(`Confirm moving 6 units from ${palletName} to shelves.`, {
      exact: false,
    }),
  ).toBeVisible();
  // Review alone must not move stock.
  const reviewed: Snapshot = await (
    await page.request.get("/api/inventory")
  ).json();
  expect(
    reviewed.pallets.find((p) => p.pallet_identifier === palletName)?.items[0]
      .quantity,
  ).toBe(10);
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    page.getByText("4 units · 1 products", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Shelves", exact: true }).click();
  await page.getByLabel("Search stock code or product").fill("00124");
  await expect(
    page.getByText(`${priorShelf + 6} units put onto shelves`, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record direct delivery", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Product name", exact: true })
    .fill("00124");
  await expect(
    page.getByRole("button", { name: "Review delivery", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("option", {
      name: "00124 · Official shampoo 250ml",
      exact: true,
    })
    .click();
  await page.getByLabel("Units put onto shelves", { exact: true }).fill("8");
  await page
    .getByLabel("Delivery reference or note")
    .fill(`Direct ${info.project.name}`);
  await page
    .getByRole("button", { name: "Review delivery", exact: true })
    .click();
  await expect(
    page.getByText("Record 8 units of 00124", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm delivery", exact: true })
    .click();
  await expect(
    page.getByText(`${priorShelf + 14} units put onto shelves`, {
      exact: true,
    }),
  ).toBeVisible();
  const after: Snapshot = await (
    await page.request.get("/api/inventory")
  ).json();
  expect(
    after.pallets.find((p) => p.pallet_identifier === palletName)?.items[0]
      .quantity,
  ).toBe(4);
  const card = page.locator(".shelf-product").filter({ hasText: "00124" });
  await expect(card.locator("dd").nth(1)).toHaveText(String(priorOverflow + 4));
  await page.getByLabel("To (UTC)").fill("2020-01-01");
  await expect(
    page.getByText("0 units put onto shelves", { exact: true }),
  ).toBeVisible();
  await expect(card.locator("dd").nth(1)).toHaveText(String(priorOverflow + 4));
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByLabel("Search stock code or product").fill("00124");
  await page.screenshot({
    path: info.outputPath("shelves.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Record direct delivery", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Record direct delivery", exact: true }),
  ).toBeEnabled();
  expect(consoleErrors).toEqual([]);
});
