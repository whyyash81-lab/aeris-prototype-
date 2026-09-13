import type { LiveNode } from "@/lib/types";

function Metric({ label, value, context, critical = false }: {
  label: string;
  value: React.ReactNode;
  context?: string;
  critical?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 border-l border-white/5 first:border-l-0 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">{label}</span>
      </div>
      <div className="mt-1 numeric text-2xl font-medium tracking-tight" style={{ color: critical ? "var(--color-critical)" : "var(--color-white)" }}>
        {value}
      </div>
      {context && <div className="mt-1 text-[10px] text-zinc-500 truncate">{context}</div>}
    </div>
  );
}

export function SummaryCards({ nodes }: { nodes: LiveNode[] }) {
  const total = nodes.length;
  const online = nodes.filter((n) => n.riskLevel !== "offline").length;
  const warnings = nodes.filter((n) => n.riskLevel === "warning").length;
  const critical = nodes.filter((n) => n.riskLevel === "critical").length;
  const coverage = total ? Math.round((online / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-white/5">
      <Metric label="Total nodes" value={total} context="deployed" />
      <Metric label="Online" value={online} context={coverage === 100 ? "full coverage" : `${coverage}% reporting`} />
      <Metric label="Warnings" value={warnings} context={warnings ? "monitor" : "none"} />
      <Metric label="Critical" value={critical} critical context={critical ? "immediate action" : "none"} />
    </div>
  );
}