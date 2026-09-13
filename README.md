# AERIS · Environmental Early-Warning Dashboard

A working prototype for a **Smart India Hackathon** presentation: a network of
solar-powered IoT sensor nodes that detect **floods, forest fires and air
pollution**, score risk "on-device", and stream live readings into a
real-time dashboard with alerts and push notifications.

```
          ┌─────────────────────────────┐
          │  simulator (Node.js/TS)     │  8 virtual field nodes
          │  3 flood · 3 fire · 2 pol   │  push a realistic reading
          │  random rising-danger events│  every 3–5 s
          └──────────────┬──────────────┘
                         │  Firestore: "readings"
                         ▼
          ┌─────────────────────────────┐
          │  Cloud Functions (v2/TS)    │  on every new reading:
          │  risk.ts                    │   · "TinyML" risk model
          │     → riskLevel + confidence│   · writes "alerts"
          │     → FCM push (high/crit)  │   · escalation-dedupe
          └──────────────┬──────────────┘
                         │  live listeners
                         ▼
          ┌─────────────────────────────┐
          │  Dashboard (React+Vite+TS)  │  map · trend charts ·
          │  shadcn/ui · leaflet ·      │  alert feed · summary ·
          │  recharts · Firestore       │  browser push (optional)
          └─────────────────────────────┘
```

## Tech stack

| Layer | Tooling |
|---|---|
| Frontend | React 19 · Vite 8 · TypeScript · Tailwind CSS v4 · shadcn/ui |
| Maps / charts | react-leaflet 5 (dark CARTO tiles) · Recharts 3 |
| Realtime data | Firebase JS SDK (Firestore `onSnapshot`) |
| Simulator | Node.js + TypeScript (tsx), `firebase-admin` |
| Backend | Firebase Cloud Functions v2 (TypeScript) · Firestore · FCM |

## Repository layout

```
AERIS987/
├── firebase.json          # hosting (frontend/dist) + functions + rules/indexes
├── .firebaserc            # default project: aeris978-e62b8
├── firestore.rules        # strict demo rules (public reads, no client writes)
├── firestore.indexes.json # nodeId+createdAt composite indexes
├── frontend/              # React + Vite + TS + Tailwind + shadcn dashboard
│   ├── src/lib/risk.ts    #   client-side mirror of the risk model
│   ├── src/hooks/         #   live Firestore listeners, FCM push
│   └── public/firebase-messaging-sw.js
├── simulator/             # Node TS field-node simulator (8 nodes)
│   └── src/simulate.ts    #   per-node hazard state machine (rising-danger events)
└── functions/             # Cloud Functions v2 (TypeScript)
    ├── src/risk.ts        #   rule-based "on-device TinyML" risk model
    └── src/index.ts       #   reading → alert → FCM push · topic subscribe
```

## Prerequisites

- **Node.js 22.12+** (Node 24 recommended)
- **Firebase CLI** — `npm install -g firebase-tools` (or use the repo's local
  copy via `npx firebase`)
- A **Firebase project** with **Firestore**, **Cloud Functions** and
  **Cloud Messaging** enabled (Blaze plan for functions). Update the project id
  everywhere it says `aeris978-e62b8` (`.firebaserc`, `firebase.json`,
  `.env` files, service worker) if you use a different project.

## Setup

### 1. Authenticate Firebase

```bash
npm install -g firebase-tools
firebase login
firebase use aeris978-e62b8     # or your project id; .firebaserc already set
```

### 2. Install dependencies

```bash
npm install                       # root scripts + firebase-tools (local)
npm --prefix frontend install
npm --prefix simulator install
npm --prefix functions install
```

### 3. Configure environment

**Frontend** — `frontend/.env` already contains the web-app config for the demo
project. If you use your own project, copy the sample and fill from
Firebase Console > Project settings > Your apps:

```bash
cp frontend/.env.example frontend/.env
```

**Optional push notifications** — set `VITE_FIREBASE_VAPID_KEY` from
Project settings > Cloud Messaging > Web Push certificates. The dashboard shows
a bell icon; toggle it on and allow notification permission.

**Simulator** — the simulator uses the Admin SDK (bypasses security rules), so
it needs a service account:

