/**
 * AERIS risk model.
 *
 * ============================================================================
 *  SIMULATES THE ON-DEVICE TINYML RISK MODEL
 * ============================================================================
 *  A real deployment would run a quantized neural net / decision-tree on each
 *  solar node's microcontroller and POST only its risk verdict. For this
 *  prototype the same rule-based weight table that TinyML model would encode is
 *  executed here in the cloud trigger, reading the raw metrics a node streams.
 *
 *  Design mirrors (and is duplicated for shared understanding by) the
 *  dashboards's client-side model in frontend/src/lib/risk.ts and the
 *  simulator's logging copy in simulator/src/risk.ts.
 *
 *  The model computes a normalised score on a 0..1 scale so the weights below
 *  sum to 1; the Cloud Function persists that score to the `alerts` document as
 *  a judge-facing 0-100 risk score (score × 100). Confidence can also be
 *  boosted by corroboration in index.ts (a node's last few readings agreeing on
 *  the same verdict — our stand-in for multi-node corroboration).
 * ============================================================================
 *
 *  HOW THE SCORE IS BUILT (per hazard type)
 *  -----------------------------------------
 *  Each metric is normalised to 0..1 against a danger baseline, then combined
 *  with a weighted average. The weights encode domain judgment:
 *
 *    flood     0.45 water level  + 0.30 soil saturation + 0.15 structure tilt
 *              + 0.10 barometric-pressure drop
 *    fire      0.35 flame present + 0.30 temperature + 0.15 low humidity (dry
 *              fuel) + 0.12 combustible gas + 0.08 smoke/dust density
 *    pollution 0.50 PM2.5 + 0.25 PM10 + 0.15 NO2 + 0.10 CO
 *
 *  THE RISK BANDS (thresholds on the 0..1 score)
 *  ----------------------------------------------
 *      < 0.35  → "normal"    (green)  0-34/100
 *      0.35..  → "warning"   (amber)  35-54/100
 *      0.55..  → "high"      (orange) 55-74/100
 *      0.75+   → "critical"  (red)    75-100/100
 */

import type { ReadingData, RiskLevel } from "./types.js";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Weighted-average weights per hazard type (each column sums to 1). */
export const WEIGHTS = {
  flood: { water: 0.45, soil: 0.3, tilt: 0.15, pressure: 0.1 },
  fire: { flame: 0.35, temp: 0.3, dryness: 0.15, gas: 0.12, smoke: 0.08 },
  pollution: { pm25: 0.5, pm10: 0.25, no2: 0.15, co: 0.1 },
} as const;

/** Whenever the normalised score crosses one of these thresholds it moves up a band. */
export const BAND_THRESHOLDS: ReadonlyArray<{ upTo: number; level: RiskLevel }> = [
  { upTo: 0.35, level: "normal" },
  { upTo: 0.55, level: "warning" },
  { upTo: 0.75, level: "high" },
  { upTo: Infinity, level: "critical" },
];

export interface RiskAssessment {
  riskLevel: RiskLevel;
  /** weighted hazard score, 0..1 */
  score: number;
  /** model confidence, 0..1 */
  confidence: number;
}

const riskBand = (score: number): RiskLevel =>
  BAND_THRESHOLDS.find((t) => score < t.upTo)?.level ?? "critical";

const bandCenter = (level: RiskLevel): number => {
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

export function computeRisk(data: ReadingData): RiskAssessment {
  const v = data;
  let score = 0;

  if (v.nodeType === "flood") {
    const W = WEIGHTS.flood;
    // Flood: water level dominates, soil saturation + structural tilt + pressure drop assist.
    const w = clamp01(((v.waterLevelCm ?? 450) - 450) / 350);
    const s = clamp01(((v.soilMoisturePct ?? 70) - 70) / 20);
    const t = clamp01(((v.tiltDeg ?? 3) - 3) / 8);
    const p = clamp01((1013 - (v.pressureHpa ?? 1013)) / 15);
    score = W.water * w + W.soil * s + W.tilt * t + W.pressure * p;
  } else if (v.nodeType === "fire") {
    const W = WEIGHTS.fire;
    // Fire: flame presence dominates, temp + fuel dryness (low humidity) + gas/smoke assist.
    const t = clamp01(((v.tempC ?? 40) - 40) / 30);
    const d = clamp01((55 - (v.humidityPct ?? 55)) / 25);
    const f = v.flameDetected ? 1 : 0;
    const g = clamp01(((v.gasPpm ?? 25) - 25) / 40);
    const du = clamp01(((v.dustDensity ?? 150) - 150) / 350);
    score = W.flame * f + W.temp * t + W.dryness * d + W.gas * g + W.smoke * du;
  } else {
    const W = WEIGHTS.pollution;
    // Pollution: PM2.5 leads, PM10 + NO2 + CO assist (AQI is derived from these anyway).
    const p25 = clamp01(((v.pm25 ?? 50) - 50) / 180);
    const p10 = clamp01(((v.pm10 ?? 90) - 90) / 250);
    const no2 = clamp01(((v.no2Ppb ?? 40) - 40) / 60);
    const co = clamp01(((v.coPpm ?? 1.5) - 1.5) / 2.5);
    score = W.pm25 * p25 + W.pm10 * p10 + W.no2 * no2 + W.co * co;
  }

  const riskLevel = riskBand(score);
  // Baseline confidence from band proximity (max certainty near a band centre);
  // the trigger then nudges it up/down via corroboration (see index.ts).
  const center = bandCenter(riskLevel);
  const confidence = Math.min(0.99, Math.max(0.5, 1 - Math.abs(score - center) * 1.4));

  return { riskLevel, score, confidence };
}

/** Human-readable alert message stored on the alert doc and shown in the feed. */
export function buildMessage(data: ReadingData, assessment: RiskAssessment): string {
  const label =
    data.nodeType === "flood"
      ? "flood"
      : data.nodeType === "fire"
        ? "forest-fire"
        : "air-quality";

  const metric =
    data.nodeType === "flood"
      ? `water level ${Math.round(data.waterLevelCm ?? 0)} cm`
      : data.nodeType === "fire"
        ? `temp ${(data.tempC ?? 0).toFixed(1)} °C, flame ${data.flameDetected ? "detected" : "clear"}`
        : `AQI ${Math.round(data.aqi ?? data.pm25 ?? 0).toLocaleString("en-IN")}, PM2.5 ${Math.round(data.pm25 ?? 0)} µg/m³`;

  switch (assessment.riskLevel) {
    case "critical":
      return `CRITICAL ${label} risk — ${metric}. Immediate intervention required.`;
    case "high":
      return `High ${label} risk — ${metric}. Alerting field teams.`;
    case "warning":
      return `${label} conditions elevated — ${metric}. Monitoring closely.`;
    default:
      return `${label} conditions nominal — ${metric}.`;
  }
}