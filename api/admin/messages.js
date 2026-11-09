// GET  /api/admin/messages            -> every sponsor message, newest first
// POST /api/admin/messages {id, handled} -> mark one handled or not
// Both need the admin cookie from /api/admin/login.
'use strict';
const lib = require('../_lib');

module.exports = async (req, res) => {
  if (!lib.readSession(req.headers.cookie)) return lib.json(res, 401, { ok: false, error: 'Sign in first.' });
  if (req.method === 'GET') {
    const messages = await lib.listMessages(500);
    return lib.json(res, 200, { ok: true, messages, storage: lib.hasRedis() ? 'redis' : 'memory', email: lib.RESEND_API_KEY ? 'on' : 'off' });
  }
  if (req.method === 'POST') {
    const body = await lib.readBody(req);
    const id = lib.clean(body.id, 40);
    if (!id) return lib.json(res, 400, { ok: false, error: 'id required' });
    await lib.setHandled(id, Boolean(body.handled));
    return lib.json(res, 200, { ok: true });
  }
  return lib.json(res, 405, { ok: false, error: 'GET or POST' });
};
