import type { HazardType, RiskLevel, RiskState, SensorReading } from "@/lib/types";

/**
 * Client-side mirror of the Cloud Function risk model (functions/src/risk.ts).
 *
 * KEEP THIS IN SYNC with functions/src/risk.ts — it lets the dashboard colour
 * the map the moment a reading lands, before the Cloud Function round-trips an
 * alert back. The Cloud Function output (stored in `alerts`) remains the source
 * of truth for notifications.
 */

export const RISK_ORDER: RiskLevel[] = ["normal", "warning", "high", "critical"];

export interface RiskColors {
  hex: string;
  rgba: string;
  text: string;
  bg: string;
  ring: string;
  label: string;
}

export const RISK_COLORS: Record<RiskLevel, RiskColors> = {
  normal: {
    hex: "#ffffff",
    rgba: "rgba(255, 255, 255, 0.15)",
    text: "text-white",
    bg: "bg-white/10",
    ring: "ring-white/20",
    label: "NORMAL",
  },
  warning: {
    hex: "#ffffff",
    rgba: "rgba(255, 255, 255, 0.15)",
    text: "text-white",
    bg: "bg-white/10",
    ring: "ring-white/20",
    label: "WARNING",
  },
  high: {
    hex: "#ffffff",
    rgba: "rgba(255, 255, 255, 0.15)",
    text: "text-white",
    bg: "bg-white/10",
    ring: "ring-white/20",
    label: "HIGH",
  },
  critical: {
    hex: "#ff3333",
    rgba: "rgba(255, 51, 51, 0.2)",
    text: "text-critical",
    bg: "bg-critical/10",
    ring: "ring-critical/30",
    label: "CRITICAL",
  },
};

/** Marker state metadata — superset of RISK_COLORS with the grey "offline/no data" state. */
export const STATE_META: Record<RiskState, RiskColors> = {
  ...RISK_COLORS,
  offline: {
    hex: "#404040",
    rgba: "rgba(64, 64, 64, 0.2)",
    text: "text-zinc-500",
    bg: "bg-zinc-500/10",
    ring: "ring-zinc-500/20",
    label: "OFFLINE",
  },
};

/** Marker core radius per state. */
export const CORE: Record<RiskState, number> = {
  normal: 7,
  warning: 8,
  high: 9,
  critical: 9,
  offline: 5,
};

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  color: string;
  dangerThreshold: number;
}

export const HAZARD_META: Record<
  HazardType,
  { label: string; short: string; emoji: string; color: string; metrics: MetricDef[] }
> = {
  flood: {
    label: "Flood",
    short: "FLD",
    emoji: "🌊",
    color: "#38bdf8",
    metrics: [
      {
        key: "waterLevelCm",
        label: "Water level",
        unit: "cm",
        decimals: 0,
        color: "#38bdf8",
        dangerThreshold: 650,
      },
      {
        key: "soilMoisturePct",
        label: "Soil moisture",
        unit: "%",
        decimals: 0,
        color: "#2dd4bf",
        dangerThreshold: 85,
      },
      {
        key: "tiltDeg",
        label: "Tilt",
        unit: "°",
        decimals: 1,
        color: "#a5b4fc",
        dangerThreshold: 8,
      },
      {
        key: "pressureHpa",
        label: "Pressure",
        unit: "hPa",
        decimals: 0,
        color: "#c4b5fd",
        dangerThreshold: 998,
      },
    ],
  },
  fire: {
    label: "Forest Fire",
    short: "FIR",
    emoji: "🔥",
    color: "#fb923c",
    metrics: [
      {
        key: "tempC",
        label: "Temperature",
        unit: "°C",
        decimals: 1,
        color: "#fb923c",
        dangerThreshold: 55,
      },
      {
        key: "flameDetected",
        label: "Flame",
        unit: "",
        decimals: 0,
        color: "#f43f5e",
        dangerThreshold: 1,
      },
      {
        key: "humidityPct",
        label: "Humidity",
        unit: "%",
        decimals: 0,
        color: "#38bdf8",
        dangerThreshold: 30,
      },
      {
        key: "gasPpm",
        label: "Combustible gas",
        unit: "ppm",
        decimals: 0,
        color: "#fb7185",
        dangerThreshold: 45,
      },
      {
        key: "dustDensity",
        label: "Smoke / dust",
        unit: "µg/m³",
        decimals: 0,
        color: "#a3a3a3",
        dangerThreshold: 350,
      },
    ],
  },
  pollution: {
    label: "Air Pollution",
    short: "POL",
    emoji: "💨",
    color: "#a78bfa",
    metrics: [
      {
        key: "pm25",
        label: "PM2.5",
        unit: "µg/m³",
        decimals: 0,
        color: "#a78bfa",
        dangerThreshold: 120,
      },
      {
        key: "pm10",
        label: "PM10",
        unit: "µg/m³",
        decimals: 0,
        color: "#818cf8",
        dangerThreshold: 200,
      },
      {
        key: "aqi",
        label: "AQI",
        unit: "",
        decimals: 0,
        color: "#f472b6",
        dangerThreshold: 200,
      },
      {
        key: "coPpm",
        label: "CO",
        unit: "ppm",
        decimals: 2,
        color: "#fbbf24",
        dangerThreshold: 3,
      },
      {
        key: "no2Ppb",
        label: "NO₂",
        unit: "ppb",
        decimals: 0,
        color: "#34d399",
        dangerThreshold: 80,
      },
    ],
  },
};

