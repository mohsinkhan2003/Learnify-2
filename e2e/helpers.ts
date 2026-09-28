import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

export async function signUp(
  page: Page,
  opts: { role: "teacher" | "student"; name: string; email: string; school: string; subject?: string },
) {
  await page.goto("/signup");
  await page.getByRole("radio", { name: opts.role === "teacher" ? /I'm a teacher/ : /I'm a student/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill(opts.name);
  await page.getByLabel("Email").fill(opts.email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByLabel("School").fill(opts.school);
  if (opts.subject) await page.getByLabel("Subject you teach").fill(opts.subject);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(opts.role === "teacher" ? "**/teacher" : "**/student");
}

export async function sendTyped(page: Page, text: string) {
  const box = page.getByLabel("Type your answer");
  await expect(box).toBeEnabled();
  await box.fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
  // Wait until the tutor has answered (composer becomes usable again).
  await expect(page.getByText("Sending…")).toHaveCount(0);
  await expect(box).toBeEnabled();
}

/** Fails on serious/critical WCAG 2.x A/AA violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}
