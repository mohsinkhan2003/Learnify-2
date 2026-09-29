import { expect, test } from "@playwright/test";
import { createClassWithAssignment, signUp, unique } from "./helpers";

/**
 * Phone voice behaviour, with the browser's speech engines replaced by fakes that behave like
 * Chrome on Android: recognition returns only a draft (never a final) result, and speech is
 * only allowed if it was first started inside a tap.
 */
const FAKES = () => {
  type Rec = {
    onresult: ((e: unknown) => void) | null;
    onend: (() => void) | null;
    onspeechstart: (() => void) | null;
    onerror: ((e: unknown) => void) | null;
  };
  const state = { micOpens: 0, spoken: [] as { text: string; inTap: boolean }[], recognitions: 0 };
  (window as unknown as { __voice: typeof state }).__voice = state;

  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async () => {
      state.micOpens++;
      throw new DOMException("blocked in test", "NotAllowedError");
    };
  }

  class FakeRecognition implements Rec {
    continuous = false;
    interimResults = false;
    lang = "en-US";
    onresult: Rec["onresult"] = null;
    onend: Rec["onend"] = null;
    onspeechstart: Rec["onspeechstart"] = null;
    onspeechend: (() => void) | null = null;
    onerror: Rec["onerror"] = null;
    start() {
      const first = state.recognitions++ === 0;
      setTimeout(() => {
        if (first) {
          this.onspeechstart?.();
          const result = Object.assign([{ transcript: "I'm doing well" }], { isFinal: false });
          this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
        }
        this.onend?.(); // Android ends without ever marking the result final
      }, 150);
    }
    stop() {}
    abort() {}
  }
  Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });

  let unlocked = false;
  const synth = {
    speaking: false,
    pending: false,
    speak(u: SpeechSynthesisUtterance) {
      const inTap = navigator.userActivation?.isActive ?? false;
      if (inTap) unlocked = true;
      state.spoken.push({ text: u.text, inTap });
      // Like a phone: silently refuse speech that was never unlocked by a tap.
      setTimeout(() => (unlocked ? u.onend : u.onerror)?.call(u, {} as SpeechSynthesisEvent), 20);
    },
    cancel() {},
    resume() {},
    pause() {},
    getVoices: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
};

test("phone voice: speech unlocks on the first tap, one mic owner, draft transcripts are sent", async ({ browser }) => {
  const id = unique();
  const teacher = await (await browser.newContext()).newPage();
  await signUp(teacher, { role: "teacher", name: "Vera", email: `vera${id}@example.com`, school: `Voice ${id}`, subject: "Biology" });
  const code = await createClassWithAssignment(teacher, { topic: "Cells", subject: "Biology", grade: "Year 7" });

  const ctx = await browser.newContext({ ...(await import("@playwright/test")).devices["Pixel 7"] });
  await ctx.addInitScript(FAKES);
  const page = await ctx.newPage();
  await signUp(page, { role: "student", name: "Pia", email: `pia${id}@example.com`, school: `Voice ${id}`, classCode: code });
  await page.getByRole("link", { name: /Cells/ }).click();
  await page.getByRole("button", { name: /Start talking/ }).click();

  // The student's words reach the tutor even though the engine never produced a final result…
  await expect(page.getByText("I'm doing well")).toBeVisible();
  // …and the tutor's reply is spoken aloud.
  await expect(page.getByText("Are you ready to begin?")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __voice: { spoken: { text: string }[] } }).__voice.spoken.map((s) => s.text).join(" | ")),
    )
    .toContain("Are you ready to begin?");

  const v = await page.evaluate(
    () => (window as unknown as { __voice: { micOpens: number; spoken: { text: string; inTap: boolean }[] } }).__voice,
  );
  expect(v.spoken[0].inTap).toBe(true); // unlocked inside the tap
  expect(v.micOpens).toBe(0); // recognition alone owns the microphone on phones
});
