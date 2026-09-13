import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/types";
import { shortTime } from "@/lib/format";

export function RiskChart({
  points,
  color,
}: {
  points: TrendPoint[];
  color: string;
}) {
  const data = points.map((p) => ({ t: p.t, v: p.score }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v) => shortTime(v)}
          stroke="#404040"
          tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
          minTickGap={50}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          stroke="#404040"
          tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
          width={36}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => String(v).padStart(3, "0")}
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
                  {Number.isFinite(value) ? Math.round(value) : "—"}/100
                </div>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}