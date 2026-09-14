import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AlertDoc, LiveNode, RiskLevel, SensorReading } from "@/lib/types";
import { HAZARD_META, STATE_META } from "@/lib/risk";
import { fmtNumber, shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  medianCadenceMinutes,
  seriesFor,
  shortHorizonProjection,
  trendSummary,
  windowStats,
  type TrendPointN,
} from "@/lib/trends";

/** Fewer than this many raw readings → show the "not enough data" state. */
const MIN_READINGS = 5;

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", { hour12: false });
}

/**
 * Measures its host element's live pixel width (ResizeObserver + an immediate
 * read after mount). Recharts' ResponsiveContainer can render with a 0-width
 * frame when it mounts inside a freshly-opening drawer/overlay before layout
 * has settled — the chart then collapses and only the fixed Y-axis labels
 * remain visible. We instead measure the wrapper ourselves and hand an
 * explicit pixel width to LineChart, so a real chart always renders whether
 * the drawer opens on a wide desktop or a narrow window.
 */
function useChartWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      setWidth((prev) => (prev === w ? prev : w));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

function MetricChart({
  points,
  color,
  unit,
  decimals,
  danger,
}: {
  points: TrendPointN[];
  color: string;
  unit: string;
  decimals: number;
  danger: number;
}) {
  const data = useMemo(() => points.map((p) => ({ t: p.t, v: p.v })), [points]);
  const [ref, width] = useChartWidth<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="relative w-full min-w-0 overflow-hidden"
      style={{ height: 104 }}
    >
      {width > 8 && (
        <LineChart width={width} height={104} data={data} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#232323" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis
            domain={["auto", "auto"]}
            width={46}
            tickFormatter={(v: number) => fmtNumber(v, decimals)}
            stroke="#404040"
            tick={{ fontSize: 8, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "#404040", strokeDasharray: "2 4" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const value = Number(payload[0].value);
              return (
                <div className="bg-popover border border-border px-2 py-1.5">
                  <div className="font-mono text-[9px] text-muted-foreground">{shortTime(Number(label))}</div>
                  <div className="mt-0.5 font-mono numeric text-sm" style={{ color }}>
                    {Number.isFinite(value) ? fmtNumber(value, decimals) : "—"}
                    {unit && <span className="ml-1 text-[9px] text-muted-foreground">{unit}</span>}
                  </div>
                </div>
              );
            }}
          />
          <ReferenceLine y={danger} stroke="#404040" strokeDasharray="2 3" strokeWidth={1} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 2.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </div>
  );
}

const DIRECTION_META: Record<"rising" | "falling" | "stable", { label: string; cls: string }> = {
  rising: { label: "Rising", cls: "text-critical" },
  falling: { label: "Falling", cls: "text-arch" },
  stable: { label: "Stable", cls: "text-zinc-400" },
};

export function NodeDetailDrawer({
  node,
  readings,
  loading,
  error,
  alerts,
  onClose,
}: {
  node: LiveNode | null;
  readings: SensorReading[];
  loading: boolean;
  error: string | null;
  alerts: AlertDoc[];
  onClose: () => void;
}) {
  const hazard = node?.hazardType ?? null;
  const meta = hazard ? HAZARD_META[hazard] : null;

  /**
   * The risk-driving metric featured in Trend / Projection / Window. Prefer the
   * declared primary (metrics[0]) for this hazardType, but sensor presence is
   * not uniform across nodes (e.g. some pollution nodes carry no pm25, some
   * fire nodes no gasPpm). If the declared primary has no data for THIS node,
   * fall back to the first declared metric that actually has enough readings,
   * so the drawer works for every node of every hazard type.
   */
  const primary = useMemo(() => {
    if (!meta) return null;
    const withData = meta.metrics.find((m) => seriesFor(readings, m.key).length >= MIN_READINGS);
    return withData ?? meta.metrics[0] ?? null;
  }, [meta, readings]);

  const series = useMemo(
    () => (primary ? seriesFor(readings, primary.key) : []),
    [readings, primary]
  );
  const enough = series.length >= MIN_READINGS;

  const summary = useMemo(() => trendSummary(series), [series]);
  const projection = useMemo(
    () => (primary ? shortHorizonProjection(series, primary.dangerThreshold) : null),
    [series, primary]
  );
  const stats = useMemo(() => windowStats(series), [series]);
  const cadenceMin = useMemo(
    () => medianCadenceMinutes(series.map((p) => p.t)),
    [series]
  );

  const nodeAlerts = useMemo(
    () =>
      alerts
        .filter((a) => a.nodeId === node?.id)
        .slice(0, 5),
    [alerts, node?.id]
  );

  const riskMeta = node ? STATE_META[node.riskLevel] : null;

  return (
    <div className="absolute inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close node insights"
      />
      <aside className="relative flex h-full w-full max-w-[420px] flex-col border-l border-white/5 bg-black text-white">
        {/* ---------- header: name, hazard type, status, score ---------- */}
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] leading-none">{meta?.emoji}</span>
              <h2 className="truncate text-base font-semibold tracking-tight">{node?.name ?? "—"}</h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
              <span>{meta?.label.toUpperCase()}</span>
              <span className="text-zinc-700">·</span>
              <span className="font-mono">{node?.id}</span>
              <span
                className="rounded border border-white/10 px-1.5 py-0.5 font-medium"
                style={{ color: riskMeta?.hex }}
              >
                {riskMeta?.label}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="icon-btn flex size-7 shrink-0 items-center justify-center border border-border-strong transition-colors"
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {(() => {
            if (!node) return null;
            if (error) {
              return (
                <div className="px-4 py-4">
                  <div className="border border-critical/30 bg-critical/5 px-3 py-2.5 font-mono text-[10px] text-critical whitespace-pre-wrap">
                    READINGS: {error}
                  </div>
                </div>
              );
            }
            if (loading) {
              return (
                <div className="flex h-40 items-center justify-center text-xs text-zinc-500">
                  loading readings…
                </div>
              );
            }
            if (!enough) {
              return (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm font-medium text-zinc-300">Not enough data yet for trend analysis</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    {node.id} has {series.length} reading{series.length === 1 ? "" : "s"} in Firestore so far —
                    keep the simulator/feed running and reopen this panel once it passes{" "}
                    {MIN_READINGS} readings (~every 3 seconds).
                  </p>
                </div>
              );
            }

            return (
              <>
                {/* ----- 1. current risk score / confidence / status ----- */}
                <div className="grid grid-cols-3 gap-px border-b border-white/5 bg-white/5 px-4 py-3">
                  <div className="bg-black pr-3">
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">Risk score</div>
                    <div className="mt-0.5 numeric font-mono text-lg" style={{ color: riskMeta?.hex }}>
                      {node.score != null ? Math.round(node.score) : "—"}
                      <span className="text-[10px] text-zinc-500">/100</span>
                    </div>
                  </div>
                  <div className="bg-black px-3">
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">Confidence</div>
                    <div className="mt-0.5 numeric font-mono text-lg text-white">
                      {node.confidence != null ? Math.round(node.confidence * 100) : "—"}
                      <span className="text-[10px] text-zinc-500">%</span>
                    </div>
                  </div>
                  <div className="bg-black pl-3">
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">Registry</div>
                    <div className="mt-0.5 font-mono text-lg uppercase" style={{ color: riskMeta?.hex }}>
                      {node.status}
                    </div>
                  </div>
                </div>

                {/* ----- 2. multi-metric historical charts (raw readings) ----- */}
                <div className="border-b border-white/5 px-4 py-3">
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 mb-2">
                    Raw sensor history · last {readings.length} readings
                  </h3>
                  <div className="space-y-3">
                    {meta?.metrics.map((m) => {
                      const pts = seriesFor(readings, m.key);
                      if (pts.length < 2) return null;
                      return (
                        <div key={m.key}>
                          <div className="mb-0.5 flex items-center justify-between text-[10px]">
                            <span className="text-zinc-500">
                              {m.label}
                              {m.unit && <span className="ml-1 text-zinc-600">{m.unit}</span>}
                            </span>
                            <span className="font-mono numeric" style={{ color: m.color }}>
                              {fmtNumber(pts[pts.length - 1].v, m.decimals)}
                            </span>
                          </div>
                          <MetricChart
                            points={pts}
                            color={m.color}
                            unit={m.unit}
                            decimals={m.decimals}
                            danger={m.dangerThreshold}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[9px] text-zinc-600">
                    dashed line = danger threshold · y-axis auto-scaled per sensor
                  </p>
                </div>

                {/* ----- 3. trend summary (moving-average comparison) ----- */}
                <div className="border-b border-white/5 px-4 py-3">
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 mb-1.5">
                    Trend · {primary?.label}
                  </h3>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={cn("font-medium", DIRECTION_META[summary.direction].cls)}>
                      {DIRECTION_META[summary.direction].label}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-400">{summary.rateLabel}</span>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
                    Simple moving-average comparison: mean of the last ~10 readings vs the ~10 before them.
                  </p>
                </div>

                {/* ----- 4. short-horizon projection (linear regression) ----- */}
                <div className="border-b border-white/5 px-4 py-3">
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 mb-1.5">
                    Projection
                  </h3>
                  {projection && projection.kind === "crosses" && (
                    <p className="text-sm leading-snug">
                      At this rate, {primary?.label.toLowerCase()} reaches the danger threshold{" "}
                      <b className="numeric font-mono">
                        {fmtNumber(primary?.dangerThreshold ?? 0, primary?.decimals ?? 0)}
                        {primary?.unit}
                      </b>{" "}
                      in ~<b>{projection.minutes}</b> min.
                    </p>
                  )}
                  {projection && projection.kind === "away" && (
                    <p className="text-sm leading-snug text-zinc-400">
                      No concerning trend — {primary?.label.toLowerCase()} moving away from the danger threshold (
                      {fmtNumber(primary?.dangerThreshold ?? 0, primary?.decimals ?? 0)}
                      {primary?.unit}).
                    </p>
                  )}
                  {projection && projection.kind === "flat" && (
                    <p className="text-sm leading-snug text-zinc-400">Stable — no significant trend.</p>
                  )}
                  {projection && projection.kind === "above" && (
                    <p className="text-sm leading-snug text-critical">
                      Already at/above the danger threshold ({fmtNumber(primary?.dangerThreshold ?? 0, 0)}
                      {primary?.unit}).
                    </p>
                  )}
                  {projection && projection.kind === "none" && (
                    <p className="text-sm leading-snug text-zinc-400">No concerning trend detected.</p>
                  )}
                  <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
                    Basic linear regression over the last ~10 readings (cadence ~{cadenceMin.toFixed(0)} min),
                    extrapolated forward — not an AI claim.
                  </p>
                </div>

                {/* ----- 5. quick stats over the displayed window ----- */}
                <div className="border-b border-white/5 px-4 py-3">
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 mb-1.5">
                    Window · {primary?.label}
                  </h3>
                  {stats && (
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Min" value={fmtNumber(stats.min, primary?.decimals ?? 0)} unit={primary?.unit} />
                      <MiniStat label="Max" value={fmtNumber(stats.max, primary?.decimals ?? 0)} unit={primary?.unit} />
                      <MiniStat label="Avg" value={fmtNumber(stats.avg, primary?.decimals ?? 0)} unit={primary?.unit} />
                    </div>
                  )}
                  <p className="mt-1.5 text-[10px] text-zinc-600">Over the {stats?.n ?? 0} readings in this panel.</p>
                </div>

                {/* ----- 6. recent alerts for this node ----- */}
                <div className="px-4 py-3 pb-6">
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 mb-1.5">
                    Recent alerts · {node.id}
                  </h3>
                  {nodeAlerts.length === 0 ? (
                    <p className="text-[11px] text-zinc-600">No alerts yet for this node.</p>
                  ) : (
                    <ul className="divide-y divide-white/5 border border-white/5">
                      {nodeAlerts.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                          <span
                            className="font-mono text-[10px] uppercase tracking-wider"
                            style={{ color: STATE_META[a.riskLevel as RiskLevel]?.hex ?? "#fff" }}
                          >
                            {a.riskLevel}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-400">
                            conf {a.confidence != null ? Math.round(a.confidence * 100) : "—"}%
                          </span>
                          <span className="ml-auto font-mono text-[10px] text-zinc-500">{clock(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </aside>
    </div>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-white/3 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-0.5 numeric font-mono text-sm">
        {value}
        {unit && <span className="ml-1 text-[9px] text-zinc-500">{unit}</span>}
      </div>
    </div>
  );
}