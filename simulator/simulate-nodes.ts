/**
 * simulate-nodes.ts — deterministic, narration-friendly reading pusher.
 *
 * For each of the 8 demo nodes (the EXACT list in ./src/nodes.ts → NODES, the
 * same set seed-nodes.ts writes to the `nodes` registry) this pushes one
 * reading document into the `readings` collection every 3 seconds. Sensor set
 * per node is taken from that same definition (node.baseline keys), so a
 * flood node reports waterLevelCm/soilMoisturePct/tiltDeg/pressureHpa, a fire
 * node reports tempC/humidityPct/gasPpm/dustDensity/flameDetected, and a
 * pollution node reports pm25/pm10/aqi/coPpm/no2Ppb — byte-for-byte the
 * Prompt 1 schema.
 *
 * Values stay in a safe/normal band by default. Pass --scenario to pick ONE
 * node of the matching hazard type and ramp it from safe to dangerous over 12
 * readings (~36s at 3s cadence) with a smoothstep curve, so the Cloud
 * Function's risk score climbs band by band: normal → warning → high →
 * critical. The other 7 nodes keep streaming normal values the whole time.
 *
 * Usage:
 *
 *     npx tsx simulate-nodes.ts
 *     npx tsx simulate-nodes.ts --scenario flood-rising
 *     npx tsx simulate-nodes.ts --scenario fire-rising
 *     npx tsx simulate-nodes.ts --scenario pollution-rising
 *
 * Points at the local Firestore emulator by default (FIRESTORE_EMULATOR_HOST
 * overrides, e.g. 127.0.0.1:8080).
 */

import "./src/env.js";
import { applicationDefault, initializeApp, type AppOptions } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { EVENT_CONFIG, NODES, REGION, type SensorNode } from "./src/nodes.js";
import { computeRisk, type RiskLevel } from "./src/risk.js";
import type { EventPhase, HazardType, ReadingValues } from "./src/types.js";

/* ------------------------------- constants ------------------------------ */

const INTERVAL_MS = 3000;
const RAMP_READINGS = 12;

const SCENARIOS = ["flood-rising", "fire-rising", "pollution-rising"] as const;
type Scenario = (typeof SCENARIOS)[number];

const RISING_TYPE: Record<Scenario, HazardType> = {
  "flood-rising": "flood",
  "fire-rising": "fire",
  "pollution-rising": "pollution",
};

const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";

if (!projectId) {
  console.error("✖ FIREBASE_PROJECT_ID is not set (see simulator/.env).");
  process.exit(1);
}

/* -------------------------------- options -------------------------------- */

function parseScenario(argv: string[]): Scenario | undefined {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] !== "--scenario") continue;
    const next = argv[i + 1];
    if (next && (SCENARIOS as readonly string[]).includes(next)) {
      return next as Scenario;
    }
    console.error(
      `✖ unknown scenario "${next ?? ""}". Use one of: ${SCENARIOS.join(" | ")}`
    );
    process.exit(1);
  }
  return undefined;
}

const scenario = parseScenario(process.argv);
const targetNode = scenario
  ? NODES.find((n) => n.type === RISING_TYPE[scenario]) ?? null
  : null;

/* -------------------------------- runtime -------------------------------- */

const options: AppOptions = { projectId };
if (!emulatorHost) options.credential = applicationDefault();
const app = initializeApp(options);
const db = getFirestore(app);

const readings = db.collection("readings");

const t0 = Date.now();
let pushes = 0;

/* ------------------------------ terminal i/o ----------------------------- */

const tty = Boolean(process.stdout.isTTY);
const style = (code: string, text: string) => (tty ? `${code}${text}\x1b[0m` : text);
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  orange: "\x1b[38;5;208m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const TYPE_NAMES: Record<HazardType, string> = { flood: "FLOOD", fire: "FIRE", pollution: "POLLUTION" };
const RISK_COLOR: Record<RiskLevel, string> = {
  normal: c.green,
  warning: c.yellow,
  high: c.orange,
  critical: c.red,
};

/* ------------------------------ value helpers ---------------------------- */

function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** ease-in-out (smoothstep) 0→1, so the ramp looks organic, not linear. */
const smoothstep = (x: number) => x * x * (3 - 2 * x);

const fmt = (key: string, v: number) =>
  Number(v.toFixed(key === "pressureHpa" || key === "coPpm" ? 2 : 1));

/** key = baseline (safe) | scenario → baseline + ramp up to delta. */
function nextValues(
  node: SensorNode,
  ramp: number | null
): { values: ReadingValues; phase: EventPhase; progress: number } {
  const scenarioConfig = targetNode && targetNode.id === node.id ? EVENT_CONFIG[node.type] : null;
  const p = ramp == null ? 0 : smoothstep(clamp(ramp / RAMP_READINGS, 0, 1));

  const values: ReadingValues = {};
  for (const key of Object.keys(node.baseline)) {
    const base = node.baseline[key] ?? 0;
    const noise = node.noise[key] ?? 0;
    const [lo, hi] = node.clamp[key] ?? [0, Infinity];
    const delta = scenarioConfig?.delta[key] ?? 0;
    const edge = ramp == null ? 0.55 : 0.45; // jitter as a fraction of noise
    values[key] = fmt(key, clamp(base + delta * p + gauss() * noise * edge, lo, hi));
  }

  if (node.type === "fire") {
    const prob = ramp == null ? 0 : 0.03 + 0.92 * p * p;
    values.flameDetected = Math.random() < prob;
  }

  const phase: EventPhase = scenarioConfig ? (p >= 1 ? "peak" : p > 0 ? "ramping" : "none") : "none";
  return { values, phase, progress: Number(p.toFixed(2)) };
}

