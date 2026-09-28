import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { TranscriptionResult } from "@shared/api";
import { speakText, stopSpeaking, speechSynthesisSupported, type VoicePreference } from "./speech";

/**
 * Voice conversation state machine.
 *
 *  idle ──tap──▶ requesting (mic permission) ──▶ listening ──silence/stop──▶ [transcribing] ──▶ thinking
 *    ▲                                                                                               │
 *    └──────────── speaking ◀───────────── tutor reply ◀──────────────────────────────────────────────┘
 *                     └─ hands-free: automatically back to listening
 *
 * Speech-to-text uses the browser's SpeechRecognition where available (Chrome, Edge, Safari) and
 * otherwise records audio (MediaRecorder) and sends it to the server for transcription.
 * The microphone is released between turns, so the tutor's voice is never recorded and the
 * browser's "mic in use" indicator is only on while the student is actually speaking.
 */
export type VoiceStatus =
  "idle" | "requesting" | "listening" | "transcribing" | "thinking" | "speaking" | "error" | "denied" | "unsupported";

interface Options {
  /** Sends the transcript; resolves with the tutor's reply text, or null if the turn failed. */
  onUtterance: (text: string) => Promise<string | null>;
  transcriptionEnabled: boolean;
  maxSeconds: number;
}

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickRecorderMime(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m));
}

const SILENCE_MS = 1600;
const PREF_KEY = "learnify-voice-prefs";