1. Firebase Console > Project settings > **Service accounts** >
   **Generate new private key** (downloads a JSON file).
2. `cp simulator/.env.example simulator/.env`, then set
   `GOOGLE_APPLICATION_CREDENTIALS` to that file's absolute path.
   (Keep the key out of git — it is already in `.gitignore`.)

## Run it

Two terminals:

```bash
# Terminal 1 — start the field-node simulator (pushes readings to Firestore)
npm run sim

# Terminal 2 — start the dashboard
npm run dev        # http://localhost:5173
```

Open the dashboard: 8 nodes appear on the map. Every 3–5 s a new reading
arrives; the risk model in Cloud Functions scores it, writes to `alerts`, and
the feed/map update live. Within ~30–60 s a node will probabilistically start a
**rising-danger event**: risk visibly climbs normal → warning → high → critical
over ~10 readings, then recedes — ideal for a live demo.

You can also run everything fully local against the emulator suite:

```bash
npm --prefix functions run serve   # starts Firestore + Functions emulators
# then set FIRESTORE_EMULATOR_HOST=localhost:8080 in simulator/.env and rerun `npm run sim`
```

## Type checking / build

```bash
npm --prefix frontend run build       # tsc + vite build
npm --prefix simulator run build      # tsc --noEmit
npm --prefix functions run build      # tsc → functions/lib
```

## Deploy

```bash
npm run build                 # build the frontend → frontend/dist
npx firebase deploy           # hosting + functions (+ creates indexes/rules)
```

Deploying the functions to the live project creates two composite indexes
(`readings/nodeId+createdAt`, `alerts/nodeId+createdAt`); the CLI may prompt to
create them — accept. Firestore rules are strict-read demo rules: reads public,
all writes denied for browsers (the simulator/functions bypass via Admin SDK).

Verify end-to-end after deploy: run `npm run sim`, open
`https://aeris978-e62b8.web.app` (or your `--hosting` URL).

## Data model

**`readings/{id}`** — one per sensor push:

```ts
{
  nodeId, nodeName, nodeType: "flood"|"fire"|"pollution",
  region, lat, lng, source, createdAt,
  event: { active, phase, progress, remainingReads },   // simulator storytelling
  // flood:   waterLevelCm, soilMoisturePct, tiltDeg, pressureHpa
  // fire:    tempC, humidityPct, flameDetected, gasPpm, dustDensity
  // pollution: pm25, pm10, aqi, coPpm, no2Ppb
}
```

**`alerts/{id}`** — written by the Cloud Function on every reading:

```ts
{
  readingId, nodeId, nodeName, nodeType, region, lat, lng,
  riskLevel: "normal"|"warning"|"high"|"critical",
  previousRiskLevel, score, confidence, message, eventPhase,
  metrics, notified, createdAt
}
```

**Risk model** (`functions/src/risk.ts`, commented as the "on-device TinyML"
stand-in): per-hazard weighted thresholds → risk band + distance-based
confidence. Mirrored client-side (`frontend/src/lib/risk.ts`) so the map colors
instantly, and in the simulator (`simulator/src/risk.ts`) for terminal logging.

**FCM** — high/critical *escalations* publish to topic `aeris-alerts`
(callables `subscribeToTopic` / `unsubscribeFromTopic` manage browser tokens).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `FIREBASE_PROJECT_ID is not set` | create `simulator/.env` from `.env.example` |
| simulator auth error | service-account JSON path wrong in `simulator/.env` |
| dashboard shows "Firebase not configured" | fill `frontend/.env` and restart `npm run dev` |
| "Waiting for sensor data" block | start the simulator (`npm run sim`), check Firestore rules/emulator mode |
| CORS / region error on the bell toggle | ensure functions deployed & callable region matches SDK default (`us-central1`) |
| push never arrives | enable Cloud Messaging + set `VITE_FIREBASE_VAPID_KEY`, allow notification permission, keep the dashboard tab open |

## Notes

- This is a prototype: rules are deliberately open for reads; lock down before
  production. The "TinyML" scorer is a rule-based stand-in; the image/readme
  copy should be framed as "simulates the on-device model" to judges.
- Node coordinates are illustrative; swap `simulator/src/nodes.ts` for your
  proposed district.