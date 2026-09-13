/**
 * _emulator_test.ts — end-to-end test of the scoreReading trigger against the
 * local Firebase emulators (run via `firebase emulators:exec --only firestore,functions`).
 *
 * 1. seeds the `nodes` collection (reuses seed-nodes.ts → the exact demo list),
 * 2. injects an escalating flood sequence for FL-01 (targets CRITICAL) and a
 *    milder reading for FL-02 (targets WARNING),
 * 3. waits for the Cloud Function to write `alerts`, then asserts the schema
 *    fields the dashboard depends on: hazardType, zoneId, acknowledged, score on
 *    the 0-100 scale, confidence, corroboration, riskLevel.
 */

import { initializeApp, type AppOptions } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { computeRisk } from "./src/risk.js";
import { seedNodes, type NodeSeed } from "./seed-nodes.js";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
if (!emulatorHost) {
  console.error("✖ must run under `firebase emulators:exec` (no FIRESTORE_EMULATOR_HOST).");
  process.exit(1);
}

const options: AppOptions = { projectId };
const db = getFirestore(initializeApp(options));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pushReading(
  nodeId: string,
  nodeName: string,
  nodeType: NodeSeed["hazardType"],
  values: Record<string, number | boolean>
): Promise<void> {
  await db.collection("readings").add({
    nodeId,
    nodeName,
    nodeType,
    region: "Pune · Western Ghats",
    lat: 18.4966,
    lng: 73.875,
    source: "emulator-test",
    createdAt: FieldValue.serverTimestamp(),
    event: { active: false, phase: "none", progress: 0, remainingReads: 0 },
    ...values,
  });
}

async function waitForAlert(
  nodeId: string,
  timeoutMs: number
): Promise<Record<string, unknown> | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await db
      .collection("alerts")
      .where("nodeId", "==", nodeId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].data();
    await sleep(500);
  }
  return null;
}

const failures: string[] = [];
const check = (ok: boolean, label: string, detail?: unknown): void => {
  console.log(`${ok ? "  ✓" : "  ✖"} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures.push(label);
};

async function main(): Promise<void> {
  console.log(`\n[1/4] seeding nodes (emulator ${emulatorHost})…`);
  await seedNodes(db);
  const nodeCount = (await db.collection("nodes").get()).size;

  console.log(`\n[2/4] pushing readings…`);
  // FL-01: crank the pivot so the weighted-average model crosses CRITICAL.
  const flood = { waterLevelCm: 950, soilMoisturePct: 96, tiltDeg: 9, pressureHpa: 998 };
  const floodRisk = computeRisk("flood", flood as Record<string, number>);
  console.log(
    `      FL-01 expected riskLevel=${floodRisk.riskLevel} score=${(floodRisk.score * 100).toFixed(1)}/100`
  );
  for (let i = 0; i < 4; i++) {
    await pushReading("FL-01", "Mula-Mutha Riverbank", "flood", flood);
    await sleep(300);
  }
  await pushReading("FL-02", "Pavana Dam Tailrace", "flood", {
    waterLevelCm: 640,
    soilMoisturePct: 78,
    tiltDeg: 3,
    pressureHpa: 1008,
  });

  console.log(`\n[3/4] waiting for the Cloud Function's alerts…`);
  const alertFL01 = await waitForAlert("FL-01", 20000);
  const alertFL02 = await waitForAlert("FL-02", 15000);

  console.log(`\n[4/4] assertions`);
  check(nodeCount === 8, `nodes collection populated (${nodeCount}/8)`);
  check(Boolean(alertFL01), "FL-01 alert written by trigger");
  check(Boolean(alertFL02), "FL-02 alert written by trigger");

  if (alertFL01) {
    const a = alertFL01;
    check(a.riskLevel === "critical", `FL-01 riskLevel == critical`, a.riskLevel);
    check(a.hazardType === "flood", "FL-01 hazardType == flood", a.hazardType);
    check(a.zoneId === "zone-flood-mula-mutha", "FL-01 zoneId from registry", a.zoneId);
    check(a.acknowledged === false, "FL-01 acknowledged == false");
    check(
      typeof a.score === "number" && a.score >= 75 && a.score <= 100,
      "FL-01 score on 0-100 scale (75-100)",
      a.score
    );
    check(
      typeof a.confidence === "number" && a.confidence > 0 && a.confidence <= 1,
      "FL-01 confidence in (0,1]",
      a.confidence
    );
    check(
      a.corroboration === null || a.corroboration > 0,
      "FL-01 corroboration present (>0 or null before enough samples)",
      a.corroboration
    );
  }

  if (alertFL02) {
    const a = alertFL02;
    check(["normal", "warning"].includes(a.riskLevel as string), "FL-02 riskLevel low (warning/normal)", a.riskLevel);
    check((a.score as number) < 75, "FL-02 score < 75 (0-100 scale)", a.score);
  }

  console.log("");
  if (failures.length === 0) {
    console.log("✓✓✓ EMULATOR TEST PASSED — scoreReading trigger verified end-to-end.\n");
  } else {
    console.log(`✖ EMULATOR TEST FAILED (${failures.length}):\n  - ${failures.join("\n  - ")}\n`);
    process.exitCode = 1;
  }
  await db.terminate();
}

main().catch((err) => {
  console.error("✖ emulator test crashed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});