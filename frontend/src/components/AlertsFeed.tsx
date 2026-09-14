import { useMemo, useState } from "react";
import type { AlertDoc, RiskLevel } from "@/lib/types";
import { HAZARD_META, RISK_COLORS, RISK_ORDER } from "@/lib/risk";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type LevelFilter = RiskLevel | "all";
const LEVELS: LevelFilter[] = ["all", ...RISK_ORDER];

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", { hour12: false });
}

function severityChar(level: RiskLevel): string {
  return level === "critical" ? "●" : level === "high" ? "▲" : level === "warning" ? "■" : "○";
}

export function AlertsFeed({
  alerts,
  onSelectNode,
}: { alerts: AlertDoc[]; onSelectNode?: (nodeId: string) => void }) {
  const [filter, setFilter] = useState<LevelFilter>("all");
  /** Exact severity match per tab — "NORMAL" shows only normal, etc. (a
   *  threshold comparison previously made the NORMAL tab identical to ALL and
   *  hid the ability to isolate a single level except CRITICAL). */
  const filtered = useMemo(
    () => alerts.filter((a) => filter === "all" || a.riskLevel === filter),
    [alerts, filter]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Event stream</span>
        <span className="font-mono text-[10px] text-zinc-500">{filtered.length.toString().padStart(2, "0")} / {alerts.length.toString().padStart(2, "0")}</span>
      </div>

      <div className="flex gap-1 px-2 py-1.5 border-b border-white/5">
        {LEVELS.map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={cn(
              "px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors border-b-2",
              filter === lvl ? "border-arch text-white" : "border-transparent text-zinc-500 hover:text-white"
            )}
          >
            {lvl === "all" ? "ALL" : RISK_COLORS[lvl].label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          {filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-zinc-500 text-xs">No {filter === "all" ? "" : filter + " "}events</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {filtered.map((a) => {
                const risk = a.riskLevel;
                const critical = risk === "critical";
                return (
                  <li
                    key={a.id}
                    className={cn("px-3 py-2 transition-colors hover:bg-white/2", critical && "bg-critical/[0.02]")}
                    onClick={() => onSelectNode?.(a.nodeId)}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("font-mono text-[10px]", critical ? "text-critical" : "text-zinc-400")}>
                        {severityChar(risk)}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        <span className="text-[11px] leading-none">{HAZARD_META[a.hazardType ?? a.nodeType].emoji}</span>
                        {HAZARD_META[a.hazardType ?? a.nodeType].label.toUpperCase()}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-zinc-500">{clock(a.createdAt)}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{a.nodeName}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 line-clamp-1">{a.message}</div>
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-zinc-500">
                      <span>conf <b className="text-white/80 numeric">{Math.round(a.confidence * 100)}%</b></span>
                      {a.zoneId && <span className="font-mono uppercase tracking-wider">{a.zoneId}</span>}
                      <span className="ml-auto">{a.notified && "pushed"}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}