// POST /api/admin/login {code}: the team's shared code -> a 30-day signed cookie.
'use strict';
const lib = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return lib.json(res, 405, { ok: false, error: 'POST only' });
  if (!lib.ADMIN_CODE) return lib.json(res, 503, { ok: false, error: 'Admin login is not set up yet (ADMIN_CODE is missing on the server).' });
  if (await lib.overLimit('login:' + lib.clientIp(req), 10, 900)) return lib.json(res, 429, { ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
  const body = await lib.readBody(req);
  if (!lib.codeMatches(String(body.code || '').trim())) return lib.json(res, 401, { ok: false, error: 'That code is not right.' });
  res.setHeader('Set-Cookie', lib.cookieHeader(lib.makeSession(30), 30 * 86400));
  return lib.json(res, 200, { ok: true });
};