function formatValues(values: ReadingValues): string {
  return Object.entries(values)
    .map(
      ([k, v]) =>
        `${k}=${typeof v === "boolean" ? (v ? "flame!" : "no-flame") : Number(v).toLocaleString("en-IN")}`
    )
    .join("  ");
}

function elapsed(): string {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* ------------------------------ banner/loop ------------------------------ */

banner();

interface RunState {
  node: SensorNode;
  ramps: boolean;
}

const SETTLE_TICKS = 2;

const runStates: RunState[] = NODES.map((node) => ({
  node,
  ramps: node.id === targetNode?.id,
}));

let tickCount = 0;

/** One 3s wave: exactly one reading per node, pushed in parallel (the CF
 *  trigger waits per write), then logged in NODES order for narration. */
async function tick(): Promise<void> {
  tickCount++;
  const at = elapsed();
  const lines = await Promise.all(
    runStates.map((rs) => {
      const ramp = rs.ramps
        ? Math.max(0, Math.min(tickCount - SETTLE_TICKS, RAMP_READINGS))
        : null;
      return pushReading(rs.node, ramp);
    })
  );
  for (const line of lines) console.log(`${style(c.dim, `[t=${at}]`)} ${line}`);
}

async function loop(): Promise<void> {
  try {
    await tick();
  } catch (err: { message?: string } | null) {
    console.error(style(c.red, `✖ tick failed: ${err?.message ?? err}`));
  }
}
void loop();
// Fire every 3s regardless of how long synchronous CF triggers take in the
// emulator, so reading cadence stays ~3s and the ramp lands in ~35s of wall
// time. Waves may overlap under heavy trigger load; each doc is still written
// exactly once per node per tick.
setInterval(() => void loop(), INTERVAL_MS);

async function pushReading(node: SensorNode, ramp: number | null): Promise<string> {
  const { values, phase, progress } = nextValues(node, ramp);
  const risk = computeRisk(node.type, values);

  await readings.add({
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    region: node.region,
    lat: node.lat,
    lng: node.lng,
    source: "aeris-demo",
    createdAt: FieldValue.serverTimestamp(),
    event: {
      active: phase !== "none",
      phase,
      progress: progress,
      remainingReads: phase === "ramping" ? RAMP_READINGS - Math.round(progress * RAMP_READINGS) : 0,
    },
    ...values,
  });

  pushes++;

  const rampMark =
    ramp == null
      ? ""
      : ramp <= 0
        ? style(c.dim, "  (settling) ")
        : style(c.yellow, `RAMP ${String(Math.round(progress * 100)).padStart(3, " ")}% `) +
          (phase === "peak" ? style(c.bold + c.red, "PEAK! ") : "");

  const riskTxt = style(c.bold + RISK_COLOR[risk.riskLevel], risk.riskLevel.toUpperCase().padEnd(8));
  const scoreTxt = style(c.dim, `${Math.round(risk.score * 100).toString().padStart(3)}/100`);

  return (
    `${style(c.cyan, node.id.padEnd(5))} ` +
    `${style(c.dim, TYPE_NAMES[node.type].padEnd(9))} ` +
    `${node.name.padEnd(26)} ` +
    `${rampMark}` +
    `${riskTxt}${scoreTxt}  ` +
    `${style(c.dim, formatValues(values))}`
  );
}

function banner(): void {
  const box = "━".repeat(66);
  console.log(`\n${style(c.cyan, box)}`);
  console.log(`${style(c.cyan, "  AERIS · demo node simulator — 1 reading / node / 3s")}`);
  console.log(`${style(c.dim, `  project   : ${projectId}${style(c.dim, "")}`)}`);
  console.log(`${style(c.dim, `  emulator  : ${emulatorHost || "production (no emulator)"}`)}`);
  console.log(`${style(c.dim, `  nodes     : ${NODES.length} (${REGION}) — reused from seed-nodes.ts via ./src/nodes.ts`)}`);
  console.log(
    scenario
      ? `${style(c.yellow, `  scenario  : ${scenario} → ${targetNode?.id} ${targetNode?.name}`)}` +
          `${style(c.dim, `  (ramps ${RAMP_READINGS} readings ≈ ${Math.round((RAMP_READINGS * INTERVAL_MS) / 1000)}s)`)}`
      : `${style(c.dim, "  scenario  : none (all nodes stay in safe range)")}`
  );
  console.log(`${style(c.cyan, box)}\n`);
  console.log(`${style(c.dim, "Ctrl+C to stop.")}\n`);
}

const shutdown = async (): Promise<void> => {
  console.log(`\n${style(c.dim, `Stopping… ${pushes} readings pushed.`)}`);
  await db.terminate();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());