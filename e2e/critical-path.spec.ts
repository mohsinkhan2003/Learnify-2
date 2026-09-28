import { expect, test } from "@playwright/test";
import { createClassWithAssignment, expectAccessible, sendTyped, signUp, unique } from "./helpers";

test("teacher assigns → student completes a tutoring session → teacher sees progress", async ({ browser }) => {
  const id = unique();
  const school = `E2E School ${id}`;
  const topic = `Photosynthesis ${id}`;

  // --- Teacher creates a class, then an assignment through the wizard
  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await signUp(teacher, { role: "teacher", name: "Tess Teacher", email: `teacher${id}@example.com`, school, subject: "Biology" });
  await expect(teacher.getByRole("heading", { name: /Good (morning|afternoon|evening), Tess/ })).toBeVisible();
  await expectAccessible(teacher);

  await teacher.getByRole("link", { name: "Classes" }).first().click();
  await teacher.getByRole("button", { name: "New class" }).first().click();
  await teacher.getByLabel("Class name").fill("Year 10 Biology");
  await teacher.getByRole("button", { name: "Create class" }).click();
  await expect(teacher.getByRole("heading", { name: "Year 10 Biology" })).toBeVisible();
  const code = (await teacher.getByLabel(/^Class code [A-Z0-9]/).textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await expectAccessible(teacher);

  await teacher.getByRole("link", { name: "New assignment" }).first().click();
  await teacher.getByLabel("Topic").fill(topic);
  await teacher.getByLabel("Year / grade").fill("Year 10");
  await teacher.getByRole("button", { name: /Continue/ }).click();
  await expect(teacher.getByRole("radio", { name: /Year 10 Biology/ })).toHaveAttribute("aria-checked", "true");
  await expect(teacher.getByRole("radio", { name: /The whole class/ })).toHaveAttribute("aria-checked", "true");
  await teacher.getByRole("button", { name: /Continue/ }).click();
  await teacher.getByLabel("Guidance for the tutor").fill("Use everyday examples.");
  await teacher.getByRole("button", { name: /Continue/ }).click();
  await teacher.getByRole("button", { name: /Continue/ }).click();
  await expect(teacher.getByText("Use everyday examples.")).toBeVisible();
  await teacher.getByRole("button", { name: /Publish to students/ }).click();
  await expect(teacher.getByRole("heading", { name: topic })).toBeVisible();
  await expect(teacher.getByText("No one has started yet")).toBeVisible();

  // --- Student at the same school but NOT in the class sees nothing
  const outsider = await (await browser.newContext()).newPage();
  await signUp(outsider, { role: "student", name: "Olly Outsider", email: `outsider${id}@example.com`, school });
  await expect(outsider.getByText("No homework right now")).toBeVisible();
  await expect(outsider.getByText("You're not in a class yet")).toBeVisible();

  // --- Student who signs up with the class code completes it
  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await signUp(student, { role: "student", name: "Sam Student", email: `student${id}@example.com`, school, classCode: code.toLowerCase() });
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
  await teacher.keyboard.press("Escape");

  // --- Teacher edits the assignment after release
  await teacher.getByRole("button", { name: "Edit" }).click();
  await teacher.getByRole("dialog").getByLabel("Topic").fill(`${topic} (revised)`);
  await teacher.getByRole("button", { name: "Save changes" }).click();
  await expect(teacher.getByRole("heading", { name: `${topic} (revised)` })).toBeVisible();

  // --- The outsider joins later with the code and now sees it
  await outsider.getByRole("button", { name: "Join a class" }).click();
  await outsider.getByLabel("Class code").fill(code);
  await outsider.getByRole("button", { name: "Join class" }).click();
  await expect(outsider.getByRole("link", { name: new RegExp(`${topic} \\(revised\\)`) })).toBeVisible();
});

test("password reset via a teacher-generated link", async ({ browser }) => {
  const id = unique();
  const teacher = await (await browser.newContext()).newPage();
  await signUp(teacher, { role: "teacher", name: "Rhea", email: `rhea${id}@example.com`, school: `Reset ${id}`, subject: "History" });
  const code = await createClassWithAssignment(teacher, { topic: "Romans", subject: "History", grade: "Year 7" });

  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await signUp(student, { role: "student", name: "Rob", email: `rob${id}@example.com`, school: `Reset ${id}`, classCode: code });

  await teacher.goto("/teacher/classes");
  await teacher.getByRole("link", { name: /History class/ }).click();
  await teacher.getByRole("row", { name: /Rob/ }).getByRole("button", { name: "Reset password" }).click();
  const url = await teacher.getByRole("dialog").getByLabel("Reset link").inputValue();
  expect(url).toContain("/reset-password?token=");

  // The student's existing session is revoked once the password changes.
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto(url);
  await fresh.getByLabel("New password").fill("a brand new password");
  await fresh.getByLabel("Confirm password").fill("a brand new password");
  await fresh.getByRole("button", { name: "Set password and sign in" }).click();
  await fresh.waitForURL("**/student");
  await expect(fresh.getByRole("link", { name: /Romans/ })).toBeVisible();

  await student.reload();
  await student.waitForURL(/\/login/);

  // The link only works once.
  await fresh.goto(url);
  await fresh.getByLabel("New password").fill("another password 123");
  await fresh.getByLabel("Confirm password").fill("another password 123");
  await fresh.getByRole("button", { name: "Set password and sign in" }).click();
  await expect(fresh.getByText(/expired or was already used/)).toBeVisible();
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
  for (const path of ["/", "/login", "/signup", "/forgot-password", "/reset-password?token=x"]) {
    await page.goto(path);
    await expectAccessible(page);
  }
});

test("network loss while sending: message is kept, can be retried, nothing is duplicated", async ({ browser }) => {
  const id = unique();
  const school = `Offline ${id}`;
  const teacher = await (await browser.newContext()).newPage();
  await signUp(teacher, { role: "teacher", name: "Olga", email: `olga${id}@example.com`, school, subject: "Chemistry" });
  const code = await createClassWithAssignment(teacher, { topic: "Atoms", subject: "Chemistry", grade: "Year 8" });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, { role: "student", name: "Omar", email: `omar${id}@example.com`, school, classCode: code });
  await page.getByRole("link", { name: /Atoms/ }).click();
  await page.getByRole("button", { name: /Type instead/ }).click();
  await expect(page.getByText(/How are you today/)).toBeVisible();

  await ctx.setOffline(true);
  await page.getByLabel("Type your answer").fill("I'm doing well");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/appear to be offline/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeVisible();

  await ctx.setOffline(false);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Are you ready to begin?")).toBeVisible();
  await expect(page.getByText("I'm doing well")).toHaveCount(1);
});

