import "dotenv/config";
import { applicationDefault, initializeApp, type AppOptions } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { NODES, REGION } from "./nodes.js";
import { buildSimulations } from "./simulate.js";
import { computeRisk } from "./risk.js";

/* ------------------------------- config ------------------------------- */

const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const readMinMs = Number(process.env.READING_MIN_MS ?? 3000);
const readMaxMs = Number(process.env.READING_MAX_MS ?? 5000);

if (!projectId) {
  console.error("✖ FIREBASE_PROJECT_ID is not set (see simulator/.env.example).");
  process.exit(1);
}

const options: AppOptions = { projectId };
if (!emulatorHost) {
  options.credential = applicationDefault();
}
const app = initializeApp(options);
const db = getFirestore(app);

if (emulatorHost) {
  console.log(`  [emulator] Firestore → ${emulatorHost}`);
}

/* ------------------------------- runtime ------------------------------ */

const simulations = buildSimulations(NODES);
const readings = db.collection("readings");

let pushed = 0;
let started = Date.now();
let lastRisk: Record<string, string> = {};

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  orange: "\x1b[38;5;208m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const RISK_STYLE: Record<string, string> = {
  normal: colors.green,
  warning: colors.yellow,
  high: colors.orange,
  critical: colors.red,
};

const typeTag: Record<string, string> = {
  flood: colors.cyan,
  fire: colors.orange,
  pollution: colors.magenta,
};

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const stamp = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function formatValues(values: Record<string, number | boolean>): string {
  return Object.entries(values)
    .map(
      ([k, v]) =>
        `${k}=${typeof v === "boolean" ? (v ? "TRUE" : "false") : Number(v).toLocaleString("en-IN")}`
    )
    .join("  ");
}

function banner(): void {
  const box = "━".repeat(60);
  console.log(`\n${colors.cyan}${box}${colors.reset}`);
  console.log(`${colors.cyan}  AERIS · field-node simulator${colors.reset}`);
  console.log(`${colors.dim}  project     : ${projectId}${colors.reset}`);
  if (emulatorHost) console.log(`${colors.dim}  emulator    : ${emulatorHost}${colors.reset}`);
  console.log(`${colors.dim}  nodes       : ${NODES.length} (${REGION})${colors.reset}`);
  console.log(`${colors.dim}  cadence     : ${readMinMs / 1000}s – ${readMaxMs / 1000}s per node${colors.reset}`);
  console.log(`${colors.dim}  rising-risk : random events climb over ~10 readings${colors.reset}`);
  console.log(`${colors.cyan}${box}${colors.reset}\n`);

  for (const n of NODES) {
    console.log(
      `${typeTag[n.type]}[${n.type.toUpperCase().padEnd(9)}]${colors.reset} ${colors.dim}${n.id}${colors.reset} ${n.name.padEnd(26)} ${n.lat.toFixed(3)},${n.lng.toFixed(3)}`
    );
  }
  console.log(`\n${colors.dim}Ctrl+C to stop.${colors.reset}\n`);
}

async function pushReading(nodeId: string): Promise<void> {
  const node = NODES.find((n) => n.id === nodeId);
  const sim = simulations.get(nodeId);
  if (!node || !sim) return;

  const { values, event } = sim.next();
  const risk = computeRisk(node.type, values);

  // Big escalation moments for the terminal story.
  const prev = lastRisk[nodeId];
  if (
    prev &&
    (risk.riskLevel === "high" || risk.riskLevel === "critical") &&
    prev !== risk.riskLevel
  ) {
    console.log(
      `${colors.yellow}»» RISK ESCALATION ${node.id} ${prev.toUpperCase()} → ${risk.riskLevel.toUpperCase()} ${colors.reset}`
    );
  }
  lastRisk[nodeId] = risk.riskLevel;

  await readings.add({
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    region: node.region,
    lat: node.lat,
    lng: node.lng,
    source: "aeris-simulator",
    createdAt: FieldValue.serverTimestamp(),
    event: {
      active: event.active,
      phase: event.phase,
      progress: event.progress,
      remainingReads: event.remainingReads,
    },
    ...values,
  });

  pushed++;

  const tag = `[${stamp()}]`;
  const phaseMark =
    !event.active
      ? ""
      : event.phase === "ramping"
        ? `${colors.yellow}RAMP↑${colors.reset} `
        : event.phase === "peak"
          ? `${colors.red}PEAK!${colors.reset} `
          : `${colors.green}REC↓${colors.reset} `;

  console.log(
    `${colors.dim}${tag}${colors.reset} ` +
      `${typeTag[node.type]}${node.id.padEnd(5)}${colors.reset} ` +
      `${phaseMark}` +
      `${RISK_STYLE[risk.riskLevel]}${risk.riskLevel.toUpperCase().padEnd(9)}${colors.reset} ` +
      `${colors.dim}${formatValues(values)}${colors.reset}`
  );
}

function scheduleNode(nodeId: string): void {
  const delay = readMinMs + Math.random() * (readMaxMs - readMinMs);
  setTimeout(() => {
    pushReading(nodeId)
      .catch((err) =>
        console.error(
          `${colors.red}✖ write failed for ${nodeId}: ${(err as Error).message}${colors.reset}`
        )
      )
      .finally(() => scheduleNode(nodeId));
  }, delay);
}

setInterval(() => {
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `${colors.dim}— heartbeat: ${pushed} readings pushed in ${secs}s (${NODES.length} nodes) —${colors.reset}`
  );
}, 15000);

const shutdown = async (): Promise<void> => {
  console.log(`\n${colors.dim}Stopping simulator… ${pushed} readings pushed.${colors.reset}`);
  await db.terminate();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

banner();
for (const node of NODES) scheduleNode(node.id);