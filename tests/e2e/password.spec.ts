import { test, expect } from "@playwright/test";
test("company password form validates confirmation, rotates, and signs out", async ({
  page,
  request,
}) => {
  const oldPassword = "Browser test password only 937!",
    nextPassword = "Company preferred phrase 2847!";
  await page.goto("/");
  await page.getByLabel("Company password", { exact: true }).fill(oldPassword);
  await page.getByRole("button", { name: "Sign in to overflow" }).click();
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await page.getByLabel("Current password", { exact: true }).fill(oldPassword);
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page.getByLabel("Confirm new password").fill(nextPassword + "oops");
  await page
    .getByRole("button", { name: "Change password and sign out" })
    .click();
  await expect(page.getByRole("alert").filter({hasText:"do not match"})).toContainText("do not match");
  await page.getByLabel("Confirm new password").fill(nextPassword);
  await page
    .getByRole("button", { name: "Change password and sign out" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Company password changed",
  );
  await expect(
    page.getByRole("heading", { name: "Company sign in" }),
  ).toBeVisible();
  const headers = { origin: "http://127.0.0.1:3004", "x-adsn-request": "1" };
  expect(
    (
      await request.post("/api/session", {
        headers,
        data: { password: oldPassword },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/session", {
        headers,
        data: { password: nextPassword },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/password", {
        headers,
        data: {
          currentPassword: nextPassword,
          newPassword: oldPassword,
          confirmation: oldPassword,
        },
      })
    ).status(),
  ).toBe(200);
});
