import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, firebaseConfigured } from "@/lib/firebase";
import type {
  AlertDoc,
  HazardType,
  LiveNode,
  NodeDoc,
  RiskState,
  TrendPoint,
} from "@/lib/types";

/** Newest alerts kept for the feed + per-node "latest state". */
const ALERTS_WINDOW = 80;
/** A node whose newest alert is older than this is shown grey/offline. */
const STALE_MS = 30_000;
/** Re-derive online/offline state this often so nodes flip to "offline" as time passes. */
const TICK_MS = 1_000;
/** Give the listeners this long to deliver before the skeleton resolves anyway. */
const CONNECT_TIMEOUT_MS = 12_000;

function tsOf(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? value : Date.now();
}

function toAlert(doc: QueryDocumentSnapshot): AlertDoc {
  const d = doc.data();
  const createdAt = tsOf(d.createdAt);
  return {
    id: doc.id,
    readingId: d.readingId as string,
    nodeId: d.nodeId as string,
    nodeName: d.nodeName as string,
    nodeType: (d.hazardType as HazardType) ?? (d.nodeType as HazardType),
    hazardType: (d.hazardType as HazardType) ?? (d.nodeType as HazardType),
    zoneId: d.zoneId,
    nodeStatus: d.nodeStatus ?? null,
    region: d.region as string,
    lat: Number(d.lat) ?? 0,
    lng: Number(d.lng) ?? 0,
    riskLevel: d.riskLevel as AlertDoc["riskLevel"],
    previousRiskLevel: d.previousRiskLevel ?? null,
    confidence: Number(d.confidence) ?? 0,
    score: Number(d.score) ?? 0,
    corroboration: d.corroboration ?? null,
    message: d.message as string,
    eventPhase: d.eventPhase ?? null,
    notified: Boolean(d.notified),
    acknowledged: Boolean(d.acknowledged),
    createdAt,
    metrics: d.metrics ?? {},
  };
}

function toNodeDoc(doc: QueryDocumentSnapshot): NodeDoc {
  const d = doc.data();
  return {
    id: d.id as string,
    name: d.name as string,
    lat: Number(d.lat) ?? 0,
    lng: Number(d.lng) ?? 0,
    hazardType: d.hazardType as HazardType,
    status: (d.status ?? "unknown") as NodeDoc["status"],
    zoneId: d.zoneId,
    region: d.region as string,
  };
}

function toLiveNode(
  meta: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    hazardType: HazardType;
    status: NodeDoc["status"] | "unknown";
    region: string;
    zoneId?: string;
  },
  latest: AlertDoc | undefined,
  now: number
): LiveNode {
  const latestAt = latest ? tsOf(latest.createdAt) : null;
  const fresh = latestAt != null && now - latestAt < STALE_MS;
  const riskLevel: RiskState =
    !latest || latestAt == null || !fresh ? "offline" : latest.riskLevel;
  return {
    ...meta,
    riskLevel,
    score: latest ? latest.score : null,
    confidence: latest ? latest.confidence : null,
    latestAt,
    metrics: latest?.metrics ?? {},
  };
}

export interface LiveState {
  configured: boolean;
  /** true once both `nodes` and `alerts` listeners delivered an initial snapshot */
  connected: boolean;
  /** non-null when a listener errored or could not be reached in time */
  error: string | null;
  /** nodes sorted by id, each merged with its latest alert state */
  nodes: LiveNode[];
  /** newest-first alert feed */
  alerts: AlertDoc[];
  latestByNode: Map<string, LiveNode>;
}

/**
 * Real-time Firestore hook for the AERIS dashboard.
 *
 * Registers onSnapshot listeners (NOT one-off reads) on:
 *   - `nodes`   → registry metadata (id, name, lat, lng, hazardType, status)
 *   - `alerts`  → every assessment the Cloud Function writes; drives the feed
 *                 and, per node, the live risk state (riskLevel, score,
 *                 confidence, raw metrics captured on that alert)
 *
 * Every snapshot reconciles the two collections into the LiveNode list, so the
 * map/stat cards update live with no page refresh. Nodes seen only in alerts
 * (registry not seeded yet) still appear, falling back to alert metadata.
 *
 * The skeleton must never hang: listener errors mark that side "seen" and a
 * timeout forces `connected` after CONNECT_TIMEOUT_MS, so the UI always lands
 * on either live data, the empty state, or an explicit Firestore error panel.
 */
