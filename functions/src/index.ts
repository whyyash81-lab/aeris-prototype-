/**
 * ============================================================================
 *  AERIS CLOUD-SIDE STAND-IN FOR THE ON-DEVICE TFLITE MICRO MODEL
 * ============================================================================
 *  In a real AERIS deployment each solar-powered field node runs a small TinyML
 *  model (TFLite Micro) on a low-power microcontroller. That model watches the
 *  raw sensor streams and emits a single risk verdict ("normal / warning /
 *  high / critical") plus a confidence, so the node radios only one short
 *  message per reporting cycle instead of a stream of raw numbers.
 *
 *  For this hackathon prototype the microcontrollers are simulated by the
 *  /simulator package. The model itself is baked into this Cloud Function: it
 *  fires on EVERY new reading in `readings`, scores it with the same
 *  threshold + weighted-average rules the on-device model would encode, boosts
 *  its confidence when the last 2-3 readings from the same node corroborate
 *  one another (our stand-in for "multi-node corroboration suppresses false
 *  alarms"), writes the assessment to `alerts`, and - for high/critical - sends
 *  an FCM push. Ask us: "the model lives here, standing in for the chip."
 *
 *  The rule table itself is duplicated for clarity in frontend/src/lib/risk.ts
 *  (dashboard mirror) and simulator/src/risk.ts (terminal mirror) so all three
 *  layers tell the same risk story.
 * ============================================================================
 */

import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";
import { buildMessage, computeRisk } from "./risk.js";
import type { MetricValues, NodeDoc, ReadingData } from "./types.js";

initializeApp();
const db = getFirestore();

const fcmTopic = defineString("FCM_TOPIC", { default: "aeris-alerts" });

const METRIC_KEYS: Record<ReadingData["nodeType"], string[]> = {
  flood: ["waterLevelCm", "soilMoisturePct", "tiltDeg", "pressureHpa"],
  fire: ["tempC", "humidityPct", "flameDetected", "gasPpm", "dustDensity"],
  pollution: ["pm25", "pm10", "aqi", "coPpm", "no2Ppb"],
};

/** How far back we look for corroborating readings from the same node. */
const CORROBORATION_WINDOW = 3;

/**
 * Confidence is raised by corroboration: consecutive readings whose risk band
 * matches the current one "vote" for the same verdict, which stands in for a
 * nearby node agreeing. Strong agreement → small boost; disagreement → a pull
 * down that models a possible false alarm.
 */
function applyCorroboration(confidence: number, agreement: number): number {
  if (agreement >= 0.66) return Math.min(0.99, confidence + 0.08);
  if (agreement >= 0.5) return Math.min(0.99, confidence + 0.04);
  return Math.max(0.35, confidence - 0.1);
}

/**
 * Fires on every new `readings` write.
 *
 * 1. looks up the node's registry entry (hazardType, name, zone…),
 * 2. runs the on-device-style risk model (see risk.ts),
 * 3. reads the last few readings from that node and boosts confidence when
 *    they corroborate the current verdict,
 * 4. stores the assessment + zoneId in `alerts` (transition-aware),
 * 5. pushes an FCM notification only when risk *escalates into* high/critical.
 */
