import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDown, Loader2, Mic, Pencil, RotateCcw, SendHorizontal, Sparkles, Volume2 } from "lucide-react";
import type { ChatMessageDto } from "@shared/api";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PendingMessage } from "./use-tutor-session";

const NATIVE_AUTOSIZE = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");

export function TutorAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-strong text-white shadow-sm",
        className,
      )}
      aria-hidden
    >
      <Sparkles className="size-4" />
    </span>
  );
}

function ThinkingBubble({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-2.5 animate-fade-in">
      <TutorAvatar />
      <div className="rounded-2xl rounded-bl-md border bg-card px-4 py-3 shadow-xs" role="status" aria-label={label}>
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((d) => (
            <span key={d} className="h-2 w-2 animate-thinking-dot rounded-full bg-primary/70" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

function Message({ m, onReplay }: { m: ChatMessageDto; onReplay?: (text: string) => void }) {
  const tutor = m.role === "ai";
  const summary = m.stage === "SUMMARY";
  return (
    <li className={cn("flex animate-fade-up items-end gap-2.5", !tutor && "flex-row-reverse")}>
      {tutor && <TutorAvatar />}
      <div className={cn("group flex max-w-[85%] flex-col sm:max-w-[75%]", !tutor && "items-end")}>
        <div
          className={cn(
            "whitespace-pre-wrap break-words px-4 py-2.5 text-body shadow-xs",
            tutor ? "rounded-2xl rounded-bl-md border bg-card" : "rounded-2xl rounded-br-md bg-primary text-primary-foreground",
            summary && "border-primary/30 bg-gradient-to-br from-primary-soft to-card",
          )}
        >
          {summary && (
            <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="size-3.5" aria-hidden /> Summary
            </span>
          )}
          {m.content}
        </div>
        <div className="mt-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span className="sr-only">{tutor ? "Tutor" : "You"},</span>
          <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
          {m.source === "voice" && (
            <span className="inline-flex items-center gap-1">
              <Mic className="size-3" aria-hidden /> spoken
            </span>
          )}
          {tutor && onReplay && (
            <button
              onClick={() => onReplay(m.content)}
              className="inline-flex items-center gap-1 rounded px-1 opacity-70 hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
              aria-label="Read this message aloud"
            >
              <Volume2 className="size-3" aria-hidden /> Listen
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Conversation transcript. Auto-scrolls only if the student is already near the bottom, so
 * scrolling up to reread something is never interrupted; a pill offers to jump back down.
 */
export function MessageList({
  messages,
  pending,
  thinking,
  onRetry,
  onEdit,
  onReplay,
  liveTranscript,
}: {
  messages: ChatMessageDto[];
  pending: PendingMessage | null;
  thinking: boolean;
  onRetry: () => void;
  onEdit: () => void;
  onReplay?: (text: string) => void;
  liveTranscript?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const programmaticRef = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const count = messages.length + (pending ? 1 : 0) + (thinking ? 1 : 0);
  const lastRole = messages[messages.length - 1]?.role;

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    programmaticRef.current = !smooth;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    nearBottomRef.current = true;
    setShowJump(false);
  };

  useLayoutEffect(() => {
    // Next frame, after layout has happened anyway (avoids a forced synchronous reflow on load).
    const raf = requestAnimationFrame(() => scrollToBottom());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Follow new content if the student is at the bottom, or if they just sent something themselves.
  useEffect(() => {
    if (nearBottomRef.current || pending?.state === "sending" || lastRole === "student") scrollToBottom();
    else setShowJump(true);
  }, [count, lastRole, pending?.state]);

  useEffect(() => {
    if (liveTranscript && nearBottomRef.current) scrollToBottom();
  }, [liveTranscript]);

  // Keep pinned to the bottom when the viewport resizes (dock grows, keyboard opens on mobile).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => nearBottomRef.current && scrollToBottom());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          if (programmaticRef.current) {
            programmaticRef.current = false;
            return;
          }
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (nearBottomRef.current) setShowJump(false);
        }}
        className="scrollbar-thin h-full overflow-y-auto px-4 py-6 sm:px-6"
        role="log"
        aria-label="Conversation with your tutor"
        aria-live="polite"
        aria-relevant="additions"
      >
        <ol className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.map((m) => (
            <Message key={m.id} m={m} onReplay={onReplay} />
          ))}
          {pending && (
            <li className="flex flex-col items-end gap-1">
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-4 py-2.5 text-body sm:max-w-[75%]",
                  pending.state === "sending"
                    ? "bg-primary/70 text-primary-foreground"
                    : "border border-destructive/40 bg-destructive-soft text-foreground",
                )}
              >
                {pending.content}
              </div>
              {pending.state === "sending" ? (
                <span className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Sending…
                </span>
              ) : (
                <div role="alert" className="flex flex-wrap items-center justify-end gap-2 px-1 text-xs">
                  <span className="text-destructive">{pending.error}</span>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onRetry}>
                    <RotateCcw aria-hidden /> Retry
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                </div>
              )}
            </li>
          )}
          {liveTranscript && (
            <li className="flex justify-end" aria-hidden>
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed border-primary/40 bg-primary-soft px-4 py-2.5 text-body italic text-primary-strong dark:text-primary sm:max-w-[75%]">
                {liveTranscript}
              </div>
            </li>
          )}
          {thinking && <ThinkingBubble label="Tutor is thinking" />}
        </ol>
      </div>
      {showJump && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-md"
        >
          <ArrowDown className="size-3.5" aria-hidden /> New messages
        </button>
      )}
    </div>
  );
}

/** Text input that grows with content. Enter sends, Shift+Enter adds a line. */
export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  maxLength,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  maxLength: number;
  placeholder: string;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;

  useLayoutEffect(() => {
    // Browsers with `field-sizing: content` grow the box natively; measure only elsewhere.
    const el = ref.current;
    if (!el || NATIVE_AUTOSIZE) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, ref]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };
  const nearLimit = value.length > maxLength * 0.8;

  return (
    <form
      className="flex flex-1 items-end gap-2 rounded-2xl border bg-card p-1.5 pl-4 shadow-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSend();
      }}
    >
      <label htmlFor="composer" className="sr-only">
        Type your answer
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent [field-sizing:content] py-2 text-body outline-none placeholder:text-muted-foreground/80 focus-visible:ring-0 focus-visible:ring-offset-0"
        aria-describedby={nearLimit ? "composer-count" : undefined}
      />
      {nearLimit && (
        <span id="composer-count" className="self-center text-xs text-muted-foreground">
          {value.length}/{maxLength}
        </span>
      )}
      <Button type="submit" size="icon" className="shrink-0 rounded-xl" disabled={disabled || !value.trim()} aria-label="Send message">
        <SendHorizontal aria-hidden />
      </Button>
    </form>
  );
}
