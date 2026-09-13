export type HazardType = "flood" | "fire" | "pollution";

export type RiskLevel = "normal" | "warning" | "high" | "critical";

export interface EventInfo {
  active: boolean;
  phase: "ramping" | "peak" | "receding" | "none";
  /** 0 → 1 while a hazard event builds, then back down. */
  progress: number;
  /** how many readings remain in the current event */
  remainingReads: number;
}

/** A single sensor reading pushed by the simulator into `readings`. */
export interface SensorReading {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: HazardType;
  region: string;
  lat: number;
  lng: number;
  source: string;
  createdAt: number;
  event?: EventInfo;

  // flood
  waterLevelCm?: number;
  soilMoisturePct?: number;
  tiltDeg?: number;
  pressureHpa?: number;

  // fire
  tempC?: number;
  humidityPct?: number;
  flameDetected?: boolean;
  gasPpm?: number;
  dustDensity?: number;

  // pollution
  pm25?: number;
  pm10?: number;
  aqi?: number;
  coPpm?: number;
  no2Ppb?: number;
}

/** An assessment written by the Cloud Function into `alerts`. */
export interface AlertDoc {
  id: string;
  readingId: string;
  nodeId: string;
  nodeName: string;
  nodeType: HazardType;
  hazardType?: HazardType;
  zoneId?: string;
  nodeStatus?: "online" | "offline" | "tampered" | null;
  region: string;
  lat: number;
  lng: number;
  riskLevel: RiskLevel;
  previousRiskLevel: RiskLevel | null;
  confidence: number;
  score: number;
  corroboration?: number | null;
  message: string;
  eventPhase: EventInfo["phase"] | null;
  notified: boolean;
  acknowledged?: boolean;
  createdAt: number;
  metrics: Record<string, number | boolean>;
}

export interface NodeSummary {
  nodeId: string;
  nodeName: string;
  nodeType: HazardType;
  region: string;
  lat: number;
  lng: number;
}

export type HazardFilter = HazardType | "all";

/* ------------------------------------------------------------------ */
/*  Live dashboard types (mirror the Firestore collections verbatim)   */
/* ------------------------------------------------------------------ */

/** Document in the `nodes` collection (seeded by simulator/seed-nodes.ts). */
export interface NodeDoc {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hazardType: HazardType;
  status: "online" | "offline" | "tampered";
  /** Named geofence reported into by the Cloud Function's alerts. */
  zoneId?: string;
  region: string;
}

/** Marker state: normal→critical from the latest alert, or grey when offline/no data. */
export type RiskState = RiskLevel | "offline";

export type MetricValues = Record<string, number | boolean>;

/**
 * What the map renders: node registry metadata merged with the node's most
 * recent `alerts` document (riskLevel, score 0-100, confidence, metrics).
 */
export interface LiveNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hazardType: HazardType;
  region: string;
  zoneId?: string;
  status: NodeDoc["status"] | "unknown";
  riskLevel: RiskState;
  /** Risk score on the 0-100 scale written by the Cloud Function. */
  score: number | null;
  /** Confidence as a 0..1 fraction. */
  confidence: number | null;
  /** Millis of the newest alert for this node. */
  latestAt: number | null;
  /** Raw sensor values captured on the newest alert. */
  metrics: MetricValues;
}

/** Point for the risk-score trend chart. */
export interface TrendPoint {
  t: number;
  score: number;
}