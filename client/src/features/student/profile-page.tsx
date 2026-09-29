import { useLocation } from "wouter";
import { Bell, BellOff, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/states";
import { useTheme, type Theme } from "@/app/theme";
import { useAuth, useLogout } from "@/features/auth/use-auth";
import { usePush } from "@/features/notifications/use-push";
import { InstallCard } from "@/features/pwa/install-card";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Automatic", icon: Monitor },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="px-1 text-eyebrow">{title}</h2>
      {children}
    </section>
  );
}

function AlertsRow() {
  const { state, busy, enable, disable } = usePush();
  const { toast } = useToast();
  if (state === "loading" || state === "unavailable") return null;
  const note =
    state === "unsupported"
      ? "On iPhone, add Learnify to your Home Screen first."
      : state === "denied"
        ? "Blocked. Allow notifications for this site in your browser settings."
        : state === "on"
          ? "We'll tell you when new homework arrives."
          : "Get a heads-up when new homework arrives.";
  const canToggle = state === "on" || state === "off";
  return (
    <Section title="Homework alerts">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
          {state === "on" ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
        </span>
        <p className="min-w-0 flex-1 text-helper">{note}</p>
        {canToggle && (
          <Button
            variant={state === "on" ? "outline" : "default"}
            size="sm"
            loading={busy}
            onClick={async () => {
              try {
                await (state === "on" ? disable() : enable());
              } catch {
                toast({ title: "Couldn't update alerts", description: "Please try again.", variant: "destructive" });
              }
            }}
          >
            {state === "on" ? "Turn off" : "Turn on"}
          </Button>
        )}
      </div>
    </Section>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const logout = useLogout();
  const [, navigate] = useLocation();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6 animate-fade-up">
      <PageHeader title="Profile" />
      <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <Avatar className="h-14 w-14 border">
          {user.avatar && <AvatarImage src={user.avatar} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback className="bg-primary-soft text-lg font-semibold text-primary-strong dark:text-primary">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-card-title">{user.name}</p>
          <p className="truncate text-helper">{user.email}</p>
          {user.school && <p className="truncate text-helper">{user.school}</p>}
        </div>
      </div>

      <AlertsRow />

      <Section title="Appearance">
        <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-1.5 shadow-sm">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium text-muted-foreground transition-colors active:scale-95",
                theme === value ? "bg-primary-soft text-primary-strong dark:text-primary" : "hover:bg-muted",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="App">
        <InstallCard variant="row" />
      </Section>

      <Button
        variant="outline"
        size="lg"
        className="w-full text-destructive"
        loading={logout.isPending}
        onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
      >
        <LogOut aria-hidden /> Sign out
      </Button>
    </div>
  );
}
