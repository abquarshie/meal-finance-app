// The kitchen on a phone: ticking meals, paying for bought food, smaller pots, adding to the plan, a shopping trip,
// the fridge, recipes and people per meal. Data from tests/parity/seed_kitchen.py.
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("ama");
  await page.getByLabel("Password").fill("Kenkey and fish");
  await page.locator("form button.primary").click();
  await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
}
const toast = (page: Page, text: string | RegExp) => expect(page.locator(".toast", { hasText: text }).first()).toBeVisible();
async function stock(page: Page, item: string) {
  await page.goto("/pantry");
  return page.getByLabel(`${item} in stock`, { exact: false }).first().inputValue();
}

test("Home shows today's meals", async ({ page }) => {
  await signIn(page);
  await expect(page.locator(".today")).toContainText("Breakfast: Eggs + Lele Gold evaporated milk (400g)");
  await expect(page.locator(".today")).toContainText("Lunch: Kenkey + Fried fish");
  await expect(page.getByRole("link", { name: /Open the meal plan · \d+ reminders/ })).toBeVisible();
});

test("ticking a meal takes it off the pantry, and unticking puts it back", async ({ page }) => {
  await signIn(page);
  expect(await stock(page, "Eggs")).toBe("14");
  await page.goto("/meals");
  await page.getByRole("checkbox", { name: /Eggs \+ Lele Gold evaporated milk/ }).check();
  await toast(page, "Ticked off.");
  expect(await stock(page, "Eggs")).toBe("8");
  await page.goto("/meals");
  await page.getByRole("checkbox", { name: /Eggs \+ Lele Gold evaporated milk/ }).uncheck();
  await toast(page, "Unticked.");
  expect(await stock(page, "Eggs")).toBe("14");
});

test("paying for bought food is one expense", async ({ page }) => {
  await signIn(page);
  await page.goto("/meals");
  await page.locator(".meal", { hasText: "Kenkey + Fried fish" }).getByRole("button", { name: "Bought" }).click();
  const sheet = page.getByRole("dialog", { name: "Bought it" });
  await expect(sheet.getByLabel(/Paid \(/)).toHaveValue("29");
  await sheet.getByRole("group", { name: "Paid from" }).getByRole("button", { name: "Cash" }).click();
  await sheet.getByRole("button", { name: /Save/ }).click();
  await toast(page, "Saved GH₵29.00 for Kenkey + Fried fish under Dining Out");
  await page.goto("/transactions?q=Bought&month=all");
  await expect(page.locator(".feed")).toContainText("Dining Out");
  await expect(page.locator(".feed")).toContainText("−GH₵29.00");
});

test("a pot that would go to waste is made smaller in one tap", async ({ page }) => {
  await signIn(page);
  await page.goto("/meals");
  await expect(page.locator(".note.pot").first()).toContainText("Palm nut soup on Wed 21: cook 8 portions, not 14 portions.");
  await page.getByRole("button", { name: "Cook 8 instead" }).click();
  await toast(page, "Palm nut soup: now 8 portions");
  await expect(page.locator(".note.pot", { hasText: "Palm nut soup" })).toHaveCount(0);
});

test("adding a pairing plans the starch fresh and the soup as a pot", async ({ page }) => {
  await signIn(page);
  await page.goto("/meals");
  const form = page.locator(".card", { has: page.getByRole("heading", { name: "Add to the plan" }) });
  await form.getByRole("button", { name: "Days 8 to 14" }).click();
  await form.getByRole("group", { name: "Day" }).getByRole("button").nth(6).click(); // day 14: the light soup cooked on day 3 has gone off by then
  await form.getByRole("group", { name: "Meal" }).getByRole("button", { name: "Lunch" }).click();
  await form.getByLabel("Add a dish").selectOption({ label: "🍲 Banku + Light soup" });
  await expect(form.getByLabel("Banku (portions to cook)")).toHaveValue("1");
  await expect(form.getByLabel("Light soup (portions to cook)")).toHaveValue("14");
  await expect(form.getByText("One meal: Banku + Light soup.")).toBeVisible();
  await form.getByRole("button", { name: /^Add 2 to / }).click();
  await toast(page, /Added 2 to .*, lunch/);
});

test("a shopping trip goes into the pantry and the money records", async ({ page }) => {
  await signIn(page);
  await page.goto("/shopping");
  // (beef isn't on the list any more: the smaller palm nut soup pot needs only what's in the pantry)
  await expect(page.getByRole("checkbox", { name: /^Beef · / })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Goat meat · 1.5 kg" }).check();
  const row = page.locator(".mk-row", { hasText: "Goat meat" });
  await row.getByLabel(/Paid \(/).fill("45");
  await page.getByRole("group", { name: "Paid from" }).getByRole("button", { name: "GCB" }).click();
  await page.getByLabel("Where (optional)").fill("Makola");
  await page.getByRole("button", { name: /Save trip · GH₵45.00/ }).click();
  await toast(page, /Saved GH₵45.00 of shopping at Makola from GCB: Meat\/Fish GH₵45.00/);
  await page.goto("/pantry");
  await expect(page.getByLabel("Goat meat in stock (kg)")).toHaveValue("1.5");
});

test("the fridge: eat one, throw the old one away", async ({ page }) => {
  await signIn(page);
  await page.goto("/meals/fridge");
  const stew = page.locator(".rule", { hasText: "Tomato stew" });
  await stew.getByRole("button", { name: "Ate 1" }).click();
  await toast(page, "Eaten");
  const shito = page.locator(".rule", { hasText: "Shito" });
  await expect(shito).toContainText("Past eat-by");
  await shito.getByRole("button", { name: "Thrown away" }).click();
  await page.getByRole("dialog", { name: "Please confirm" }).getByRole("button", { name: "Thrown away" }).click();
  await toast(page, "Logged 1 of Shito as thrown away");
  await page.reload();
  await expect(page.getByText(/This month: 2 lots of food thrown away/)).toBeVisible();
});

test("a new recipe goes into the book", async ({ page }) => {
  await signIn(page);
  await page.goto("/meals/recipes");
  const ed = page.locator(".card", { has: page.getByRole("heading", { name: "Add or change a recipe" }) });
  await ed.getByLabel("Name", { exact: true }).fill("Test egg stew");
  await ed.getByRole("button", { name: "+ Add an ingredient" }).click();
  await ed.getByLabel("Ingredient").selectOption({ label: "Eggs" });
  await ed.getByLabel("Amount").fill("6");
  await ed.getByRole("button", { name: "Save recipe" }).click();
  await toast(page, "Saved Test egg stew");
  await expect(page.locator(".rule", { hasText: "Test egg stew" })).toContainText("6 Eggs");
});

test("the usual number at lunch", async ({ page }) => {
  await signIn(page);
  await page.goto("/meals/settings");
  await page.getByLabel("Lunch").fill("2");
  await page.getByRole("button", { name: "Save" }).click();
  await toast(page, "Saved: 3 at breakfast, 2 at lunch, 2 at supper");
  await page.goto("/meals");
  await expect(page.getByText(/usually 3 at breakfast, 2 at lunch, 2 at supper/)).toBeVisible();
});
