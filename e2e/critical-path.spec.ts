import { expect, test } from "@playwright/test";
import { expectAccessible, sendTyped, signUp, unique } from "./helpers";

test("teacher assigns → student completes a tutoring session → teacher sees progress", async ({ browser }) => {
  const id = unique();
  const school = `E2E School ${id}`;
  const topic = `Photosynthesis ${id}`;

  // --- Teacher creates an assignment through the wizard
  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await signUp(teacher, { role: "teacher", name: "Tess Teacher", email: `teacher${id}@example.com`, school, subject: "Biology" });
  await expect(teacher.getByRole("heading", { name: /Good (morning|afternoon|evening), Tess/ })).toBeVisible();
  await expectAccessible(teacher);

  await teacher.getByRole("link", { name: "New assignment" }).first().click();
  await teacher.getByLabel("Topic").fill(topic);
  await teacher.getByLabel("Year / grade").fill("Year 10");
  await teacher.getByRole("button", { name: /Continue/ }).click();
  await expect(teacher.getByRole("radio", { name: /Everyone at my school/ })).toHaveAttribute("aria-checked", "true");
  await teacher.getByRole("button", { name: /Continue/ }).click();
  await teacher.getByLabel("Guidance for the tutor").fill("Use everyday examples.");
  await teacher.getByRole("button", { name: /Continue/ }).click();
  await teacher.getByRole("button", { name: /Continue/ }).click();
  await expect(teacher.getByText("Use everyday examples.")).toBeVisible();
  await teacher.getByRole("button", { name: /Publish to students/ }).click();
  await expect(teacher.getByRole("heading", { name: topic })).toBeVisible();
  await expect(teacher.getByText("No one has started yet")).toBeVisible();

  // --- Student at the same school completes it
  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await signUp(student, { role: "student", name: "Sam Student", email: `student${id}@example.com`, school });
  const card = student.getByRole("link", { name: new RegExp(topic) });
  await expect(card).toBeVisible();
  await expectAccessible(student);
  await card.click();

  await expect(student.getByRole("heading", { name: topic })).toBeVisible();
  await student.getByRole("button", { name: /Type instead/ }).click();
  await expect(student.getByText(/Hi Sam! I'm your Learnify tutor/)).toBeVisible();
  // Complete is locked until the server says the session reached its summary.
  await expect(student.getByRole("button", { name: "Complete" })).toBeDisabled();

  await sendTyped(student, "I'm good, thanks");
  await sendTyped(student, "Yes, I'm ready");
  await sendTyped(student, "Plants use sunlight to make food");
  for (let i = 1; i <= 5; i++) await sendTyped(student, `My answer number ${i}`);

  await expect(student.getByText("Here's a summary of what we covered")).toBeVisible();
  await expectAccessible(student);

  // Refreshing mid-session keeps everything (state is server-side).
  await student.reload();
  await expect(student.getByText("Here's a summary of what we covered")).toBeVisible();

  await student.getByRole("button", { name: "Hand in homework" }).click();
  await student.getByRole("button", { name: "Hand it in" }).click();
  await expect(student.getByText("Homework complete — well done!")).toBeVisible();

  await student.getByRole("link", { name: "Back to my homework" }).click();
  await expect(student.getByRole("heading", { name: /Completed/ })).toBeVisible();

  // --- Teacher sees the completion and can read the transcript
  await teacher.reload();
  await expect(teacher.getByText("1 / 1")).toBeVisible();
  const row = teacher.getByRole("row", { name: /Sam Student/ });
  await expect(row.getByText("Completed")).toBeVisible();
  await row.getByRole("button", { name: "View chat" }).click();
  await expect(teacher.getByRole("dialog").getByText("Plants use sunlight to make food")).toBeVisible();
});

test("role separation in the UI: students are redirected away from teacher pages", async ({ page }) => {
  const id = unique();
  await signUp(page, { role: "student", name: "Rita", email: `rita${id}@example.com`, school: `Other ${id}` });
  await page.goto("/teacher/assignments");
  await page.waitForURL("**/student");
  await expect(page.getByText("No homework right now")).toBeVisible();
});

test("signed-out users are sent to sign in and returned afterwards", async ({ page }) => {
  const id = unique();
  await signUp(page, { role: "teacher", name: "Theo", email: `theo${id}@example.com`, school: `Return ${id}`, subject: "Maths" });
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.goto("/teacher/students");
  await page.waitForURL(/\/login\?next=/);
  await page.getByLabel("Email").fill(`theo${id}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/teacher/students");
  await expect(page.getByRole("heading", { name: "Students", exact: true, level: 1 })).toBeVisible();
});

test("public pages are accessible", async ({ page }) => {
  for (const path of ["/", "/login", "/signup"]) {
    await page.goto(path);
    await expectAccessible(page);
  }
});
