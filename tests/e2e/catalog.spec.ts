import { test, expect } from "@playwright/test";
import type { Snapshot } from "../../lib/types";
test("selects stock codes and combines official totals across pallets", async ({
  page,
}, info) => {
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
  const initialUnits = initial.pallets
    .flatMap((p) => p.items)
    .filter((i) => i.stockCode === "00123")
    .reduce((sum, i) => sum + i.quantity, 0);
  for (const [index, quantity] of [10, 24].entries()) {
    await page
      .getByRole("button", { name: "Create Pallet", exact: true })
      .click();
    await page
      .getByLabel("Pallet identifier")
      .fill(`Directory ${info.project.name} ${index}`);
    await page
      .getByRole("combobox", { name: "Product name", exact: true })
      .fill("00123");
    await page
      .getByRole("option", { name: "00123 · Official shampoo 1L", exact: true })
      .click();
    await expect(
      page.getByText("Official item selected", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("spinbutton", { name: "Quantity for product 1" })
      .fill(String(quantity));
    await page
      .getByRole("button", { name: "Finish & Add to Overflow" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: `Directory ${info.project.name} ${index}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "All products", exact: true }).click();
  await page.getByLabel("Search overflow").fill("00123");
  const product = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "Official shampoo 1L",
      exact: true,
    }),
  });
  await expect(product).toHaveCount(1);
  await expect(
    product.getByText(`${initialUnits + 34} units total`, { exact: true }),
  ).toBeVisible();
  await expect(
    product.getByText("Stock code: 00123", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/catalog-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Create Pallet", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Product name", exact: true })
    .fill("free typed variation");
  await page
    .getByRole("spinbutton", { name: "Quantity for product 1" })
    .fill("3");
  await page.getByRole("button", { name: "Finish & Add to Overflow" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "select an official item" }),
  ).toContainText("select an official item");
});

test("matches a legacy product with explicit confirmation and preserves pallet units", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByLabel("Company password")
    .fill("Browser test password only 937!");
  await page.getByRole("button", { name: "Sign in to overflow" }).click();
  await page
    .getByRole("button", {
      name: `Open Legacy ${info.project.name}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Match to master list", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Product name", exact: true })
    .fill("00123");
  await page
    .getByRole("option", { name: "00123 · Official shampoo 1L", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review change", exact: true })
    .click();
  await expect(
    page.getByText("Confirm matching 7 units", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Official shampoo 1L", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("7 units · 1 products", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Stock code: 00123", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Match to master list", exact: true }),
  ).toHaveCount(0);
});
