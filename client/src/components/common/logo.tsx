import { useId } from "react";
import { cn } from "@/lib/utils";

/** Brand mark: a rounded "L" monogram with a spark, drawn inline so it themes with CSS. */
export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: a hidden copy (e.g. the desktop sidebar) must not own the only gradient.
  const gradientId = `lf-grad-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("h-8 w-8", className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--accent-strong))" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path d="M11 8.5v13.5h10" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.5 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="white" opacity=".9" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]">Learnify</span>}
    </span>
  );
}
