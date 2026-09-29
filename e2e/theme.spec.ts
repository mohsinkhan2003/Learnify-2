import { expect, test } from "@playwright/test";
import { createClassWithAssignment, expectAccessible, signUp, unique } from "./helpers";

// The glass theme must stay readable (WCAG AA contrast) in both colour schemes, and fall back
// to solid surfaces for people who ask their device to reduce transparency.
test("glass theme: accessible in dark mode, solid with reduced transparency", async ({ browser }) => {
  const id = unique();
  const teacher = await (await browser.newContext({ colorScheme: "dark" })).newPage();
  await teacher.addInitScript(() => localStorage.setItem("learnify-theme", "system"));
  await signUp(teacher, { role: "teacher", name: "Dara", email: `dara${id}@example.com`, school: `Theme ${id}`, subject: "Physics" });
  const code = await createClassWithAssignment(teacher, { topic: "Forces", subject: "Physics", grade: "Year 9" });
  await teacher.goto("/teacher");
  await expect(teacher.locator("html")).toHaveClass(/dark/);
  await expectAccessible(teacher);

  const ctx = await browser.newContext({ colorScheme: "dark" });
  await ctx.addInitScript(() => localStorage.setItem("learnify-theme", "system"));
  const student = await ctx.newPage();
  await signUp(student, { role: "student", name: "Rae", email: `rae${id}@example.com`, school: `Theme ${id}`, classCode: code });
  await expect(student.getByRole("link", { name: /Forces/ })).toBeVisible();
  await expectAccessible(student);

  // Cards are translucent by default…
  const cardAlpha = () =>
    student.evaluate(() => {
      const card = document.querySelector(".border.bg-card") as HTMLElement;
      const bg = getComputedStyle(card).backgroundColor; // "rgba(r, g, b, a)" or "rgb(r, g, b)"
      const parts = bg.match(/[\d.]+/g)!.map(Number);
      return parts.length === 4 ? parts[3] : 1;
    });
  expect(await cardAlpha()).toBeLessThan(1);

  // …and solid when the device asks for reduced transparency.
  const cdp = await ctx.newCDPSession(student);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await expect.poll(cardAlpha).toBe(1);
  const blur = await student.evaluate(() => getComputedStyle(document.querySelector("header.glass")!).backdropFilter);
  expect(blur).toBe("none");
});
