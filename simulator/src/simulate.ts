import { EVENT_CONFIG, type SensorNode } from "./nodes.js";
import type { EventPhase, EventState, ReadingValues } from "./types.js";

/** Deterministic-ish gaussian sample (Box–Muller). */
function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Per-node hazard state machine.
 *
 * phase: none → ramping (≈10 reads climbing to peak) → peak → receding (≈8 reads back to
 * normal) → none. `fuel` (0..1) is the event intensity used when generating readings, so a
 * judge watches the danger curve build reading-by-reading, cross the alert thresholds, and
 * then subside — exactly the demo dynamic.
 */
export class NodeSimulation {
  private statePhase: EventPhase = "none";
  private fuel = 0;
  private stepInPhase = 0;
  private cooldown = 0;
  private count = 0;

  constructor(
    private readonly node: SensorNode,
    private readonly config = EVENT_CONFIG[node.type]
  ) {}

  private advance(): void {
    this.count++;
    this.cooldown++;

    if (this.statePhase === "none") {
      if (this.cooldown > 36 && Math.random() < this.config.chance) {
        this.statePhase = "ramping";
        this.stepInPhase = 0;
        this.fuel = 0;
        this.cooldown = 0;
      }
      return;
    }

    this.stepInPhase++;

    switch (this.statePhase) {
      case "ramping":
        this.fuel = clamp(this.stepInPhase / this.config.ramp, 0, 1);
        if (this.stepInPhase >= this.config.ramp) {
          this.statePhase = "peak";
          this.stepInPhase = 0;
        }
        break;
      case "peak":
        this.fuel = 1;
        if (this.stepInPhase >= this.config.hold) {
          this.statePhase = "receding";
          this.stepInPhase = 0;
        }
        break;
      case "receding":
        this.fuel = clamp(1 - this.stepInPhase / this.config.recede, 0, 1);
        if (this.fuel <= 0) {
          this.statePhase = "none";
          this.fuel = 0;
          this.stepInPhase = 0;
        }
        break;
      default:
        this.statePhase = "none";
    }
  }

  private remainingReads(): number {
    switch (this.statePhase) {
      case "ramping":
        return Math.max(0, this.config.ramp - this.stepInPhase);
      case "peak":
        return Math.max(0, this.config.hold - this.stepInPhase);
      case "receding":
        return Math.max(0, this.config.recede - this.stepInPhase);
      default:
        return 0;
    }
  }

  /**
   * Generate the next reading for this node.
   * value = baseline + slow drift + sensor noise + event contribution + occasional spike
   */
  next(): { values: ReadingValues; event: EventState } {
    this.advance();

    const { node } = this;
    const pivotSpike = Math.random() < node.spikeChance ? gauss() * 2 : 0;
    const t = this.count;

    const values: ReadingValues = {};
    for (const key of Object.keys(node.baseline)) {
      const base = node.baseline[key] ?? 0;
      const noise = node.noise[key] ?? 0;
      const drift = noise * 0.6 * Math.sin((t / 11) * Math.PI * 2 + key.length);
      const eventDelta = this.config.delta[key] ?? 0;
      const spike = key === this.config.pivot ? pivotSpike * noise : 0;
      const [lo, hi] = node.clamp[key] ?? [0, Infinity];

      let value = clamp(
        base + drift + gauss() * noise + eventDelta * this.fuel + spike,
        lo,
        hi
      );

      // Numbers can't take Infinity as a clamp upper bound — patch Infinity.
      if (value !== value) value = base; // NaN guard
      values[key] = Number(value.toFixed(key === "pressureHpa" || key === "coPpm" ? 2 : 1));
    }

    // Fire nodes get a boolean flame sensor driven by event intensity.
    if (node.type === "fire") {
      const p = clamp(this.fuel * this.fuel * 0.92 + gauss() * 0.04, 0, 0.95);
      values.flameDetected = Math.random() < p;
    }

    const event: EventState = {
      active: this.statePhase !== "none",
      phase: this.statePhase,
      progress: Number(this.fuel.toFixed(3)),
      remainingReads: this.remainingReads(),
    };

    return { values, event };
  }
}

export function buildSimulations(nodes: SensorNode[]): Map<string, NodeSimulation> {
  const map = new Map<string, NodeSimulation>();
  for (const node of nodes) map.set(node.id, new NodeSimulation(node));
  return map;
}