export const scoreReading = onDocumentCreated(
  "readings/{readingId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.info("scoreReading: no snapshot — skipping.");
      return;
    }

    const reading = snapshot.data() as ReadingData;

    // --- step 1: node registry lookup ---------------------------------------
    // The `nodes` collection (seeded by simulator/seed-nodes.ts) is the source
    // of truth for hazard type / zone / name; we trust it over the reading's
    // own fields so tampered or mislabelled readings cannot self-promote.
    let node: NodeDoc | null = null;
    try {
      const nodeSnap = await db.collection("nodes").doc(reading.nodeId).get();
      if (nodeSnap.exists) node = nodeSnap.data() as NodeDoc;
    } catch (err) {
      logger.warn(`nodes lookup failed for ${reading.nodeId}`, err);
    }

    const nodeId = reading.nodeId ?? "unknown";
    const hazardType = node?.hazardType ?? reading.nodeType ?? "pollution";
    const base = {
      nodeId,
      nodeName: node?.name ?? reading.nodeName ?? "Unknown node",
      nodeType: hazardType,
      hazardType,
      zoneId: node?.zoneId ?? "zone-unknown",
      nodeStatus: node?.status ?? null,
      region: node?.region ?? reading.region ?? "",
      lat: Number(node?.lat ?? reading.lat ?? 0),
      lng: Number(node?.lng ?? reading.lng ?? 0),
    };

    // --- step 2: risk model -------------------------------------------------
    // Runs the rule table from risk.ts against the raw metrics. The hazard
    // type comes from the registry so the model always uses the right weights.
    const assessment = computeRisk({ ...reading, nodeType: hazardType });

    // --- step 3: corroboration confidence -----------------------------------
    // Fetch the last few readings from this node. Each one that lands in the
    // SAME risk band "votes" for the verdict — a single node's recent history
    // plays the role of neighbouring nodes confirming each other, which is the
    // mechanism our pitch cites for cutting false alarms.
    let confidence = assessment.confidence;
    let corroboration: number | null = null;
    try {
      const window = await db
        .collection("readings")
        .where("nodeId", "==", nodeId)
        .orderBy("createdAt", "desc")
        .limit(CORROBORATION_WINDOW + 1)
        .get();
      const priors = window.docs
        .filter((d) => d.id !== event.params.readingId)
        .slice(0, CORROBORATION_WINDOW);
      if (priors.length >= 2) {
        let matches = 0;
        for (const doc of priors) {
          const prior = doc.data() as ReadingData;
          const priorInput: ReadingData = { ...prior, nodeType: hazardType };
          if (computeRisk(priorInput).riskLevel === assessment.riskLevel) matches++;
        }
        corroboration = matches / priors.length;
        confidence = applyCorroboration(confidence, corroboration);
      }
    } catch (err) {
      // Corroboration is best-effort: a miss (missing index, cold start) must
      // not fail the trigger or drop the alert.
      logger.warn(`corroboration window read failed for ${nodeId}`, err);
    }

    const metrics: MetricValues = {};
    const raw = reading as unknown as Record<string, unknown>;
    for (const key of METRIC_KEYS[hazardType]) {
      const val = raw[key];
      if (typeof val === "number" || typeof val === "boolean") metrics[key] = val;
    }

    const message = buildMessage({ ...reading, nodeType: hazardType }, assessment);

    // --- step 4: persist the alert ------------------------------------------
    // score is persisted on the judge-facing 0-100 scale (the model itself
    // computes on 0..1); confidence stays a 0..1 fraction the dashboard renders.
    let previousRiskLevel: string | null = null;
    try {
      const prev = await db
        .collection("alerts")
        .where("nodeId", "==", nodeId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      prev.forEach((doc: QueryDocumentSnapshot) => {
        const d = doc.data();
        if (typeof d.riskLevel === "string") previousRiskLevel = d.riskLevel;
      });
    } catch (err) {
      logger.warn(`could not read previous alert for ${nodeId}`, err);
    }

    const alertRef = await db.collection("alerts").add({
      readingId: event.params.readingId,
      ...base,
      riskLevel: assessment.riskLevel,
      previousRiskLevel,
      score: Number((assessment.score * 100).toFixed(1)),
      confidence: Number(confidence.toFixed(3)),
      corroboration: corroboration == null ? null : Number(corroboration.toFixed(3)),
      message,
      eventPhase: reading.event?.phase ?? null,
      metrics,
      acknowledged: false,
      notified: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info(
      `${nodeId} → ${assessment.riskLevel} (score ${(assessment.score * 100).toFixed(1)}/100, ` +
        `conf ${confidence.toFixed(3)}${corroboration == null ? "" : `, corroboration ${(corroboration * 100).toFixed(0)}%`}), ` +
        `prev=${previousRiskLevel ?? "none"}`
    );

    // --- step 5: push on escalation into high/critical -----------------------
    const escalated =
      (assessment.riskLevel === "high" || assessment.riskLevel === "critical") &&
      previousRiskLevel !== assessment.riskLevel &&
      previousRiskLevel !== "high" &&
      previousRiskLevel !== "critical";

    if (!escalated) return;

    const title = `${base.nodeName} — ${assessment.riskLevel.toUpperCase()} risk`;
    try {
      await getMessaging().send({
        topic: fcmTopic.value(),
        notification: {
          title,
          body: message,
        },
        data: {
          nodeId,
          nodeType: hazardType,
          nodeName: base.nodeName,
          hazardType,
          zoneId: base.zoneId,
          riskLevel: assessment.riskLevel,
          score: String(Math.round(assessment.score * 100)),
          confidence: String(confidence),
          message,
          alertId: alertRef.id,
        },
        android: {
          priority: "high",
          notification: {
            title,
            body: message,
            color: assessment.riskLevel === "critical" ? "#ef4444" : "#f97316",
            sound: "default",
          },
        },
      });
      await alertRef.update({
        notified: true,
        notifiedAt: FieldValue.serverTimestamp(),
      });
      logger.info(`push sent to topic "${fcmTopic.value()}" for ${nodeId}`);
    } catch (err) {
      // FCM failures (e.g. topic without subscribers) must not fail the trigger.
      logger.warn(`push failed for ${nodeId}`, err);
    }
  }
);

/* ---------------------- FCM topic management (web push) ------------------ */

function validateParams(data: unknown): { token: string; topic: string } {
  const record = data as { token?: unknown; topic?: unknown } | null;
  const token = record?.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new HttpsError("invalid-argument", "A device FCM token is required.");
  }
  const candidateTopic = record?.topic;
  const topic =
    typeof candidateTopic === "string" && candidateTopic.length > 0
      ? candidateTopic
      : fcmTopic.value();
  if (/[^a-zA-Z0-9-_.~%+]/.test(topic)) {
    throw new HttpsError("invalid-argument", "Topic contains invalid characters.");
  }
  return { token, topic };
}

export const subscribeToTopic = onCall(async (request) => {
  const { token, topic } = validateParams(request.data);
  await getMessaging().subscribeToTopic(token, topic);
  logger.info(`token ${token.slice(0, 6)}… subscribed to ${topic}`);
  return { success: true, topic, token: `${token.slice(0, 6)}…` };
});

export const unsubscribeFromTopic = onCall(async (request) => {
  const { token, topic } = validateParams(request.data);
  await getMessaging().unsubscribeFromTopic(token, topic);
  logger.info(`token ${token.slice(0, 6)}… unsubscribed from ${topic}`);
  return { success: true, topic };
});