// The whole money side on a phone, in order: the first person sets Cashew up, then everyday use.
// The database starts as tests/e2e/setup.sh leaves it: Python's tables and sample entries, and one person ("ama",
// created by the Python app with the password "Kenkey and fish").
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, user = "ama", password = "Kenkey and fish") {
  await page.goto("/login");
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
}

const toast = (page: Page) => page.locator(".toast").last();

test("signed out, every page leads to sign-in and back", async ({ page }) => {
  await page.goto("/budgets");
  await expect(page).toHaveURL(/\/login\?next=%2Fbudgets/);
  await page.getByLabel("Username").fill("ama");
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".note.error")).toHaveText("Wrong username or password. 4 tries left before a short lock.");
  await page.getByLabel("Password").fill("Kenkey and fish");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/budgets$/);
});

test("Home: balances and this month", async ({ page }) => {
  await signIn(page);
  await page.locator("summary", { hasText: "Account balances" }).click(); // folded by default
  await expect(page.getByText("Susu").locator("..")).toContainText("savings");
  await expect(page.getByText(/^Budget Left · /)).toBeVisible();
  await expect(page.getByText(/^Expenses · /)).toBeVisible();
  await page.screenshot({ path: "test-results/home-phone.png", fullPage: true });
});

test("add an expense, then the double-entry check", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Add an entry" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add an entry" });
  await sheet.getByLabel(/Amount/).fill("37.50");
  await sheet.getByRole("group", { name: "Category" }).getByRole("button").first().click();
  const category = await sheet.getByRole("group", { name: "Category" }).locator('[aria-pressed="true"]').innerText();
  await sheet.getByRole("group", { name: "Account" }).getByRole("button", { name: "Cash" }).click();
  await page.screenshot({ path: "test-results/add-entry-phone.png" });
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(`Saved GH₵37.50 expense to ${category}`)).toBeVisible();
  await expect(sheet).toBeHidden();

  // the same again is caught
  await page.getByRole("button", { name: "Add an entry" }).last().click();
  await sheet.getByLabel(/Amount/).fill("37.50");
  await sheet.getByRole("group", { name: "Category" }).getByRole("button", { name: category, exact: true }).click();
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expect(sheet.getByText(/You already added GH₵37\.50 for .* today at \d\d:\d\d\. Save another one\?/)).toBeVisible();
  await sheet.getByRole("button", { name: "Don't save" }).click();
  await expect(sheet.getByRole("button", { name: "Save expense" })).toBeVisible();
});

test("a pasted MoMo text fills the form in", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Add an entry" }).last().click();
  const sheet = page.getByRole("dialog", { name: "Add an entry" });
  await sheet.getByText("Paste a MoMo text").click();
  await sheet.getByLabel("MoMo text").fill("Payment made for GHS 50.00 to KOFI MENSAH. Current Balance: GHS 120.50. "
    + "Reference: lunch. Transaction ID: 51234567890. Fee charged: GHS 0.50 TAX charged: GHS 0.00.");
  await sheet.getByRole("button", { name: "Fill in the form" }).click();
  await expect(sheet.getByText("Paid GH₵50.00 to Kofi Mensah, fee GH₵0.50. Check the details, then save.")).toBeVisible();
  await expect(sheet.getByLabel(/Amount/)).toHaveValue("50");
  await expect(sheet.getByRole("group", { name: "Account" }).locator('[aria-pressed="true"]')).toHaveText("MoMo");
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/Saved GH₵50\.00 expense to .* plus GH₵0\.50 fee/)).toBeVisible();
  // pasting it again is recognised by its transaction ID
  await page.getByRole("button", { name: "Add an entry" }).last().click();
  await sheet.getByText("Paste a MoMo text").click();
  await sheet.getByLabel("MoMo text").fill("Payment made for GHS 50.00 to KOFI MENSAH. Transaction ID: 51234567890.");
  await sheet.getByRole("button", { name: "Fill in the form" }).click();
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expect(sheet.getByText(/This MoMo payment is already saved \(You added it/)).toBeVisible();
});

