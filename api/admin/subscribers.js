// GET /api/admin/subscribers -> the event email list, newest first.
// Needs the admin cookie from /api/admin/login.
'use strict';
const lib = require('../_lib');

module.exports = async (req, res) => {
  if (!lib.readSession(req.headers.cookie)) return lib.json(res, 401, { ok: false, error: 'Sign in first.' });
  if (req.method !== 'GET') return lib.json(res, 405, { ok: false, error: 'GET only' });
  const subscribers = await lib.listSubscribers();
  return lib.json(res, 200, { ok: true, subscribers, storage: lib.hasRedis() ? 'redis' : 'memory' });
};
