import { Loader2 } from "lucide-react";
import type { PushState } from "@/hooks/useFcm";
import { cn } from "@/lib/utils";

export function PushToggle({
  supported,
  enabled,
  busy,
  error,
  toggle,
}: PushState & { toggle: () => Promise<void> }) {
  if (!supported) return null;
  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={enabled}
      title={error ? `Error: ${error}` : enabled ? "Push on" : "Enable push"}
      className={cn(
        "flex size-8 items-center justify-center text-[11px] font-medium transition-colors",
        enabled
          ? "text-white bg-white/5 hover:bg-white/10"
          : "text-zinc-500 hover:text-white hover:bg-white/3"
      )}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : enabled ? "PUSH" : "PUSH"}
    </button>
  );
}