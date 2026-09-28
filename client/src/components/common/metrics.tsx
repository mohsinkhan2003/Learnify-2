import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed, Clock3, PlayCircle, Sparkles } from "lucide-react";
import type { ProgressStatus } from "@shared/tutor";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Stat tile: label, value (proportional figures), optional context line. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "attention";
}) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-label text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md [&_svg]:size-4",
              tone === "attention" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary",
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 text-metric">{value}</p>
      {hint && <p className="mt-1 text-helper">{hint}</p>}
    </div>
  );
}

/**
 * Meter for a single ratio. The track is a lighter step of the fill's hue so the state reads
 * across the whole bar; the numeric value is always shown as text alongside.
 */
export function Meter({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-primary-soft", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} of ${max}`}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

const STATUS: Record<ProgressStatus, { label: string; variant: "secondary" | "info" | "accent" | "success"; icon: ReactNode }> = {
  not_started: { label: "Not started", variant: "secondary", icon: <CircleDashed aria-hidden /> },
  in_progress: { label: "In progress", variant: "info", icon: <PlayCircle aria-hidden /> },
  summary_provided: { label: "Ready to complete", variant: "accent", icon: <Sparkles aria-hidden /> },
  completed: { label: "Completed", variant: "success", icon: <CheckCircle2 aria-hidden /> },
};

/** Status is always icon + text, never colour alone. */
export function StatusBadge({ status, className }: { status: ProgressStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge variant={s.variant} className={className}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

export function ScheduledBadge() {
  return (
    <Badge variant="warning">
      <Clock3 aria-hidden /> Scheduled
    </Badge>
  );
}
