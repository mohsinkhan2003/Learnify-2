import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

export async function signUp(
  page: Page,
  opts: { role: "teacher" | "student"; name: string; email: string; school: string; subject?: string; classCode?: string },
) {
  await page.goto("/signup");
  await page.getByRole("radio", { name: opts.role === "teacher" ? /I'm a teacher/ : /I'm a student/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill(opts.name);
  await page.getByLabel("Email").fill(opts.email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByLabel("School").fill(opts.school);
  if (opts.subject) await page.getByLabel("Subject you teach").fill(opts.subject);
  if (opts.classCode) await page.getByLabel("Class code (optional)").fill(opts.classCode);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(opts.role === "teacher" ? "**/teacher" : "**/student");
}

/** Creates a class and a released assignment for it through the API (as the signed-in teacher). Returns the join code. */
export async function createClassWithAssignment(
  page: Page,
  assignment: { topic: string; subject: string; grade: string },
): Promise<string> {
  return page.evaluate(async (a) => {
    const post = (url: string, body: unknown) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    const cls = await post("/api/teacher/classes", { name: `${a.subject} class` });
    await post("/api/teacher/assignments", {
      ...a,
      instructions: "",
      classId: cls.id,
      audience: "class",
      releaseAt: new Date().toISOString(),
    });
    return cls.joinCode as string;
  }, assignment);
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
