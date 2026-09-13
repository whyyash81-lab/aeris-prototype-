export type HazardType = "flood" | "fire" | "pollution";

export type EventPhase = "none" | "ramping" | "peak" | "receding";

export interface EventState {
  active: boolean;
  phase: EventPhase;
  /** 0 → 1 while danger builds, then back to 0. */
  progress: number;
  /** readings remaining in the current phase */
  remainingReads: number;
}

export interface EventConfig {
  /** readings spent climbing to peak */
  ramp: number;
  /** readings held at peak */
  hold: number;
  /** readings spent decaying back to normal */
  recede: number;
  /** probability this node starts an event on any given tick */
  chance: number;
  /** metric that receives the largest swing (drives the demo story) */
  pivot: string;
  /** per-metric change from baseline at full peak */
  delta: Record<string, number>;
}

export type MetricDelta = Record<string, number>;

export interface SensorNode {
  id: string;
  name: string;
  type: HazardType;
  region: string;
  lat: number;
  lng: number;
  /** baseline value per metric (before noise/events) */
  baseline: MetricDelta;
  /** gaussian jitter (std dev) per metric */
  noise: MetricDelta;
  /** min/max clamp per metric */
  clamp: Record<string, [number, number]>;
  /** probability (0..1) per tick of a transient blip on the pivot metric */
  spikeChance: number;
}

export type ReadingValues = Record<string, number | boolean>;