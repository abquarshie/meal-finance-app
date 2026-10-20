import { expect, test } from "@playwright/test";

test("the desktop layout", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("ama");
  await page.getByLabel("Password").fill("Kenkey and fish");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".side")).toBeVisible();
  await expect(page.locator(".tabbar")).toBeHidden();
  await page.getByText("Account balances").click();
  await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });
  for (const [path, name] of [["/transactions", "transactions"], ["/repeats", "repeats"], ["/budgets", "budgets"],
    ["/settings/categories", "categories"], ["/meals", "meals"], ["/shopping", "shopping"], ["/pantry", "pantry"]] as const) {
    await page.goto(path);
    await page.screenshot({ path: `test-results/${name}-desktop.png`, fullPage: true });
  }
  await expect(page.locator(".nav-link[aria-current=page]")).toHaveText("Kitchen");
});
