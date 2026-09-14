import type { HazardType, SensorReading } from "@/lib/types";
import { HAZARD_META } from "@/lib/risk";

/**
 * trends.ts — plain, explainable statistics for the node-insights drawer.
 *
 * Everything here is a tiny, transparent calculation over the node's RAW
 * readings already stored in Firestore (the `readings` collection). None of it
 * is a neural net or a "black box": the two headline numbers are
 *
 *   1. trendSummary … a SIMPLE MOVING-AVERAGE COMPARISON
 *      (average of the most recent ~10 values vs the ~10 before those),
 *   2. shortHorizonProjection … BASIC LINEAR REGRESSION (least-squares fit)
 *      over the most recent values, extended forward in time.
 *
 * Both are computed from real timestamps + real sensor values, so the numbers
 * in the UI are exactly what the stored data says — nothing fabricated.
 */

export interface TrendPointN {
  t: number; // reading createdAt (ms)
  v: number; // numeric sensor value
}

/** Which of a node's raw sensor fields drives risk for this hazard type.
 *  Reuses the existing metric ordering in lib/risk.ts (matched to the Cloud
 *  Function's model): flood → waterLevelCm, fire → tempC, pollution → pm25. */
export function primaryMetric(type: HazardType) {
  return HAZARD_META[type].metrics[0];
}

/**
 * Pull one metric's numeric time-series out of the readings list.
 * - booleans (e.g. flameDetected) map to 0/1 so they plot as a simple line
 * - non-finite / missing values are dropped (never NaN into a chart)
 * - result is oldest → newest so charts and regressions read left-to-right
 */
export function seriesFor(readings: SensorReading[], key: string): TrendPointN[] {
  const out: TrendPointN[] = [];
  for (const r of readings) {
    const raw = (r as unknown as Record<string, unknown>)[key];
    if (typeof raw === "number") {
      if (Number.isFinite(raw)) out.push({ t: r.createdAt, v: raw });
    } else if (typeof raw === "boolean") {
      out.push({ t: r.createdAt, v: raw ? 1 : 0 });
    }
  }
  return out;
}

export type TrendDirection = "rising" | "falling" | "stable";

export interface TrendSummary {
  direction: TrendDirection;
  /** per-reading change, e.g. +4.2 cm/reading */
  ratePerReading: number;
  /** human label like "+4.2 cm per reading" */
  rateLabel: string;
}

/** Tiny tolerance guards "stable" against float noise rather than a real signal. */
const STABLE_EPSILON = 1e-6;

const mean = (vals: number[]): number =>
  vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;

/**
 * MOVING-AVERAGE COMPARISON (simple, explainable):
 *
 *   recent   = average of the LAST  up-to-10 readings (the "recent window")
 *   prior    = average of the 10 readings BEFORE that window
 *   diffusion = recent - prior  → how much the centre of mass has shifted
 *   ratePerReading = diffusion / 10 readings  → the per-reading drift implied
 *                    by that shift (over the 10-reading span), so a steadily
 *                    climbing series shows ~its true slope, not a hockey stick.
 *
 *   direction: diffusion > 0 → "rising", < 0 → "falling", else "stable".
 */
export function trendSummary(
  series: TrendPointN[],
  recentCount = 10,
  priorCount = 10
): TrendSummary {
  if (series.length < recentCount + priorCount) {
    // Not enough history yet for BOTH windows → report based on what exists,
    // but only claim a direction when we have at least a couple of points.
    if (series.length < 2) return { direction: "stable", ratePerReading: 0, rateLabel: "flat per reading" };
  }

  const recents = series.slice(-recentCount).map((p) => p.v);
  const priors = series
    .slice(-(recentCount + priorCount), -recentCount || undefined)
    .map((p) => p.v);

  if (!recents.length || !priors.length) {
    return { direction: "stable", ratePerReading: 0, rateLabel: "flat per reading" };
  }

  const diffusion = mean(recents) - mean(priors);
  const perReading = diffusion / recentCount;
  const direction: TrendDirection =
    Math.abs(perReading) <= STABLE_EPSILON ? "stable" : perReading > 0 ? "rising" : "falling";

  return { direction, ratePerReading: perReading, rateLabel: formatRate(perReading) };
}

function formatRate(perReading: number): string {
  if (Math.abs(perReading) <= STABLE_EPSILON) return "flat per reading";
  const signed = perReading > 0 ? "+" : "−";
  return `${signed}${Math.abs(perReading).toFixed(1)} per reading`;
}

