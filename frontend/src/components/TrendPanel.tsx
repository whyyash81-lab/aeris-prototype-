import { Loader2 } from "lucide-react";
import type { LiveNode, TrendPoint } from "@/lib/types";
import { HAZARD_META, STATE_META } from "@/lib/risk";
import { fmtNumber, pct, timeAgo } from "@/lib/format";
import { RiskChart } from "@/components/RiskChart";

export function TrendPanel({
  nodes,
  selectedId,
  onSelect,
  points,
  loading,
  error,
}: {
  nodes: LiveNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  points: TrendPoint[];
  loading: boolean;
  error: string | null;
}) {
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const meta = selected ? STATE_META[selected.riskLevel] : null;
  const haze = selected ? HAZARD_META[selected.hazardType] : null;

  return (
    <div className="flex h-full flex-col border-t border-white/5 bg-black">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Risk history</span>

        <select
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="ml-2 w-[170px] bg-black text-white border border-border-strong px-2 py-1 font-mono text-[10px] outline-none"
        >
          {nodes.map((n) => <option key={n.id} value={n.id} className="bg-black text-white">{n.name}</option>)}
        </select>

{selected && (
          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span className="text-[11px] leading-none" title={haze?.label}>{haze?.emoji}</span>
            <span className="font-mono uppercase tracking-wider">{meta?.label}</span>
            <span className="numeric font-mono" style={{ color: meta?.hex }}>
              {selected.score != null ? Math.round(selected.score) : "—"}/100
            </span>
            <span>conf <b className="text-white/80">{selected.confidence != null ? pct(selected.confidence) : "—"}</b></span>
            <span className="hidden sm:inline">· last {selected.latestAt != null ? timeAgo(selected.latestAt) : "—"}</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 px-2 pb-2 pt-1">
        {loading && <div className="flex h-full items-center justify-center text-zinc-500 text-xs"><Loader2 className="size-3 animate-spin mr-1" />loading…</div>}
        {error && <div className="flex h-full items-center justify-center text-critical text-xs font-mono">{error}</div>}
        {!loading && !error && points.length < 2 && <div className="flex h-full items-center justify-center text-zinc-500 text-xs">No history</div>}
        {!loading && !error && points.length >= 2 && (
          <>
            <div className="h-[140px]"><RiskChart points={points} color={selected?.riskLevel === "critical" ? "var(--color-critical)" : "var(--color-white)"} /></div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-zinc-500 border-t border-white/5 pt-1">
              {haze?.metrics.map((m) => {
                const v = selected?.metrics?.[m.key];
                return (
                  <span key={m.key} className="flex items-center gap-1">
                    <span>{m.label}</span>
                    <b className="numeric font-mono text-white/80">
                      {typeof v === "number" ? fmtNumber(v, m.decimals) : v === true ? "ON" : v === false ? "off" : "—"}
                      {typeof v === "number" && m.unit && <span className="ml-0.5 text-zinc-500">{m.unit}</span>}
                    </b>
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}