export type HazardType = "flood" | "fire" | "pollution";

export type RiskLevel = "normal" | "warning" | "high" | "critical";

export interface EventData {
  active: boolean;
  phase: "ramping" | "peak" | "receding" | "none";
  progress: number;
  remainingReads: number;
}

/** Shape of a document in the `readings` collection (written by the simulator). */
export interface ReadingData {
  nodeId: string;
  nodeName: string;
  nodeType: HazardType;
  region: string;
  lat: number;
  lng: number;
  source?: string;
  createdAt?: FirebaseFirestore.FieldValue | Date | null;
  event?: EventData;

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

export type MetricValues = Record<string, number | boolean>;

/** Shape of a document in the `nodes` collection (static registry, seeded by seed-nodes.ts). */
export interface NodeDoc {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hazardType: HazardType;
  status: "online" | "offline" | "tampered";
  /** Named geofence the node reports into (used for zone-level corroboration). */
  zoneId: string;
  region: string;
  installedAt?: FirebaseFirestore.FieldValue | Date | null;
}