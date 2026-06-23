/**
 * Push Notification Reminder Sender — GitHub Actions entry point.
 *
 * Thin entry point — ALL reminder logic lives in ../../api/_shared/reminder-core.js,
 * shared with api/cron.js (Vercel) so the two senders can never drift. This
 * wrapper only does GitHub-Actions-specific setup: applicationDefault
 * credentials (GOOGLE_APPLICATION_CREDENTIALS), VAPID, and the run loop.
 *
 * TIMEZONE LIMITATION: planner blocks use a hardcoded Israel timezone offset
 * (see getZoneOffsetMs in the shared core).
 */
import admin from 'firebase-admin';
import webpush from 'web-push';
import { setTimeout as sleep } from 'timers/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const core = require('../../api/_shared/reminder-core.js');

const {
  FIREBASE_DATABASE_URL,
  GOOGLE_APPLICATION_CREDENTIALS,
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  PUSH_APP_URL,
  LOOP_SECONDS
} = process.env;

if (!FIREBASE_DATABASE_URL) throw new Error('Missing env FIREBASE_DATABASE_URL');
if (!GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Missing env GOOGLE_APPLICATION_CREDENTIALS');
if (!VAPID_SUBJECT) throw new Error('Missing env VAPID_SUBJECT');
if (!VAPID_PUBLIC_KEY) throw new Error('Missing env VAPID_PUBLIC_KEY');
if (!VAPID_PRIVATE_KEY) throw new Error('Missing env VAPID_PRIVATE_KEY');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: FIREBASE_DATABASE_URL
});
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const db = admin.database();
core.initCore({ db, webpush, appUrl: PUSH_APP_URL });

async function main() {
  const loopSeconds = Number(LOOP_SECONDS) || 0;

  if (loopSeconds > 0) {
    const start = Date.now();
    const end = start + (loopSeconds * 1000);
    console.log(`Starting loop for ${loopSeconds} seconds...`);

    while (Date.now() < end) {
      try {
        await core.runCheck();
      } catch (e) {
        console.error('Error in runCheck:', e);
      }

      if (Date.now() + 30000 < end) {
        await sleep(15000); // Wait 15s before next check for better precision
      } else {
        break;
      }
    }
  } else {
    await core.runCheck();
  }

  // Cleanup old pushSent records (run occasionally to prevent DB bloat)
  try {
    await core.cleanupOldPushSent();
  } catch (e) {
    console.warn('Cleanup error:', e);
  }

  // Cleanup Firebase connection
  try {
    if (typeof db.goOffline === 'function') db.goOffline();
  } catch (e) {
    console.warn('[cleanup] goOffline failed:', e.message);
  }
  try {
    await admin.app().delete();
  } catch (e) {
    console.warn('[cleanup] app.delete failed:', e.message);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