function loadPrefs(): { speechOn: boolean; handsFree: boolean; voice: VoicePreference } {
  try {
    return { speechOn: true, handsFree: true, voice: "female", ...JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") };
  } catch {
    return { speechOn: true, handsFree: true, voice: "female" };
  }
}

export function useVoice({ onUtterance, transcriptionEnabled, maxSeconds }: Options) {
  const mode: "speech" | "recorder" | null =
    typeof window === "undefined"
      ? null
      : getRecognitionCtor()
        ? "speech"
        : transcriptionEnabled && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia
          ? "recorder"
          : null;

  const [status, setStatusState] = useState<VoiceStatus>(mode ? "idle" : "unsupported");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(loadPrefs);

  const statusRef = useRef(status);
  const activeRef = useRef(false); // a hands-free conversation is running
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timersRef = useRef<number[]>([]);
  const prefsRef = useRef(prefs);
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  prefsRef.current = prefs;

  const setStatus = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  // Capabilities can change after mount (e.g. server transcription support arrives with the session).
  useEffect(() => {
    if (mode && statusRef.current === "unsupported") setStatus("idle");
    if (!mode && statusRef.current === "idle") setStatus("unsupported");
  }, [mode, setStatus]);

  const updatePrefs = useCallback((patch: Partial<typeof prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  const releaseMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const teardownCapture = useCallback(() => {
    clearTimers();
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    releaseMic();
    setInterim("");
  }, [releaseMic]);

  /** Opens the mic and drives the level meter used by the waveform. */
  const openMic = useCallback(
    async (onLevel?: (l: number) => void): Promise<MediaStream | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        streamRef.current = stream;
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let last = 0;
        const tick = (t: number) => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
          onLevel?.(rms);
          if (t - last > 60) {
            setLevel(rms);
            last = t;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return stream;
      } catch (error) {
        const name = (error as DOMException)?.name;
        if (name === "NotAllowedError" || name === "SecurityError") setStatus("denied");
        else if (name === "NotFoundError") {
          setHint("No microphone was found. You can type your answer instead.");
          setStatus("error");
        } else {
          setHint("We couldn't start your microphone. You can type your answer instead.");
          setStatus("error");
        }
        activeRef.current = false;
        return null;
      }
    },
    [setStatus],
  );

  const speak = useCallback(
    async (text: string) => {
      if (!prefsRef.current.speechOn || !speechSynthesisSupported()) return;
      setStatus("speaking");
      await speakText(text, prefsRef.current.voice);
      if (statusRef.current === "speaking") setStatus("idle");
    },
    [setStatus],
  );

  // Forward declaration so finish() can loop back into listening.
  const startListeningRef = useRef<() => Promise<void>>(async () => {});

  const finish = useCallback(
    async (text: string) => {
      teardownCapture();
      const transcript = text.trim();
      if (!transcript) {
        setHint("We didn't catch that — tap the microphone and try again.");
        setStatus("idle");
        activeRef.current = false;
        return;
      }
      setStatus("thinking");
      const reply = await onUtteranceRef.current(transcript);
      if (!reply) {
        // The chat shows the error and a retry; voice waits for the student.
        activeRef.current = false;
        setStatus("idle");
        return;
      }
      await speak(reply);
      // The student may have interrupted (tapped the mic) or cancelled while the tutor spoke.
      if (statusRef.current !== "idle" && statusRef.current !== "thinking") return;
      if (activeRef.current && prefsRef.current.handsFree && document.visibilityState === "visible") {
        await startListeningRef.current();
      } else {
        activeRef.current = false;
        setStatus("idle");
      }
    },
    [setStatus, speak, teardownCapture],
  );

  const listenWithSpeechApi = useCallback(async () => {
    const Ctor = getRecognitionCtor()!;
    const stream = await openMic();
    if (!stream) return;
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
    let finalText = "";
    let restarts = 0;

    const scheduleFinish = () => {
      clearTimers();
      timersRef.current.push(window.setTimeout(() => finish(finalText), SILENCE_MS));
    };
    timersRef.current.push(window.setTimeout(() => finish(finalText), maxSeconds * 1000));

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `;
        else live += r[0].transcript;
      }
      setInterim((finalText + live).trim());
      if (finalText.trim()) scheduleFinish();
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        teardownCapture();
        activeRef.current = false;
        setStatus("denied");
      } else if (event.error === "no-speech") {
        // Handled in onend (restart or give up)
      } else {
        teardownCapture();
        activeRef.current = false;
        setHint(
          event.error === "network"
            ? "Voice recognition needs an internet connection. You can type instead."
            : "Voice input stopped unexpectedly. Tap the microphone to try again.",
        );
        setStatus("error");
      }
    };
    rec.onend = () => {
      if (recognitionRef.current !== rec || statusRef.current !== "listening") return;
      if (finalText.trim()) return finish(finalText);
      // Browsers end recognition after a stretch of silence; restart a couple of times.
      if (restarts++ < 2) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through */
        }
      }
      teardownCapture();
      activeRef.current = false;
      setHint("We didn't hear anything — tap the microphone when you're ready.");
      setStatus("idle");
    };
    setStatus("listening");
    rec.start();
  }, [finish, maxSeconds, openMic, setStatus, teardownCapture]);

  const listenWithRecorder = useCallback(async () => {
    let heard = false;
    let quietSince = 0;
    const stream = await openMic((l) => {
      if (l > 0.12) {
        heard = true;
        quietSince = 0;
      } else if (heard && l < 0.05) {
        quietSince ||= performance.now();
        if (performance.now() - quietSince > SILENCE_MS && recorderRef.current?.state === "recording") recorderRef.current.stop();
      }
    });
    if (!stream) return;
    const mimeType = pickRecorderMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      recorderRef.current = null;
      releaseMic();
      clearTimers();
      if (!heard) {
        activeRef.current = false;
        setHint("We didn't hear anything — tap the microphone when you're ready.");
        setStatus("idle");
        return;
      }
      setStatus("transcribing");
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), "recording");
      try {
        const { text } = await api<TranscriptionResult>("POST", "/api/student/transcriptions", form);
        await finish(text);
      } catch (error) {
        activeRef.current = false;
        setHint(error instanceof ApiError ? error.message : "We couldn't transcribe that. Please try again or type your answer.");
        setStatus("error");
      }
    };
    timersRef.current.push(window.setTimeout(() => recorder.state === "recording" && recorder.stop(), maxSeconds * 1000));
    setStatus("listening");
    recorder.start(250);
  }, [finish, maxSeconds, openMic, releaseMic, setStatus]);

  const startListening = useCallback(async () => {
    if (!mode) return;
    stopSpeaking();
    teardownCapture();
    setHint(null);
    setInterim("");
    activeRef.current = true;
    setStatus("requesting");
    if (mode === "speech") await listenWithSpeechApi();
    else await listenWithRecorder();
  }, [listenWithRecorder, listenWithSpeechApi, mode, setStatus, teardownCapture]);
  startListeningRef.current = startListening;

  /** Ends the current utterance early (sends what was said so far). */
  const stopListening = useCallback(() => {
    if (statusRef.current !== "listening") return;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else if (recognitionRef.current) {
      clearTimers();
      recognitionRef.current.stop(); // onend → finish with final text
    }
  }, []);

  /** Stops everything (conversation, capture and speech) and returns to idle. */
  const cancel = useCallback(() => {
    activeRef.current = false;
    stopSpeaking();
    teardownCapture();
    if (statusRef.current !== "unsupported" && statusRef.current !== "denied") setStatus("idle");
  }, [setStatus, teardownCapture]);

  // Never keep listening in a background tab.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && ["listening", "requesting"].includes(statusRef.current) && cancel();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  return {
    mode,
    status,
    interim,
    level,
    hint,
    prefs,
    updatePrefs,
    startListening,
    stopListening,
    cancel,
    speak,
    clearHint: () => setHint(null),
    resetDenied: () => setStatus(mode ? "idle" : "unsupported"),
  };
}

export type VoiceController = ReturnType<typeof useVoice>;
