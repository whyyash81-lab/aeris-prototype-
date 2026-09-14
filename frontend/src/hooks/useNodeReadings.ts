import { useEffect, useState } from "react";
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
import { db } from "@/lib/firebase";
import type { SensorReading } from "@/lib/types";

/** How many raw readings we pull per node (newest-first) for the drawer charts. */
const READINGS_BACKFILL = 60;

function toReading(doc: QueryDocumentSnapshot): SensorReading {
  const d = doc.data();
  const createdAt =
    d.createdAt instanceof Timestamp
      ? d.createdAt.toMillis()
      : d.createdAt instanceof Date
        ? d.createdAt.getTime()
        : typeof d.createdAt === "number"
          ? d.createdAt
          : Date.now();
  return { id: doc.id, createdAt, ...(d as Omit<SensorReading, "id" | "createdAt">) };
}

/**
 * Live listener on the `readings` collection for ONE node (newest 60).
 * Returns oldest → newest. Feeds the node-insights drawer with REAL stored
 * sensor data — no simulated numbers are fabricated on the client.
 *
 * Note: requires the composite index `readings (nodeId ASC, createdAt DESC)`,
 * which is already declared in firestore.indexes.json.
 */
export function useNodeReadings(nodeId: string | null): {
  readings: SensorReading[];
  loading: boolean;
  error: string | null;
} {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !nodeId) {
      setReadings([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      query(
        collection(db, "readings"),
        where("nodeId", "==", nodeId),
        orderBy("createdAt", "desc"),
        limit(READINGS_BACKFILL)
      ),
      (snap) => {
        setReadings(snap.docs.map(toReading).sort((a, b) => a.createdAt - b.createdAt));
        setLoading(false);
      },
      (err) => {
        const fe = err as { code?: string; message?: string };
        setError(fe?.code ? `[${fe.code}] ${fe.message}` : String((err as Error)?.message ?? err));
        setLoading(false);
      }
    );
    return unsub;
  }, [nodeId]);

  return { readings, loading, error };
}