export function useAerisLive(): LiveState {
  const configured = firebaseConfigured;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<LiveNode[]>([]);
  const [alerts, setAlerts] = useState<AlertDoc[]>([]);

  const nodesRef = useRef(new Map<string, NodeDoc>());
  const latestRef = useRef(new Map<string, AlertDoc>());
  const seenRef = useRef({ nodes: false, alerts: false });
  /** true once that side delivered a real snapshot (proves the DB answered). */
  const okRef = useRef({ nodes: false, alerts: false });
  const errorRef = useRef<string | null>(null);
  /** Signature of the last published node state — skip re-renders when nothing changed. */
  const lastSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!db) {
      // Not much to connect to without an app config; mark ready so the UI
      // shows the "configure" state instead of hanging on the skeleton.
      seenRef.current = { nodes: true, alerts: true };
      setConnected(true);
      return;
    }

    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      // Called on every snapshot/error and from the fallback timer; idempotent.
      if (disposed) return;
      setError(errorRef.current);
      setConnected(seenRef.current.nodes && seenRef.current.alerts);
    };

    const markSeen = (side: "nodes" | "alerts") => {
      seenRef.current[side] = true;
      finish();
    };

    // A successful snapshot (even an empty one) proves the emulator/Firestore
    // answered, so once both sides deliver, clear every error - including the
    // "Still connecting" timeout placeholder. Connection confirmed.
    const markOk = (side: "nodes" | "alerts") => {
      okRef.current[side] = true;
      if (okRef.current.nodes && okRef.current.alerts) {
        errorRef.current = null;
      }
    };

    const recompute = () => {
      if (disposed) return;
      const now = Date.now();
      const out = new Map<string, LiveNode>();

      for (const nd of nodesRef.current.values()) {
        out.set(nd.id, toLiveNode(nd, latestRef.current.get(nd.id), now));
      }

      // Fallback for nodes that only exist in alerts (registry not seeded yet).
      for (const [id, a] of latestRef.current) {
        if (out.has(id)) continue;
        out.set(
          id,
          toLiveNode(
            {
              id,
              name: a.nodeName,
              lat: a.lat,
              lng: a.lng,
              hazardType: a.hazardType ?? a.nodeType,
              status: a.nodeStatus ?? "unknown",
              region: a.region,
              zoneId: a.zoneId,
            },
            a,
            now
          )
        );
      }

      const arr = Array.from(out.values()).sort((a, b) => a.id.localeCompare(b.id));
      const sig = arr
        .map((n) => `${n.id}:${n.riskLevel}:${n.latestAt}:${n.score}`)
        .join("|");
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;
      setNodes(arr);
    };

    timeout = setTimeout(() => {
      // Firestore keeps retrying silently for a while; don't leave the user on
      // an infinite skeleton either way.
      if (!okRef.current.nodes || !okRef.current.alerts) {
        errorRef.current ??=
          "Still connecting to Firestore — check your connection or deploy the " +
          "Firestore rules / enable the database for this project.";
      }
      seenRef.current = { nodes: true, alerts: true };
      finish();
    }, CONNECT_TIMEOUT_MS);

    // Live offline flip: re-derive each node's freshness on a tick so a node
    // whose stream goes silent shows grey "offline" as time passes, without
    // needing a new snapshot. (recompute is cheap and signature-gated above.)
    const tick = setInterval(recompute, TICK_MS);

    const onError = (err: unknown) => {
      const fe = err as { code?: string; message?: string };
      const code = fe?.code ?? "unknown";
      const msg = fe?.message ?? String(err);
      const label = code !== "unknown" ? `[${code}] ${msg}` : msg;
      errorRef.current = label;
      console.warn("[AERIS firestore] listener error", { code, message: msg });
    };

    const unsubNodes = onSnapshot(
      collection(db, "nodes"),
      (snap) => {
        nodesRef.current = new Map(snap.docs.map((d) => [d.id, toNodeDoc(d)]));
        markSeen("nodes");
        markOk("nodes");
        recompute();
      },
      (err) => {
        onError(err);
        markSeen("nodes");
      }
    );

    const unsubAlerts = onSnapshot(
      query(
        collection(db, "alerts"),
        orderBy("createdAt", "desc"),
        limit(ALERTS_WINDOW)
      ),
      (snap) => {
        const list: AlertDoc[] = [];
        const latest = new Map<string, AlertDoc>();
        for (const doc of snap.docs) {
          const a = toAlert(doc);
          list.push(a);
          if (!latest.has(a.nodeId)) latest.set(a.nodeId, a);
        }
        latestRef.current = latest;
        setAlerts(list);
        markSeen("alerts");
        markOk("alerts");
        recompute();
      },
      (err) => {
        onError(err);
        markSeen("alerts");
      }
    );

    return () => {
      disposed = true;
      if (timeout) clearTimeout(timeout);
      clearInterval(tick);
      unsubNodes();
      unsubAlerts();
    };
  }, []);

  const latestByNode = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes]
  );

  return { configured, connected, error, nodes, alerts, latestByNode };
}

/* ------------------------------------------------------------------ */
/*  Per-node risk-score trend (last ~20 alerts, oldest → newest).       */
/*  Uses only a single-field `nodeId` equality filter + client-side     */
/*  sorting, so it never needs a composite index to exist/be deployed.  */
/* ------------------------------------------------------------------ */

export function useNodeTrend(nodeId: string | null): {
  points: TrendPoint[];
  loading: boolean;
  error: string | null;
} {
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !nodeId) {
      setPoints([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      query(
        collection(db, "alerts"),
        where("nodeId", "==", nodeId),
        limit(TREND_LOOKBACK)
      ),
      (snap) => {
        const arr = snap.docs
          .map((d) => {
            const a = toAlert(d);
            return { t: a.createdAt, score: a.score } as TrendPoint;
          })
          .filter((p) => p.t > 0 && Number.isFinite(p.score))
          .sort((a, b) => b.t - a.t)
          .slice(0, TREND_LENGTH)
          .reverse();
        setPoints(arr);
        setLoading(false);
      },
      (err) => {
        const fe = err as { code?: string; message?: string };
        const code = fe?.code ?? "unknown";
        const msg = fe?.message ?? String(err);
        setError(code !== "unknown" ? `[${code}] ${msg}` : msg);
        setLoading(false);
      }
    );
    return unsub;
  }, [nodeId]);

  return { points, loading, error };
}

/** Fetch a few more than needed; slice down after sorting. */
const TREND_LOOKBACK = 60;
const TREND_LENGTH = 20;