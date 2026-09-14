/**
 * env.ts — loads simulator config with a LOCAL/PROD mode switch, chosen by the
 * first bare CLI arg being literally `prod` (npm run seed:prod / simulate:prod).
 *
 *   LOCAL (default): .env — FIRESTORE_EMULATOR_HOST stays set, so the Admin SDK
 *                     talks to the in-memory emulator on 127.0.0.1:8080.
 *   PROD (arg "prod"): .env.prod is loaded with override — it sets
 *                     GOOGLE_APPLICATION_CREDENTIALS and blanks the emulator
 *                     host, so the Admin SDK authenticates with the service
 *                     account and writes to the real project. Never commit
 *                     .env.prod or service-account.json.
 */

import { config } from "dotenv";

config(); // local defaults (.env), always loaded first

export const isProd = process.argv.slice(2).includes("prod");

if (isProd) {
  const res = config({ path: ".env.prod", override: true });
  if (res.error || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "✖ prod mode: .env.prod is missing or has no GOOGLE_APPLICATION_CREDENTIALS.\n" +
        "  Copy .env.prod.example → .env.prod with GOOGLE_APPLICATION_CREDENTIALS=./service-account.json"
    );
    process.exit(1);
  }
  console.log(
    `\n  [mode] PRODUCTION — writing to real Firestore project ${process.env.FIREBASE_PROJECT_ID ?? "(unset)"} via ${process.env.GOOGLE_APPLICATION_CREDENTIALS}\n`
  );
} else {
  console.log(
    `\n  [mode] LOCAL — Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST ?? "unset"}\n`
  );
}