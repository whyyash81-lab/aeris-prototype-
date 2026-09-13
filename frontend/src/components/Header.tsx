import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PushState } from "@/hooks/useFcm";
import { PushToggle } from "@/components/PushToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArchMark } from "@/components/Logo";
import { LogOut } from "lucide-react";

export function Header({
  live,
  lastUpdated,
  onSignOut,
  ...push
}: {
  live: boolean;
  lastUpdated: number;
  onSignOut?: () => void;
} & PushState & { toggle: () => Promise<void> }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hm = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const sec = now.getSeconds().toString().padStart(2, "0");
  const date = now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
  const lastSeen = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-IN", { hour12: false })
    : null;

  return (
    <header className="flex h-12 items-center justify-between border-b border-white/5 px-4">
      <div className="flex items-center gap-3">
        <ArchMark className="size-5 shrink-0 text-arch" />
        <span className="text-lg font-semibold tracking-tight">AERIS</span>
        <span className="text-[10px] tracking-widest uppercase text-zinc-500 hidden sm:inline">Resilient Environmental Monitoring</span>
      </div>

      <div className="flex items-center gap-6">
        <PushToggle {...push} />

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className={cn("w-1.5 h-1.5 rounded-full", live ? "bg-arch" : "bg-zinc-600")} />
          <span className={cn("uppercase tracking-wider", live ? "text-white" : "text-zinc-500")}>
            {live ? "live" : "connecting"}
          </span>
        </div>

        <div className="w-px h-5 bg-white/5" />

        <div className="text-right leading-none">
          <div className="numeric font-mono text-sm font-medium">
            {hm}<span className="text-zinc-500">:{sec}</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {date}{lastSeen && <span className="normal-case"> · last {lastSeen}</span>}
          </div>
        </div>

        {onSignOut && (
          <>
            <div className="w-px h-5 bg-white/5" />
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="icon-btn flex size-7 shrink-0 items-center justify-center border border-border-strong transition-colors"
            >
              <LogOut className="size-3.5" strokeWidth={1.5} />
            </button>
          </>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
}