test("a student joins through the teacher's invite link", async ({ browser }) => {
  const id = unique();
  const teacher = await (await browser.newContext()).newPage();
  await signUp(teacher, { role: "teacher", name: "Ines", email: `ines${id}@example.com`, school: `Invite ${id}`, subject: "Geography" });
  await createClassWithAssignment(teacher, { topic: "Rivers", subject: "Geography", grade: "Year 8" });
  await teacher.goto("/teacher/classes");
  await teacher.getByRole("link", { name: /Geography class/ }).click();
  const link = await teacher.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/join\/[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await expect(teacher.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expectAccessible(teacher);

  const student = await (await browser.newContext()).newPage();
  await student.goto(link);
  await expect(student.getByRole("heading", { name: "Join Geography class" })).toBeVisible();
  await expect(student.getByText(/Ines invited you/)).toBeVisible();
  await expectAccessible(student);
  await student.getByRole("link", { name: "Create my student account" }).click();
  // The invite pre-selects "student" and fills in the class code.
  await expect(student.getByRole("radio", { name: /I'm a student/ })).toHaveAttribute("aria-checked", "true");
  await student.getByRole("button", { name: "Continue" }).click();
  await expect(student.getByLabel("Class code (optional)")).toHaveValue(link.split("/join/")[1]);
  await student.getByLabel("Full name").fill("Jules");
  await student.getByLabel("Email").fill(`jules${id}@example.com`);
  await student.getByLabel("Password").fill("correct horse battery");
  await student.getByLabel("School").fill(`Invite ${id}`);
  await student.getByRole("button", { name: "Create account" }).click();
  await student.waitForURL("**/student");
  await expect(student.getByRole("link", { name: /Rivers/ })).toBeVisible();

  // Opening the link again while signed in just confirms membership.
  await student.goto(link);
  await student.getByRole("button", { name: "Join class" }).click();
  await student.waitForURL("**/student");
});
