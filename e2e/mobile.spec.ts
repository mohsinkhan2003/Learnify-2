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
