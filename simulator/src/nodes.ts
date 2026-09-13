import type { EventConfig, HazardType, SensorNode } from "./types.js";

export type { EventConfig, SensorNode };

/**
 * AERIS field-node network — 8 solar-powered nodes spread around the
 * Pune metro / Western Ghats sample region. Coordinates approximate.
 */

export const REGION = "Pune · Western Ghats";

const floodClamp: Record<string, [number, number]> = {
  waterLevelCm: [200, 1200],
  soilMoisturePct: [10, 100],
  tiltDeg: [0, 20],
  pressureHpa: [980, 1030],
};

const fireClamp: Record<string, [number, number]> = {
  tempC: [18, 72],
  humidityPct: [4, 100],
  gasPpm: [0, 180],
  dustDensity: [0, 1000],
};

const pollutionClamp: Record<string, [number, number]> = {
  pm25: [4, 500],
  pm10: [10, 600],
  aqi: [20, 500],
  coPpm: [0.1, 8],
  no2Ppb: [2, 220],
};

export const NODES: SensorNode[] = [
  // ----------------------------- FLOOD -----------------------------
  {
    id: "FL-01",
    name: "Mula-Mutha Riverbank",
    type: "flood",
    region: REGION,
    lat: 18.4966,
    lng: 73.875,
    baseline: { waterLevelCm: 402, soilMoisturePct: 61, tiltDeg: 1.6, pressureHpa: 1011 },
    noise: { waterLevelCm: 14, soilMoisturePct: 4, tiltDeg: 0.3, pressureHpa: 1.4 },
    clamp: floodClamp,
    spikeChance: 0.03,
  },
  {
    id: "FL-02",
    name: "Pavana Dam Tailrace",
    type: "flood",
    region: REGION,
    lat: 18.5902,
    lng: 73.7094,
    baseline: { waterLevelCm: 428, soilMoisturePct: 64, tiltDeg: 1.2, pressureHpa: 1010 },
    noise: { waterLevelCm: 12, soilMoisturePct: 3.5, tiltDeg: 0.25, pressureHpa: 1.5 },
    clamp: floodClamp,
    spikeChance: 0.03,
  },
  {
    id: "FL-03",
    name: "Bhigwan Bhima Basin",
    type: "flood",
    region: REGION,
    lat: 18.304,
    lng: 74.768,
    baseline: { waterLevelCm: 356, soilMoisturePct: 55, tiltDeg: 0.9, pressureHpa: 1012 },
    noise: { waterLevelCm: 11, soilMoisturePct: 3, tiltDeg: 0.2, pressureHpa: 1.3 },
    clamp: floodClamp,
    spikeChance: 0.03,
  },

  // ------------------------------ FIRE ------------------------------
  {
    id: "FR-01",
    name: "Bhimashankar Sanctuary",
    type: "fire",
    region: REGION,
    lat: 19.0693,
    lng: 73.535,
    baseline: { tempC: 33.5, humidityPct: 56, gasPpm: 9, dustDensity: 70 },
    noise: { tempC: 1.8, humidityPct: 4.5, gasPpm: 4, dustDensity: 38 },
    clamp: fireClamp,
    spikeChance: 0.04,
  },
  {
    id: "FR-02",
    name: "Sinhagad Ridge",
    type: "fire",
    region: REGION,
    lat: 18.366,
    lng: 73.755,
    baseline: { tempC: 35.2, humidityPct: 48, gasPpm: 11, dustDensity: 85 },
    noise: { tempC: 1.6, humidityPct: 4, gasPpm: 5, dustDensity: 40 },
    clamp: fireClamp,
    spikeChance: 0.04,
  },
  {
    id: "FR-03",
    name: "Anjaneri Hills",
    type: "fire",
    region: REGION,
    lat: 19.7642,
    lng: 73.6643,
    baseline: { tempC: 31.8, humidityPct: 60, gasPpm: 8, dustDensity: 62 },
    noise: { tempC: 1.7, humidityPct: 5, gasPpm: 4, dustDensity: 35 },
    clamp: fireClamp,
    spikeChance: 0.04,
  },

  // ---------------------------- POLLUTION ----------------------------
  {
    id: "PO-01",
    name: "Pimpri Industrial Belt",
    type: "pollution",
    region: REGION,
    lat: 18.627,
    lng: 73.815,
    baseline: { pm25: 52, pm10: 104, aqi: 132, coPpm: 1.4, no2Ppb: 34 },
    noise: { pm25: 14, pm10: 26, aqi: 30, coPpm: 0.5, no2Ppb: 11 },
    clamp: pollutionClamp,
    spikeChance: 0.05,
  },
  {
    id: "PO-02",
    name: "Hadapsar City Junction",
    type: "pollution",
    region: REGION,
    lat: 18.5089,
    lng: 73.92,
    baseline: { pm25: 66, pm10: 128, aqi: 164, coPpm: 1.9, no2Ppb: 46 },
    noise: { pm25: 16, pm10: 30, aqi: 34, coPpm: 0.6, no2Ppb: 13 },
    clamp: pollutionClamp,
    spikeChance: 0.05,
  },
];

/** Rising-danger scenario tuning per hazard type. */
export const EVENT_CONFIG: Record<HazardType, EventConfig> = {
  flood: {
    ramp: 10,
    hold: 4,
    recede: 8,
    chance: 0.045,
    pivot: "waterLevelCm",
    delta: {
      waterLevelCm: 470,
      soilMoisturePct: 30,
      tiltDeg: 7,
      pressureHpa: -15,
    },
  },
  fire: {
    ramp: 10,
    hold: 4,
    recede: 8,
    chance: 0.045,
    pivot: "tempC",
    delta: {
      tempC: 28,
      humidityPct: -33,
      gasPpm: 60,
      dustDensity: 420,
    },
  },
  pollution: {
    ramp: 10,
    hold: 5,
    recede: 8,
    chance: 0.06,
    pivot: "pm25",
    delta: {
      pm25: 270,
      pm10: 300,
      aqi: 240,
      coPpm: 2.6,
      no2Ppb: 58,
    },
  },
};