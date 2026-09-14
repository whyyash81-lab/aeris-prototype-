/**
 * seed-nodes.ts — populates the `nodes` collection with the 8 demo field nodes.
 *
 * Reuses the EXACT node list the simulator streams readings for
 * (./src/nodes.ts → NODES) so registry and simulator can never drift apart.
 * The Cloud Function's onDocumentCreated trigger reads hazardType / zone / name
 * FROM this registry, so seed this before starting the simulator.
 *
 * Run once (Admin credentials via GOOGLE_APPLICATION_CREDENTIALS, set in
 * simulator/.env):
 *
 *     npm run seed
 *
 * Accepts the same emulator override: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.
 * The seeding logic is exported (seedNodes) so ./_emulator_test.ts can reuse it.
 */

import "./src/env.js";
import { applicationDefault, initializeApp, type AppOptions } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";
import { NODES, REGION } from "./src/nodes.js";
import type { HazardType } from "./src/types.js";

/** Shape of a document in the `nodes` collection (mirrors functions/src/types.ts NodeDoc). */
export interface NodeSeed {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hazardType: HazardType;
  status: "online" | "offline" | "tampered";
  zoneId: string;
  region: string;
}

/** Named geofence each node reports into — the unit for zone-level corroboration. */
export const ZONE_BY_NODE: Record<string, string> = {
  "FL-01": "zone-flood-mula-mutha",
  "FL-02": "zone-flood-pavana",
  "FL-03": "zone-flood-bhima",
  "FR-01": "zone-fire-bhimashankar",
  "FR-02": "zone-fire-sinhagad",
  "FR-03": "zone-fire-anjaneri",
  "PO-01": "zone-pollution-pimpri",
  "PO-02": "zone-pollution-hadapsar",
};

/** The exact 8 documents we want in `nodes`, derived from the shared node list. */
export function toNodeSeeds(): NodeSeed[] {
  return NODES.map((n) => ({
    id: n.id,
    name: n.name,
    lat: n.lat,
    lng: n.lng,
    hazardType: n.type,
    status: "online",
    zoneId: ZONE_BY_NODE[n.id] ?? `zone-${n.type}-${n.id.toLowerCase()}`,
    region: n.region ?? REGION,
  }));
}

/** Idempotent upsert of every demo node. Returns how many docs were written. */
export async function seedNodes(db: Firestore): Promise<number> {
  const nodes = db.collection("nodes");
  const requested = toNodeSeeds();

  if (process.env.SEED_WIPE === "1") {
    const existing = await nodes.get();
    await Promise.all(existing.docs.map((d) => d.ref.delete()));
    console.log(`  [seed] wiped ${existing.size} existing node docs (SEED_WIPE=1).`);
  }

  let count = 0;
  for (const node of requested) {
    const ref = nodes.doc(node.id);
    await ref.set(node);
    count++;
    console.log(
      `  [seed] ${node.hazardType.toUpperCase().padEnd(9)} ${node.id} ` +
        `${node.name.padEnd(26)} ${node.lat.toFixed(3)}, ${node.lng.toFixed(3)} ` +
        `${node.zoneId}`
    );
  }
  return count;
}

/* --------------------- entrypoint (only when run directly) --------------------- */

async function main(): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  if (!projectId) {
    console.error("✖ FIREBASE_PROJECT_ID is not set (see simulator/.env.example).");
    process.exit(1);
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  const options: AppOptions = { projectId };
  if (!emulatorHost) options.credential = applicationDefault();
  const db = getFirestore(initializeApp(options));

  const count = await seedNodes(db);
  const total = (await db.collection("nodes").get()).size;
  console.log(
    `\n  [seed] done — ${count} nodes seeded into "nodes" ` +
      `(collection now has ${total} documents).`
  );
  console.log(
    "  [seed] the scoreReading Cloud Function now resolves hazardType/zone/name from this registry.\n"
  );
  await db.terminate();
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("✖ seeding failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}