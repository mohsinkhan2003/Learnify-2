import { Loader2, Mic, MicOff, Square, Volume2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "./use-voice";

const LABELS: Record<VoiceStatus, { title: string; detail: string }> = {
  idle: { title: "Tap to talk", detail: "Your tutor will listen when you tap the microphone." },
  requesting: { title: "Starting microphone…", detail: "If your browser asks, choose Allow." },
  listening: { title: "Listening", detail: "Speak naturally — we'll send it when you pause." },
  transcribing: { title: "Got it — writing that down", detail: "Turning your voice into text…" },
  thinking: { title: "Tutor is thinking", detail: "Your answer was sent." },
  speaking: { title: "Tutor is speaking", detail: "Tap to interrupt and answer." },
  error: { title: "Voice paused", detail: "Tap to try again, or type below." },
  denied: { title: "Microphone blocked", detail: "Allow microphone access to talk, or type below." },
  unsupported: { title: "Voice isn't available here", detail: "Type your answers below." },
};

export function voiceStatusText(status: VoiceStatus) {
  return LABELS[status];
}

/** Live waveform: five bars driven by the microphone level. */
function Waveform({ level }: { level: number }) {
  const weights = [0.45, 0.75, 1, 0.75, 0.45];
  return (
    <span className="flex h-7 items-center gap-1" aria-hidden>
      {weights.map((w, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-primary-foreground transition-[height] duration-75"
          style={{ height: `${Math.max(18, Math.min(100, (0.18 + level * 1.6 * w) * 100))}%` }}
        />
      ))}
    </span>
  );
}

function SpeakingBars() {
  return (
    <span className="flex h-7 items-center gap-1" aria-hidden>
      {[0, 150, 300, 150, 0].map((delay, i) => (
        <span
          key={i}
          className="h-full w-1.5 origin-center animate-breathe rounded-full bg-primary-foreground/90 motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}

/**
 * The primary voice control. One large button whose appearance, label and accessible name
 * always reflect exactly what the tutor is doing, so students never wonder if they were heard.
 */
export function VoiceButton({
  status,
  level,
  onStart,
  onStop,
  onInterrupt,
  size = "lg",
}: {
  status: VoiceStatus;
  level: number;
  onStart: () => void;
  onStop: () => void;
  onInterrupt: () => void;
  size?: "lg" | "md";
}) {
  const busy = status === "transcribing" || status === "thinking" || status === "requesting";
  const disabled = busy || status === "unsupported";
  const action = status === "listening" ? onStop : status === "speaking" ? onInterrupt : onStart;
  const aria =
    status === "listening"
      ? "Stop and send what you said"
      : status === "speaking"
        ? "Interrupt the tutor and start talking"
        : busy
          ? LABELS[status].title
          : "Start talking to your tutor";

  const dims = size === "lg" ? "h-20 w-20" : "h-14 w-14";
  return (
    <span className="relative inline-flex">
      {status === "listening" && (
        <>
          <span className={cn("absolute inset-0 animate-pulse-ring rounded-full bg-primary/40 motion-reduce:hidden", dims)} aria-hidden />
          <span
            className={cn(
              "absolute inset-0 animate-pulse-ring rounded-full bg-primary/30 [animation-delay:0.6s] motion-reduce:hidden",
              dims,
            )}
            aria-hidden
          />
        </>
      )}
      <button
        type="button"
        onClick={action}
        disabled={disabled}
        aria-label={aria}
        className={cn(
          "relative flex items-center justify-center rounded-full text-primary-foreground shadow-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-not-allowed",
          dims,
          status === "listening" && "scale-105 bg-primary",
          status === "speaking" && "bg-gradient-to-br from-accent-strong to-primary",
          (status === "idle" || status === "error") && "bg-gradient-to-br from-primary to-accent-strong hover:scale-105",
          busy && "bg-primary/80",
          status === "denied" && "bg-muted-foreground",
          status === "unsupported" && "bg-muted text-muted-foreground shadow-none",
        )}
      >
        {status === "listening" ? (
          <span className="flex flex-col items-center gap-1">
            <Waveform level={level} />
            {size === "lg" && <Square className="size-3 fill-current" aria-hidden />}
          </span>
        ) : status === "speaking" ? (
          <SpeakingBars />
        ) : busy ? (
          <Loader2 className={cn("animate-spin", size === "lg" ? "size-7" : "size-5")} aria-hidden />
        ) : status === "denied" || status === "unsupported" ? (
          <MicOff className={size === "lg" ? "size-7" : "size-5"} aria-hidden />
        ) : status === "error" ? (
          <AlertCircle className={size === "lg" ? "size-7" : "size-5"} aria-hidden />
        ) : (
          <Mic className={size === "lg" ? "size-8" : "size-6"} aria-hidden />
        )}
      </button>
    </span>
  );
}

/** Explains how to re-enable the microphone after the student (or browser) blocked it. */
export function MicDeniedHelp({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">
      <p className="font-semibold text-warning">Your microphone is blocked</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/80">
        <li>Click the lock or settings icon next to the web address.</li>
        <li>
          Set <strong>Microphone</strong> to <strong>Allow</strong>.
        </li>
        <li>Reload this page — your conversation is saved.</li>
      </ol>
      <p className="mt-2 text-foreground/80">You can keep going by typing in the box below.</p>
      <button onClick={onDismiss} className="mt-3 text-sm font-medium text-primary hover:underline">
        I've allowed it — try again
      </button>
    </div>
  );
}

export function SpeakerToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Volume2 className={cn("size-3.5", !on && "opacity-40")} aria-hidden />
      {on ? "Tutor voice on" : "Tutor voice off"}
    </button>
  );
}
