import type { ReadingValues } from "./types.js";

/**
 * SIMULATOR-SIDE risk mirror.
 *
 * A lightweight copy of the Cloud Function's rule-based "on-device TinyML"
 * model (see functions/src/risk.ts) so the simulator can log a live risk
 * estimate next to each reading. The authoritative scoring + alerts + push
 * happen in Cloud Functions; this is purely for terminal storytelling.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export type RiskLevel = "normal" | "warning" | "high" | "critical";

export interface RiskAssessment {
  riskLevel: RiskLevel;
  score: number;
  confidence: number;
}

export function computeRisk(
  type: "flood" | "fire" | "pollution",
  values: ReadingValues
): RiskAssessment {
  let score = 0;

  if (type === "flood") {
    const w = clamp01(((values.waterLevelCm as number) - 450) / 350);
    const s = clamp01(((values.soilMoisturePct as number) - 70) / 20);
    const t = clamp01(((values.tiltDeg as number) - 3) / 8);
    const p = clamp01((1013 - (values.pressureHpa as number)) / 15);
    score = 0.45 * w + 0.3 * s + 0.15 * t + 0.1 * p;
  } else if (type === "fire") {
    const t = clamp01(((values.tempC as number) - 40) / 30);
    const d = clamp01((55 - (values.humidityPct as number)) / 25);
    const f = values.flameDetected ? 1 : 0;
    const g = clamp01(((values.gasPpm as number) - 25) / 40);
    const du = clamp01(((values.dustDensity as number) - 150) / 350);
    score = 0.3 * t + 0.15 * d + 0.35 * f + 0.12 * g + 0.08 * du;
  } else {
    const p25 = clamp01(((values.pm25 as number) - 50) / 180);
    const p10 = clamp01(((values.pm10 as number) - 90) / 250);
    const no2 = clamp01(((values.no2Ppb as number) - 40) / 60);
    const co = clamp01(((values.coPpm as number) - 1.5) / 2.5);
    score = 0.5 * p25 + 0.25 * p10 + 0.15 * no2 + 0.1 * co;
  }

  const riskLevel: RiskLevel =
    score < 0.35 ? "normal" : score < 0.55 ? "warning" : score < 0.75 ? "high" : "critical";
  const center =
    riskLevel === "normal"
      ? 0.175
      : riskLevel === "warning"
        ? 0.45
        : riskLevel === "high"
          ? 0.65
          : 0.875;
  const confidence = Math.min(0.99, Math.max(0.5, 1 - Math.abs(score - center) * 1.4));

  return { riskLevel, score, confidence };
}