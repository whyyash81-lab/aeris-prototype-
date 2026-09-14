import { useEffect, useMemo, useState } from "react";
import { useAerisLive, useNodeTrend } from "@/hooks/useAerisLive";
import { usePushNotifications } from "@/hooks/useFcm";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { SummaryCards } from "@/components/SummaryCards";
import { MapView } from "@/components/MapView";
import { AlertsFeed } from "@/components/AlertsFeed";
import { TrendPanel } from "@/components/TrendPanel";
import { EmptyState } from "@/components/EmptyState";
import { NodeDetailDrawer } from "@/components/NodeDetailDrawer";
import { useNodeReadings } from "@/hooks/useNodeReadings";
import { Skeleton } from "@/components/ui/skeleton";

export function Dashboard() {
  const live = useAerisLive();
  const push = usePushNotifications();
  const { signOut } = useAuth();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    setSelectedId((prev) => (prev && live.nodes.some((n) => n.id === prev)) ? prev : live.nodes[0]?.id ?? null);
  }, [live.nodes]);

  /** Selecting from the map marker - no camera move needed. */
  const selectNode = (id: string) => setSelectedId(id);
  /** Open the node-insights drawer from the map popup's "Open trend" button. */
  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetailId(id);
  };
  /** Selecting from the alert feed / trend dropdown - fly the map to it. */
  const focusNode = (id: string) => {
    setSelectedId(id);
    setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };
  const focusKey = focus ? `${focus.id}:${focus.n}` : null;

  const trend = useNodeTrend(selectedId);
  const detailNode = detailId ? live.nodes.find((n) => n.id === detailId) ?? null : null;
  const detailReadings = useNodeReadings(detailId);
  const liveOk = live.connected && (live.nodes.length > 0 || live.alerts.length > 0);
  const conn: "live" | "connecting" | "empty" | "error" = live.error
    ? "error"
    : liveOk
      ? "live"
      : live.connected
        ? "empty"
        : "connecting";
  const lastUpdated = useMemo(() => Math.max(0, ...live.nodes.map((n) => n.latestAt ?? 0), ...live.alerts.map((a) => a.createdAt)), [live.nodes, live.alerts]);
  const loading = !live.connected;
  const empty = live.connected && live.nodes.length === 0 && live.alerts.length === 0;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-black text-white">
      <Header {...push} live={liveOk} conn={conn} lastUpdated={lastUpdated} onSignOut={signOut} />

      {live.error && (
        <div className="px-4 py-1.5 text-[10px] font-mono text-critical border-b border-white/5">CONNECTION: {live.error}</div>
      )}

      {detailId && (
        <NodeDetailDrawer
          node={detailNode}
          readings={detailReadings.readings}
          loading={detailReadings.loading}
          error={detailReadings.error}
          alerts={live.alerts}
          onClose={() => setDetailId(null)}
        />
      )}

      <main className="flex-1 flex flex-col gap-2 p-3 min-h-0">
        {loading ? (
          <DashboardSkeleton />
        ) : !live.configured || empty ? (
          <EmptyState configured={live.configured} error={live.error} />
        ) : (
          <>
            <SummaryCards nodes={live.nodes} />
            <div className="flex-1 flex flex-col lg:flex-row gap-2 min-h-0">
              <div className="flex-1 min-h-[320px] lg:min-h-[400px]"><MapView nodes={live.nodes} selectedId={selectedId} onSelect={selectNode} focusKey={focusKey} onOpenDetail={openDetail} suppressed={Boolean(detailId)} /></div>
              <aside className="h-[400px] shrink-0 lg:h-auto lg:w-[360px]"><AlertsFeed alerts={live.alerts} onSelectNode={focusNode} /></aside>
            </div>
            <div className="h-[160px] shrink-0"><TrendPanel nodes={live.nodes} selectedId={selectedId} onSelect={focusNode} points={trend.points} loading={trend.loading} error={trend.error} /></div>
          </>
        )}
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 border-y border-white/5">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="px-4 py-3 first:border-l-0 border-l border-white/5"><Skeleton className="h-2 w-12" /><Skeleton className="mt-2 h-6 w-8" /><Skeleton className="mt-1 h-2 w-16" /></div>)}
      </div>
      <div className="flex-1 flex flex-col lg:flex-row gap-2 min-h-0">
        <div className="flex-1 min-h-0 rounded-none border border-white/5 bg-black"><Skeleton className="h-full w-full" /></div>
        <div className="h-[400px] shrink-0 lg:h-auto lg:w-[360px] border border-white/5 bg-black"><Skeleton className="h-full w-full" /></div>
      </div>
      <div className="h-[160px] shrink-0 border-t border-white/5 bg-black"><Skeleton className="h-full w-full" /></div>
    </div>
  );
}