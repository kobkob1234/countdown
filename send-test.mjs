import admin from 'firebase-admin';
import webpush from 'web-push';

const {
  FIREBASE_DATABASE_URL,
  GOOGLE_APPLICATION_CREDENTIALS,
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  PUSH_APP_URL,
  PUSH_TARGET_USER
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

function normalizeAppUrl(input) {
  const u = new URL(input || 'http://localhost/');
  u.hash = '';
  u.search = '';
  if (!u.pathname.endsWith('/')) u.pathname = `${u.pathname}/`;
  return u;
}

function buildUrl(pathname = '/', params = {}) {
  const APP_URL = normalizeAppUrl(PUSH_APP_URL);
  const rawPath = String(pathname || '.');
  const relPath = rawPath === '/' ? '.' : rawPath.replace(/^\/+/, '') || '.';
  const u = new URL(relPath, APP_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

function isValidSubscription(sub) {
  return sub && typeof sub.endpoint === 'string' && sub.keys && sub.keys.p256dh && sub.keys.auth;
}

async function loadAllSubscriptions() {
  const snap = await db.ref('users').once('value');
  const users = snap.val() || {};
  const subs = [];

  for (const [userId, userData] of Object.entries(users)) {
    if (PUSH_TARGET_USER && userId !== PUSH_TARGET_USER) continue;
    const pushSubs = userData?.pushSubscriptions || {};
    for (const [key, entry] of Object.entries(pushSubs)) {
      const sub = entry?.sub;
      if (isValidSubscription(sub)) {
        subs.push({ userId, key, sub });
      }
    }
  }
  return subs;
}

const payload = {
  title: 'Test notification ✅',
  body: 'If you see this, push delivery is working.',
  tag: `test-${Date.now()}`,
  url: buildUrl('/', {}),
  requireInteraction: true,
  renotify: true,
  actions: [
    { action: 'view', title: 'View' }
  ]
};

const subs = await loadAllSubscriptions();
console.log(`Loaded ${subs.length} subscriptions`);

let ok = 0;
let failed = 0;

await Promise.allSettled(subs.map(async ({ userId, key, sub }) => {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    ok += 1;
  } catch (err) {
    failed += 1;
    const statusCode = err?.statusCode;
    console.warn(`[push] failed user=${userId} key=${key} status=${statusCode || 'unknown'}`);

    // Cleanup expired subscriptions (410 Gone / 404 Not Found)
    if (statusCode === 410 || statusCode === 404) {
      await db.ref(`users/${userId}/pushSubscriptions/${key}`).remove().catch(() => { });
    }
  }
}));

console.log(`Done. ok=${ok} failed=${failed}`);

// Cleanup Firebase connections to allow clean exit
try {
  if (typeof db.goOffline === 'function') db.goOffline();
} catch { }
try {
  await admin.app().delete();
} catch { }