/**
 * Least-squares linear regression over (reading-index, value) for the LAST
 * up-to-count readings. Returns the line as { slope, intercept, n }.
 */
function fitLine(series: TrendPointN[], count: number): { slope: number; intercept: number; n: number } {
  const pts = series.slice(-count).map((p) => p.v);
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0] ?? 0, n };
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += pts[i];
    sxy += i * pts[i];
    sxx += i * i;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = sy / n - slope * (sx / n);
  return { slope, intercept, n };
}

/** Median gap (in MINUTES) between successive readings — real cadence, not a hardcoded 3s. */
export function medianCadenceMinutes(times: number[]): number {
  if (times.length < 2) return 1;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push((times[i] - times[i - 1]) / 60_000);
  }
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || 1;
}

export interface Projection {
  /** Meaning of each kind:
   *  crosses → below the threshold, rising TOWARD it → real ETA countdown
   *  away    → the gap to the threshold is WIDENING → no countdown, say so
   *  flat    → slope is ~zero → no meaningful trend to extrapolate, say so
   *  above   → the value is ALREADY at/above the threshold → say so
   *  none    → not enough data, or the crossing is beyond the 2h horizon */
  kind: "crosses" | "away" | "flat" | "above" | "none";
  /** minutes until the value reaches the danger threshold (kind === "crosses") */
  minutes: number | null;
}

/**
 * Near-zero slope guard. Anything at or below this magnitude is treated as a
 * FLAT line: real readings carry tiny float noise, and extrapolating noise
 * produces nonsense like "~0 min to the threshold". The guard runs BEFORE the
 * division below, so a near-zero slope can never reach the divide at all.
 */
const SLOPE_EPSILON = 1e-6;

/**
 * BASIC LINEAR REGRESSION projection over the last up-to-10 readings:
 *   fit a straight line to (index → value), then decide which way the GAP to
 *   the danger threshold is moving:
 *
 *     below the threshold + rising  → moving TOWARD  → real ETA countdown
 *     below the threshold + falling → moving AWAY    → no ETA, "moving away"
 *     above the threshold           → already there  → "already at/above"
 *     slope ≈ 0                     → flat           → "no significant trend"
 *
 * The ETA is "how many more readings until the fitted line crosses the
 * threshold, scaled by the node's real median reading cadence". This is
 * intentionally simple and cite-able.
 */
export function shortHorizonProjection(
  series: TrendPointN[],
  dangerThreshold: number,
  projectionCount = 10,
  horizonMinutes = 120
): Projection {
  if (series.length < 2) return { kind: "none", minutes: null };

  const lastMean = mean(series.slice(-3).map((p) => p.v));
  const { slope } = fitLine(series, projectionCount);

  // --- FLAT guard: never extrapolate a ~zero slope, and therefore NEVER
  // divide by one. This is the edge case that produced the nonsense "~0 min".
  if (Math.abs(slope) <= SLOPE_EPSILON) return { kind: "flat", minutes: null };

  const falling = slope < -SLOPE_EPSILON;
  const below = lastMean < dangerThreshold;

  // Already past the danger threshold — report the fact, never count down to it.
  if (!below) return { kind: "above", minutes: null };

  // Below the threshold but FALLING → the gap is widening → no ETA to show.
  if (falling) return { kind: "away", minutes: null };

  // Only remaining case: below the threshold and rising TOWARD it.
  // This division is safe — |slope| > SLOPE_EPSILON was checked above.
  const readingsUntil = (dangerThreshold - lastMean) / slope;
  const minutes = readingsUntil * medianCadenceMinutes(series.map((p) => p.t));
  if (!Number.isFinite(minutes) || minutes > horizonMinutes) {
    return { kind: "none", minutes: null };
  }
  // Floor at 1 min: "~0 min" is never a useful answer (it reads as a bug).
  return { kind: "crosses", minutes: Math.max(1, Math.round(minutes)) };
}

export interface WindowStats {
  n: number;
  min: number;
  max: number;
  avg: number;
}

/** min / max / mean of the primary metric over the whole displayed window. */
export function windowStats(series: TrendPointN[]): WindowStats | null {
  if (!series.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const p of series) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
    sum += p.v;
  }
  return { n: series.length, min, max, avg: sum / series.length };
}