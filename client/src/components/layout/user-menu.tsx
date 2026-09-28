import { useLocation } from "wouter";
import { Bell, BellOff, LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { PublicUser } from "@shared/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme, type Theme } from "@/app/theme";
import { useLogout } from "@/features/auth/use-auth";
import { usePush } from "@/features/notifications/use-push";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/format";

function NotificationItem() {
  const { state, busy, enable, disable } = usePush();
  const { toast } = useToast();
  if (state === "loading" || state === "unavailable") return null;
  if (state === "unsupported") {
    return (
      <DropdownMenuItem disabled className="flex-col items-start gap-0.5">
        <span className="flex items-center gap-2">
          <BellOff aria-hidden /> Notifications unavailable
        </span>
        <span className="text-xs text-muted-foreground">On iPhone, add Learnify to your Home Screen first.</span>
      </DropdownMenuItem>
    );
  }
  if (state === "denied") {
    return (
      <DropdownMenuItem disabled className="flex-col items-start gap-0.5">
        <span className="flex items-center gap-2">
          <BellOff aria-hidden /> Notifications blocked
        </span>
        <span className="text-xs text-muted-foreground">Allow them in your browser's site settings.</span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem
      disabled={busy}
      onSelect={async (e) => {
        e.preventDefault();
        try {
          await (state === "on" ? disable() : enable());
        } catch {
          toast({ title: "Couldn't update notifications", description: "Please try again.", variant: "destructive" });
        }
      }}
    >
      {state === "on" ? <BellOff aria-hidden /> : <Bell aria-hidden />}
      {state === "on" ? "Turn off homework alerts" : "Turn on homework alerts"}
    </DropdownMenuItem>
  );
}

export function UserMenu({ user }: { user: PublicUser }) {
  const { theme, setTheme } = useTheme();
  const logout = useLogout();
  const [, navigate] = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Account menu for ${user.name}`}
      >
        <Avatar className="h-9 w-9 border">
          {user.avatar && <AvatarImage src={user.avatar} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback className="bg-primary-soft text-sm font-semibold text-primary-strong dark:text-primary">{initials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          {user.school && <p className="mt-1 truncate text-xs text-muted-foreground">{user.school}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === "student" && (
          <>
            <NotificationItem />
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 size-4" aria-hidden /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 size-4" aria-hidden /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="mr-2 size-4" aria-hidden /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) });
          }}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
