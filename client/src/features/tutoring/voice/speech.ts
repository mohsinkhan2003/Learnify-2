/** Text-to-speech helpers around the Web Speech API (speechSynthesis). */

export type VoicePreference = "female" | "male";

const FEMALE = [
  "female",
  "woman",
  "samantha",
  "victoria",
  "karen",
  "zira",
  "susan",
  "serena",
  "tessa",
  "moira",
  "fiona",
  "kate",
  "libby",
  "sonia",
  "aria",
  "jenny",
  "google uk english female",
  "google us english",
];
const MALE = ["male", "daniel", "david", "mark", "thomas", "alex", "oliver", "fred", "ryan", "guy", "google uk english male"];

export const speechSynthesisSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length) return voices;
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 800);
  });
}

function pickVoice(voices: SpeechSynthesisVoice[], pref: VoicePreference): SpeechSynthesisVoice | undefined {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const byName = (keys: string[]) => english.find((v) => keys.some((k) => v.name.toLowerCase().includes(k)));
  const local = navigator.language?.toLowerCase();
  const preferred = pref === "female" ? byName(FEMALE) : byName(MALE);
  return preferred ?? english.find((v) => v.lang.toLowerCase() === local) ?? english[0];
}

/** Chrome cuts off long utterances, so speech is queued sentence by sentence. */
function chunk(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

let generation = 0;

export async function speakText(text: string, pref: VoicePreference): Promise<void> {
  if (!speechSynthesisSupported()) return;
  const synth = window.speechSynthesis;
  const my = ++generation;
  synth.cancel();
  const voice = pickVoice(await loadVoices(), pref);
  for (const sentence of chunk(text)) {
    if (my !== generation) return; // interrupted
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(sentence);
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1;
      // Some engines never fire `end`; never leave the conversation stuck in "speaking".
      const words = sentence.split(/\s+/).length;
      const guard = window.setTimeout(resolve, 2500 + words * 650);
      const done = () => {
        window.clearTimeout(guard);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });
  }
}

export function stopSpeaking(): void {
  generation++;
  if (speechSynthesisSupported()) window.speechSynthesis.cancel();
}
