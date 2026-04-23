const admin = require('firebase-admin');
const crypto = require('node:crypto');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://countdown-463de-default-rtdb.firebaseio.com'
  });
}

const db = admin.database();

const DEFAULT_DELAY_MINUTES = Number.parseInt(process.env.REMIND_AGAIN_DELAY_MINUTES || '10', 10) || 10;
const MAX_DELAY_MINUTES = 60;
const QUEUE_TTL_MS = Number.parseInt(process.env.REMIND_AGAIN_QUEUE_TTL_MS || '', 10) || (24 * 60 * 60 * 1000);

function hashKey(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('base64url');
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = parseRequestBody(req);
    const token = String(body.token || '').trim();
    const userId = String(body.userId || '').trim();
    const taskId = String(body.taskId || '').trim();
    const subjectId = String(body.subjectId || '').trim();
    const occurrence = String(body.occurrence || '').trim();
    const requestedMinutes = Number.parseInt(body.minutes, 10);

    if (!token || !userId) {
      return res.status(400).json({ error: 'Missing token or userId' });
    }

    const delayMinutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0
      ? Math.min(requestedMinutes, MAX_DELAY_MINUTES)
      : DEFAULT_DELAY_MINUTES;

    const now = Date.now();
    const tokenHash = hashKey(`remind-again:${token}`);
    const tokenRef = db.ref(`users/${userId}/remindAgainTokens/${tokenHash}`);

    const txResult = await tokenRef.transaction((cur) => {
      if (!cur) return;
      if (cur.status !== 'pending') return;
      if (cur.expiresAt && Number(cur.expiresAt) < now) return;

      if (taskId && cur.taskId && String(cur.taskId) !== taskId) return;
      if (subjectId && String(cur.subjectId || '') !== subjectId) return;
      if (occurrence && String(cur.occurrence || '') !== occurrence) return;

      return {
        ...cur,
        status: 'used',
        usedAt: now,
        usedBy: 'notification-action'
      };
    });

    if (!txResult.committed) {
      return res.status(409).json({ error: 'Token is invalid, expired, or already used' });
    }

    const tokenRecord = txResult.snapshot.val() || {};
    const resolvedTaskId = String(tokenRecord.taskId || taskId || '').trim();
    if (!resolvedTaskId) {
      return res.status(400).json({ error: 'Token payload is missing task context' });
    }

    const queueId = tokenHash;
    const queueRef = db.ref(`users/${userId}/remindAgainQueue/${queueId}`);
    const dueAt = now + delayMinutes * 60000;

    await queueRef.set({
      status: 'pending',
      type: tokenRecord.type || (tokenRecord.subjectId ? 'shared-task' : 'task'),
      taskId: resolvedTaskId,
      subjectId: String(tokenRecord.subjectId || subjectId || '').trim(),
      occurrence: String(tokenRecord.occurrence || occurrence || '').trim(),
      baseDedupeKey: String(tokenRecord.baseDedupeKey || ''),
      baseUrl: String(tokenRecord.baseUrl || ''),
      title: String(tokenRecord.title || ''),
      delayMinutes,
      dueAt,
      expiresAt: now + QUEUE_TTL_MS,
      requestedAt: now,
      tokenHash
    });

    return res.status(200).json({ ok: true, dueAt, delayMinutes });
  } catch (err) {
    console.error('[remind-again] failed:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
