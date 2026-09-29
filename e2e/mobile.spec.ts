import { expect, test } from "@playwright/test";
import { createClassWithAssignment, expectAccessible, sendTyped, signUp, unique } from "./helpers";

test("student tutoring works on a phone", async ({ browser }) => {
  const id = unique();
  const school = `Mobile ${id}`;
  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await signUp(teacher, { role: "teacher", name: "Mo Teacher", email: `mt${id}@example.com`, school, subject: "Physics" });
  const code = await createClassWithAssignment(teacher, { topic: "Forces", subject: "Physics", grade: "Year 9" });

  const page = await (await browser.newContext({ ...(await import("@playwright/test")).devices["Pixel 7"] })).newPage();
  await signUp(page, { role: "student", name: "Mia", email: `ms${id}@example.com`, school, classCode: code });
  await page.getByRole("link", { name: /Forces/ }).click();
  await page.getByRole("button", { name: /Type instead/ }).click();
  await sendTyped(page, "Hello!");
  await expect(page.getByText("Are you ready to begin?")).toBeVisible();
  // No horizontal overflow on small screens.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expectAccessible(page);
});

test("student tab bar on a phone: homework, classes and profile", async ({ browser }) => {
  const id = unique();
  const teacher = await (await browser.newContext()).newPage();
  await signUp(teacher, { role: "teacher", name: "Tia", email: `tia${id}@example.com`, school: `Tabs ${id}`, subject: "Chemistry" });
  const code = await createClassWithAssignment(teacher, { topic: "Atoms", subject: "Chemistry", grade: "Year 8" });

  const page = await (await browser.newContext({ ...(await import("@playwright/test")).devices["Pixel 7"] })).newPage();
  await signUp(page, { role: "student", name: "Tom", email: `tom${id}@example.com`, school: `Tabs ${id}`, classCode: code });
  const tabs = page.getByRole("navigation", { name: "Main" });
  await expect(tabs.getByRole("link", { name: "Homework" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /Atoms/ })).toBeVisible();

  await tabs.getByRole("link", { name: "Classes" }).click();
  await expect(page.getByRole("heading", { name: "Your classes" })).toBeVisible();
  await expect(page.getByText("Chemistry class")).toBeVisible();
  await expectAccessible(page);

  await tabs.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByText(`tom${id}@example.com`)).toBeVisible();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");

  // No horizontal overflow on any of the new screens.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
