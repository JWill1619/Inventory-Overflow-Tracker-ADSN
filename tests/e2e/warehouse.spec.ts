import { test, expect } from "@playwright/test";
test("server rejects unauthenticated reads, writes, and forged origins", async ({
  request,
}) => {
  expect((await request.get("/api/inventory")).status()).toBe(401);
  expect(
    (
      await request.post("/api/inventory", {
        headers: { origin: "http://127.0.0.1:3001", "x-adsn-request": "1" },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/session", {
        headers: { origin: "https://evil.example", "x-adsn-request": "1" },
        data: { password: "Browser test password only 937!" },
      })
    ).status(),
  ).toBe(403);
});
test("warehouse worker creates, finds, replenishes, corrects and merges real stock", async ({
  page,
  context,
}, testInfo) => {
  const suffix = testInfo.project.name;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("Company password")
    .fill("Browser test password only 937!");
  await page.getByRole("button", { name: "Sign in to overflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Overflow overview." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create pallet", exact: true })
    .first()
    .click();
  await page.getByLabel("Pallet identifier").fill(`E2E source ${suffix}`);
  await page
    .getByRole("combobox", { name: "Product name", exact: true })
    .fill(`Test shampoo ${suffix}`);
  await page
    .getByRole("spinbutton", { name: "Quantity for product 1" })
    .fill("10");
  await page.getByRole("button", { name: "Finish & Add to Overflow" }).click();
  await expect(
    page.getByRole("heading", { name: `E2E source ${suffix}`, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search overflow").fill(`  test   shampoo ${suffix} `);
  await expect(
    page.getByRole("heading", { name: `E2E source ${suffix}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Open E2E source ${suffix}` }).click();
  await page
    .getByRole("button", { name: "Take from overflow", exact: true })
    .click();
  await page.getByLabel("Quantity taken").fill("6");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("4 units · 1 products", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Correct balance", exact: true })
    .click();
  await page.getByLabel("Actual physically counted units").fill("5");
  await page.getByLabel("Correction reason").fill("Recounted physical units");
  await page.getByRole("button", { name: "Review change" }).click();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(
    page.getByText("5 units · 1 products", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create Pallet", exact: true })
    .click();
  await page.getByLabel("Pallet identifier").fill(`E2E target ${suffix}`);
  await page
    .getByRole("combobox", { name: "Product name", exact: true })
    .fill(`Test shampoo ${suffix}`);
  await page
    .getByRole("spinbutton", { name: "Quantity for product 1" })
    .fill("3");
  await page.getByRole("button", { name: "Finish & Add to Overflow" }).click();
  await page.getByRole("button", { name: `Open E2E source ${suffix}` }).click();
  await page.getByRole("button", { name: "Move / merge", exact: true }).click();
  await page
    .getByLabel("Destination pallet")
    .selectOption({ label: `E2E target ${suffix}` });
  await page
    .getByRole("button", { name: "Select all remaining stock" })
    .click();
  await page.getByRole("button", { name: "Review change" }).click();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(
    page.getByRole("heading", { name: "This pallet is empty." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `E2E source ${suffix}`, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: `Open E2E target ${suffix}` }).click();
  await expect(
    page.getByText("8 units · 1 products", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByLabel("Stock code, product or pallet")
    .fill(`Test shampoo ${suffix}`);
  await expect(
    page.getByRole("strong").filter({ hasText: /^stock transferred$/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Recounted physical units", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: `test-results/${suffix}-overview.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await expect(
    page.getByText("Server connection unavailable.", { exact: false }),
  ).toBeVisible();
  await context.setOffline(false);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "adsn_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Company sign in" }),
  ).toBeVisible();
  expect((await context.request.get("/api/inventory")).status()).toBe(401);
  expect(errors).toEqual([]);
});

test("draft editing, product autocomplete, added stock and second-device sync", async ({
  page,
  browser,
}, testInfo) => {
  const suffix = testInfo.project.name;
  await page.goto("/");
  await page
    .getByLabel("Company password")
    .fill("Browser test password only 937!");
  await page.getByRole("button", { name: "Sign in to overflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Overflow overview." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create Pallet", exact: true })
    .click();
  await page.getByLabel("Pallet identifier").fill(`Draft sync ${suffix}`);
  await page
    .getByRole("combobox", { name: "Product name", exact: true })
    .fill(`Test shampoo ${suffix}`);
  await page
    .getByRole("option", { name: `Test shampoo ${suffix}`, exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Quantity for product 1" })
    .fill("2");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overflow overview." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `Draft sync ${suffix}`, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Pallets", exact: true }).click();
  await page.getByLabel("Pallet status").selectOption("DRAFT");
  await page.getByRole("button", { name: `Open Draft sync ${suffix}` }).click();
  await page
    .getByRole("spinbutton", { name: "Quantity for product 1" })
    .fill("3");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Inventory updated successfully.",
  );
  await page.getByRole("button", { name: "Finish & Add to Overflow" }).click();
  await expect(
    page.getByText("3 units · 1 products", { exact: false }),
  ).toBeVisible();
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    await second.goto("http://127.0.0.1:3001");
    await second
      .getByLabel("Company password")
      .fill("Browser test password only 937!");
    await second.getByRole("button", { name: "Sign in to overflow" }).click();
    await expect(
      second.getByRole("heading", {
        name: `Draft sync ${suffix}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add stock", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Product name", exact: true })
      .fill(`Test shampoo ${suffix}`);
    await page
      .getByRole("option", { name: `Test shampoo ${suffix}`, exact: true })
      .click();
    await page.getByLabel("Additional units").fill("2");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByText("5 units · 1 products", { exact: false }),
    ).toBeVisible();
    const card = second.getByRole("article").filter({
      has: second.getByRole("heading", {
        name: `Draft sync ${suffix}`,
        exact: true,
      }),
    });
    await expect(card.getByText("5", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    const downloadPromise = second.waitForEvent("download");
    await second.getByRole("button", { name: "Export", exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toBe(
      "adsn-overflow.csv",
    );
  } finally {
    await other.close();
  }
});