export const PRIMARY_METRIC: Record<HazardType, MetricDef> = {
  flood: HAZARD_META.flood.metrics[0],
  fire: HAZARD_META.fire.metrics[0],
  pollution: HAZARD_META.pollution.metrics[0],
};

/* ------------------------------ risk model ------------------------------ */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const riskBand = (score: number): RiskLevel => {
  if (score < 0.35) return "normal";
  if (score < 0.55) return "warning";
  if (score < 0.75) return "high";
  return "critical";
};

const boundary = (level: RiskLevel) => {
  switch (level) {
    case "normal":
      return 0.175;
    case "warning":
      return 0.45;
    case "high":
      return 0.65;
    case "critical":
      return 0.875;
  }
};

/** Simulated confidence: 1 - how close the score sits to a band edge. */
const confidenceFor = (score: number, level: RiskLevel): number =>
  Math.min(0.99, Math.max(0.5, 1 - Math.abs(score - boundary(level)) * 1.4));

export interface RiskAssessment {
  score: number;
  riskLevel: RiskLevel;
  confidence: number;
}

export function computeRiskForReading(reading: SensorReading): RiskAssessment {
  let score = 0;

  if (reading.nodeType === "flood") {
    const w = clamp01(((reading.waterLevelCm ?? 450) - 450) / 350);
    const s = clamp01(((reading.soilMoisturePct ?? 70) - 70) / 20);
    const t = clamp01(((reading.tiltDeg ?? 3) - 3) / 8);
    const p = clamp01((1013 - (reading.pressureHpa ?? 1013)) / 15);
    score = 0.45 * w + 0.3 * s + 0.15 * t + 0.1 * p;
  } else if (reading.nodeType === "fire") {
    const t = clamp01(((reading.tempC ?? 40) - 40) / 30);
    const d = clamp01((55 - (reading.humidityPct ?? 55)) / 25);
    const f = reading.flameDetected ? 1 : 0;
    const g = clamp01(((reading.gasPpm ?? 25) - 25) / 40);
    const du = clamp01(((reading.dustDensity ?? 150) - 150) / 350);
    score = 0.3 * t + 0.15 * d + 0.35 * f + 0.12 * g + 0.08 * du;
  } else {
    const p25 = clamp01(((reading.pm25 ?? 50) - 50) / 180);
    const p10 = clamp01(((reading.pm10 ?? 90) - 90) / 250);
    const no2 = clamp01(((reading.no2Ppb ?? 40) - 40) / 60);
    const co = clamp01(((reading.coPpm ?? 1.5) - 1.5) / 2.5);
    score = 0.5 * p25 + 0.25 * p10 + 0.15 * no2 + 0.1 * co;
  }

  const riskLevel = riskBand(score);
  return { score, riskLevel, confidence: confidenceFor(score, riskLevel) };
}