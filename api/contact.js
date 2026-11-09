// POST /api/contact: a sponsor's message from the website. Stored for the admin
// page and emailed to the team. Fields: name, email, company?, interest?, message.
'use strict';
const lib = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return lib.json(res, 405, { ok: false, error: 'POST only' });
  const body = await lib.readBody(req);
  if (lib.clean(body.fax, 10) || lib.clean(body.hp, 10)) return lib.json(res, 200, { ok: true }); // honeypot: bots fill it, people never see it
  const name = lib.clean(body.name, 120), email = lib.clean(body.email, 200), company = lib.clean(body.company, 160);
  const role = lib.clean(body.role, 80), url = lib.clean(body.url, 200), event = lib.clean(body.event, 80), budget = lib.clean(body.budget, 60);
  const interests = (Array.isArray(body.interests) ? body.interests : [body.interests]).map(v => lib.clean(v, 60)).filter(Boolean).slice(0, 10);
  const interest = lib.clean(body.interest, 80) || interests.join(', ');
  const message = String(body.message == null ? '' : body.message).trim().slice(0, 5000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (!company && !message)) return lib.json(res, 400, { ok: false, error: 'Please give your name, a working email and your company.' });
  if (await lib.overLimit('contact:' + lib.clientIp(req), 5, 600)) return lib.json(res, 429, { ok: false, error: 'Too many messages from this connection. Please email team@foundersquare.org instead.' });

  const msg = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), ts: Date.now(), name, email, company, role, url, event, budget, interests, interest, message, page: lib.clean(req.headers.referer, 200) };
  let stored = false, mail = { sent: false, reason: 'not attempted' };
  try { await lib.saveMessage(msg); stored = true; } catch (e) { mail.reason = 'store failed: ' + e.message; }
  try { mail = await lib.sendEmail(msg); } catch (e) { mail = { sent: false, reason: e.message }; }
  if (!stored && !mail.sent) return lib.json(res, 503, { ok: false, error: 'We could not take your message right now. Please email team@foundersquare.org.' });
  return lib.json(res, 200, { ok: true, emailed: mail.sent });
};