test("transactions: change one, delete it, undo", async ({ page }) => {
  await signIn(page);
  await page.goto("/transactions");
  await page.getByLabel("Search").fill("Kofi Mensah");
  await expect(page.getByText("Download 1 entry as a spreadsheet (CSV)")).toBeVisible();
  await page.locator("button.feed-row").first().click();
  const sheet = page.getByRole("dialog", { name: "Change an entry" });
  await sheet.getByLabel(/Amount/).fill("55");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved the change")).toBeVisible();
  await expect(page.locator(".feed").first()).toContainText("−GH₵55.00");

  await page.locator("button.feed-row").first().click();
  await sheet.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Please confirm" }).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Deleted 1 transaction.");
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Restored 1 transaction")).toBeVisible();
  await expect(page.locator(".feed").first()).toContainText("−GH₵55.00");
  await page.screenshot({ path: "test-results/transactions-phone.png", fullPage: true });
});

test("budgets", async ({ page }) => {
  await signIn(page);
  await page.goto("/budgets");
  await page.getByLabel("Budget for").selectOption({ label: "Transportation (whole group)" });
  await page.getByLabel(/Monthly limit/).fill("400");
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(page.getByText("Budget for Transportation set to GH₵400.00 a month")).toBeVisible();
  await expect(page.locator(".prog-name", { hasText: "Transportation" })).toBeVisible();
});

test("settings: renaming an account renames it everywhere", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/accounts");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Account").selectOption("Flip");
  await page.getByLabel("Name").fill("Flip Wallet");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved 'Flip Wallet'")).toBeVisible();
  await expect(page.locator("table")).toContainText("Flip Wallet");
});

test("settings: a category still in use can only go once its uses have somewhere to go", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/categories");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Category name").fill("Food");
  await expect(page.getByText("'Food' is the name of a group, so a budget couldn't tell them apart. Pick another name.")).toBeVisible();
  await page.getByLabel("Category name").fill("School fees");
  await page.getByLabel("Group").selectOption("New group…");
  await page.getByLabel("New group name").fill("School");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Added 'School fees' to School")).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByLabel("Category").selectOption({ label: "Utility › Internet Data" });
  await expect(page.getByText(/Internet Data is still used by 1 auto transactions/)).toBeVisible();
  const del = page.getByRole("button", { name: "Delete category" });
  await expect(del).toBeDisabled();
  await page.getByLabel("Move them to").selectOption({ label: "Utility › Telephone calls credit" });
  await del.click();
  await page.getByRole("dialog", { name: "Please confirm" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Deleted 'Internet Data'")).toBeVisible();
});

test("people: an invite code lets the family join", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/settings/people");
  const code = (await page.locator("code").innerText()).trim();
  expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

  const other = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const p2 = await other.newPage();
  await p2.goto("/login");
  await p2.getByRole("button", { name: "I have an invite code" }).click();
  await p2.getByLabel("Your name").fill("Kofi");
  await p2.getByLabel("Username").fill("kofi");
  await p2.getByLabel("Password", { exact: true }).fill("Plantain-Chips-26");
  await p2.getByLabel("Type the password again").fill("Plantain-Chips-26");
  await p2.getByLabel("Invite code").fill("0000-0000-0000");
  await p2.getByRole("button", { name: "Create account" }).click();
  await expect(p2.locator(".note.error")).toContainText("That invite code isn't right.");
  await p2.getByLabel("Invite code").fill(code.toLowerCase());
  await p2.getByRole("button", { name: "Create account" }).click();
  await expect(p2.getByRole("heading", { name: "Hello, Kofi" })).toBeVisible();
  await p2.goto("/settings/people");
  await expect(p2.getByText("To invite someone or reset a password, ask the account owner.")).toBeVisible();

  // the owner resets Kofi's password: his browser is signed out
  await page.reload();
  await page.getByLabel("Person").selectOption({ label: "Kofi (@kofi)" });
  await page.getByLabel("New password for Kofi").fill("New-Plantain-26");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("New password set for Kofi. Tell them in person or by phone.")).toBeVisible();
  await p2.goto("/");
  await expect(p2).toHaveURL(/\/login/);
  await other.close();
});

test("signing out ends the session", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/people");
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "cashew_session")?.httpOnly).toBe(true);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
