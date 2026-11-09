// Shared helpers for the Founder Square API routes (Vercel Node functions).
// Storage: Upstash Redis over REST (the "Upstash for Redis" marketplace
// integration on Vercel sets KV_REST_API_URL / KV_REST_API_TOKEN). Email: Resend.
// Everything degrades: no Redis -> an in-memory list (fine for local dev and
// previews, lost on redeploy); no Resend -> messages are stored but not emailed.
'use strict';
const crypto = require('crypto');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const ADMIN_CODE = process.env.ADMIN_CODE || '';
const SESSION_SECRET = process.env.SESSION_SECRET || ADMIN_CODE;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_TO = process.env.MAIL_TO || 'team@foundersquare.org';
const MAIL_FROM = process.env.MAIL_FROM || 'Founder Square <team@foundersquare.org>';
const KEY = 'fs:messages';

/* ---------- storage ---------- */
const memory = { list: [], sets: {}, counters: {} };

async function redis(...command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  const data = await r.json();
  if (data.error) throw new Error('redis: ' + data.error);
  return data.result;
}
const hasRedis = () => Boolean(REDIS_URL && REDIS_TOKEN);

async function saveMessage(msg) {
  if (hasRedis()) { await redis('LPUSH', KEY, JSON.stringify(msg)); await redis('LTRIM', KEY, 0, 4999); return; }
  memory.list.unshift(msg); memory.list = memory.list.slice(0, 5000);
}
async function listMessages(limit = 500) {
  const raw = hasRedis() ? await redis('LRANGE', KEY, 0, limit - 1) : memory.list.slice(0, limit).map(m => JSON.stringify(m));
  const handled = new Set(hasRedis() ? await redis('SMEMBERS', KEY + ':handled') : Object.keys(memory.sets.handled || {}));
  return raw.map(s => { try { const m = JSON.parse(s); m.handled = handled.has(m.id); return m; } catch { return null; } }).filter(Boolean);
}
async function setHandled(id, handled) {
  if (hasRedis()) { await redis(handled ? 'SADD' : 'SREM', KEY + ':handled', id); return; }
  memory.sets.handled = memory.sets.handled || {};
  if (handled) memory.sets.handled[id] = 1; else delete memory.sets.handled[id];
}
// Allow `max` hits per `windowSec` for a key; returns true when over the limit.
async function overLimit(key, max, windowSec) {
  const k = 'fs:rl:' + key;
  if (hasRedis()) {
    const n = await redis('INCR', k);
    if (n === 1) await redis('EXPIRE', k, windowSec);
    return n > max;
  }
  const now = Date.now(); const c = memory.counters[k] || { n: 0, exp: now + windowSec * 1000 };
  if (c.exp < now) { c.n = 0; c.exp = now + windowSec * 1000; }
  c.n += 1; memory.counters[k] = c; return c.n > max;
}

/* ---------- admin session cookie ---------- */
function sign(payload) { return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url'); }
function makeSession(days = 30) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + days * 86400000 })).toString('base64url');
  return payload + '.' + sign(payload);
}
function readSession(cookieHeader) {
  if (!SESSION_SECRET) return false;
  const m = /(?:^|;\s*)fs_admin=([^;]+)/.exec(cookieHeader || '');
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
function codeMatches(code) {
  if (!ADMIN_CODE || typeof code !== 'string') return false;
  const a = Buffer.from(code), b = Buffer.from(ADMIN_CODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cookieHeader = (value, maxAge) => `fs_admin=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/* ---------- email ---------- */
async function sendEmail(msg) {
  if (!RESEND_API_KEY) return { sent: false, reason: 'no RESEND_API_KEY' };
  const text = [
    `New sponsorship request on foundersquare.org`, ``,
    `From: ${msg.name}${msg.role ? ', ' + msg.role : ''}${msg.company ? ' at ' + msg.company : ''}`,
    `Email: ${msg.email}`,
    msg.url ? `Website: ${msg.url}` : null,
    msg.event ? `Event: ${msg.event}` : null,
    msg.interests && msg.interests.length ? `Could bring: ${msg.interests.join(', ')}` : (msg.interest ? `Interested in: ${msg.interest}` : null),
    msg.budget ? `Budget: ${msg.budget}` : null, ``,
    msg.message || '(no message)', ``,
    `Received ${new Date(msg.ts).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} Pacific. Reply to this email to answer them; the full history is at https://foundersquare.org/admin`,
  ].filter(l => l !== null).join('\n');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [MAIL_TO], reply_to: msg.email, subject: `Sponsorship request: ${msg.company || msg.name}`, text }),
  });
  if (!r.ok) return { sent: false, reason: 'resend ' + r.status + ' ' + (await r.text()).slice(0, 200) };
  return { sent: true };
}

/* ---------- http helpers ---------- */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? safeParse(req.body) : req.body;
  return new Promise(resolve => {
    let data = ''; req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(safeParse(data)));
  });
}
function safeParse(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

module.exports = { hasRedis, saveMessage, listMessages, setHandled, overLimit, makeSession, readSession, codeMatches, cookieHeader, sendEmail, json, readBody, clientIp, clean, ADMIN_CODE, RESEND_API_KEY };
