// POST /api/subscribe {email, source?}: join the list for the next event's
// announcement. Stored for the admin page; nothing is emailed on signup.
'use strict';
const lib = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return lib.json(res, 405, { ok: false, error: 'POST only' });
  const body = await lib.readBody(req);
  if (lib.clean(body.fax, 10) || lib.clean(body.hp, 10)) return lib.json(res, 200, { ok: true }); // honeypot: bots fill it, people never see it
  const email = lib.clean(body.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return lib.json(res, 400, { ok: false, error: 'Please enter a working email.' });
  if (await lib.overLimit('subscribe:' + lib.clientIp(req), 10, 600)) return lib.json(res, 429, { ok: false, error: 'Too many signups from this connection. Try again in a few minutes.' });
  const source = lib.clean(body.source, 40) || lib.clean(req.headers.referer, 120);
  try {
    const added = await lib.saveSubscriber(email, source);
    return lib.json(res, 200, { ok: true, added });
  } catch (e) {
    return lib.json(res, 503, { ok: false, error: 'We could not save that right now. Please email team@foundersquare.org.' });
  }
};
