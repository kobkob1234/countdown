/**
 * Web Push Notification Cron Handler for Vercel Serverless.
 *
 * Thin entry point — ALL reminder logic lives in api/_shared/reminder-core.js,
 * which is shared with tools/push-sender/send-reminders.mjs (GitHub Actions) so
 * the two senders can never drift. This wrapper only does Vercel-specific setup:
 * credentials from FIREBASE_SERVICE_ACCOUNT, VAPID, the API-key check, and the
 * HTTP response. Triggered by cron-job.org.
 */
const admin = require('firebase-admin');
const webpush = require('web-push');
const core = require('./_shared/reminder-core.js');

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://countdown-463de-default-rtdb.firebaseio.com';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:kobeamit1@gmail.com';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BL-m24SrurFUNIQxH7S77r1yYShIiCibpw2CbtK8FwYATHzYiR0kQGKzWilEGRHyRK2jxqRPUR_RJoAVUgrO-24';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const PUSH_APP_URL = process.env.APP_URL || 'https://kobkob1234.github.io/countdown/';

if (!VAPID_PRIVATE_KEY) {
  console.warn('[VAPID] No private key configured - cannot send');
}

let coreReady = false;
function ensureInit() {
  if (!admin.apps.length) {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountStr);
    } catch (e) {
      throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT: ' + e.message);
    }

    if (Object.keys(serviceAccount).length === 0) {
      // Fallback to applicationDefault if no service account is provided
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: FIREBASE_DATABASE_URL
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DATABASE_URL
      });
    }
  }

  if (VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }

  if (!coreReady) {
    core.initCore({ db: admin.database(), webpush, appUrl: PUSH_APP_URL });
    coreReady = true;
  }
}

// ============================================
module.exports = async (req, res) => {
    // Security: Check for API key (MANDATORY)
    const apiKey = req.query.key || req.headers['x-api-key'];
    const expectedKey = process.env.CRON_API_KEY;

    if (!expectedKey || !apiKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        ensureInit();
        const result = await core.runCheck();

        // Cleanup old pushSent records (run occasionally to prevent DB bloat)
        try {
            await core.cleanupOldPushSent();
        } catch (e) {
            console.warn('Cleanup error:', e);
        }

        res.status(200).json({
            ok: true,
            timestamp: new Date().toISOString(),
            ...result
        });
    } catch (err) {
        console.error('Cron error:', err);
        res.status(500).json({ error: err.message });
    }
};
