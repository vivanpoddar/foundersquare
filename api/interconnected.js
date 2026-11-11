'use strict';
const { json, readBody } = require('./_lib');
function configuration() {
  const url = process.env.INTERCONNECTED_SUPABASE_URL || '';
  const key = process.env.INTERCONNECTED_SUPABASE_PUBLISHABLE_KEY || '';
  // Reject secret keys even if an operator puts one in the public-key variable.
  let publishable = /^sb_publishable_[\w-]+$/.test(key);
  if (!publishable && key.split('.').length === 3) {
    try {
      publishable = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon';
    } catch {}
  }
  try {
    const origin = new URL(url);
    if (
      publishable &&
      (origin.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(origin.hostname))
    ) {
      return { url: origin.origin, key };
    }
  } catch {}
  return null;
}
async function getLumaRoster(id, key) {
  let cursor = '',
    guests = [];
  const seen = new Set();
  do {
    const url = new URL('https://public-api.luma.com/v1/events/guests/list');
    url.searchParams.set('event_id', id);
    url.searchParams.set('pagination_limit', '100');
    if (cursor) url.searchParams.set('pagination_cursor', cursor);
    const response = await fetch(url, {
      headers: { 'x-luma-api-key': key },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok)
      throw Error('Luma could not complete the refresh. Check calendar access or import a CSV.');
    const page = await response.json();
    if (!Array.isArray(page.entries) || typeof page.has_more !== 'boolean')
      throw Error('Unexpected Luma guest list.');
    guests.push(
      ...page.entries.map((g) => ({
        name: g.user_name || '',
        email: g.user_email || '',
        status: g.approval_status || '',
      })),
    );
    if (guests.length > 4000) throw Error('This pilot supports up to 4,000 registrations per event.');
    cursor = page.has_more ? page.next_cursor : '';
    if (page.has_more && (!cursor || seen.has(cursor))) throw Error('Luma returned an incomplete page.');
    seen.add(cursor);
  } while (cursor);
  return guests;
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const config = configuration();
  if (req.method === 'GET') return json(res, 200, { config });
  if (req.method !== 'POST') return json(res, 405, { error: 'Method unavailable.' });
  if (!config) return json(res, 503, { error: 'Live accounts are unavailable.' });
  const token = req.headers.authorization || '';
  if (!/^Bearer [^\s]+$/.test(token)) return json(res, 401, { error: 'Sign in again.' });
  const headers = { apikey: config.key, Authorization: token };
  try {
    const { event_id } = await readBody(req);
    if (!/^[\da-f-]{36}$/i.test(event_id || '')) return json(res, 400, { error: 'Choose an event.' });
    const [auth, event] = await Promise.all([
      fetch(config.url + '/auth/v1/user', { headers }),
      fetch(config.url + '/rest/v1/ic_events?id=eq.' + event_id + '&select=host_id,luma_id', { headers }),
    ]);
    if (!auth.ok) return json(res, 401, { error: 'Sign in again.' });
    if (!event.ok) return json(res, 503, { error: 'The event could not be loaded.' });
    const user = await auth.json(),
      [record] = await event.json();
    if (!record || record.host_id !== user.id)
      return json(res, 403, { error: 'Event host access required.' });
    if (!process.env.INTERCONNECTED_LUMA_KEY || !/^evt-[\w-]+$/.test(record.luma_id)) {
      return json(res, 409, { error: 'Add a Luma calendar key and event API ID, or import a Luma CSV.' });
    }
    const guests = await getLumaRoster(record.luma_id, process.env.INTERCONNECTED_LUMA_KEY);
    const saved = await fetch(config.url + '/rest/v1/ic_rosters?on_conflict=event_id,source', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ event_id, source: 'luma', guests, updated_at: new Date().toISOString() }),
    });
    if (!saved.ok) throw Error('The roster could not be saved.');
    return json(res, 200, { count: guests.length });
  } catch (error) {
    const message = /^(Luma |This pilot |Unexpected Luma|The roster)/.test(error.message)
      ? error.message
      : 'Refresh failed. Try again or import a CSV.';
    return json(res, 502, { error: message });
  }
};
module.exports.getLumaRoster = getLumaRoster;
