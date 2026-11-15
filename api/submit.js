// POST /api/submit: a team's Build Night project. One entry per team name;
// resubmitting with the same team name replaces the earlier entry.
// GET /api/submit: whether submissions are still open (for the page).
// Closes at SUBMIT_CLOSES (default 8:05 PM Pacific, Nov 16, 2026).
'use strict';
const lib = require('./_lib');

const CLOSES = Date.parse(process.env.SUBMIT_CLOSES || '2026-11-16T20:05:00-08:00');
const TRACKS = ['Best Use of Fo', 'Best Use of Cognee', 'Best Use of Computer Vision', 'Best Overall only'];
const TOOLS = ['Cognee', 'Slashy', 'Allowance', 'Silmaril', 'Other'];
const isUrl = s => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(s);
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

module.exports = async (req, res) => {
  const open = Date.now() < CLOSES;
  if (req.method === 'GET') return lib.json(res, 200, { ok: true, open, closes: new Date(CLOSES).toISOString() });
  if (req.method !== 'POST') return lib.json(res, 405, { ok: false, error: 'GET or POST' });
  if (!open) return lib.json(res, 403, { ok: false, error: 'Submissions closed at 8:05 PM. Find a Founder Square organizer right away if you missed it.' });
  const body = await lib.readBody(req);
  if (lib.clean(body.fax, 10)) return lib.json(res, 200, { ok: true }); // honeypot

  const team = lib.clean(body.team, 80), project = lib.clean(body.project, 100), oneLiner = lib.clean(body.oneLiner, 140);
  const track = lib.clean(body.track, 60), video = lib.clean(body.video, 300), link = lib.clean(body.link, 300);
  const members = (Array.isArray(body.members) ? body.members : []).slice(0, 4)
    .map(m => ({ name: lib.clean(m && m.name, 80), email: lib.clean(m && m.email, 200).toLowerCase() }))
    .filter(m => m.name || m.email);
  const tools = (Array.isArray(body.tools) ? body.tools : [body.tools]).map(t => lib.clean(t, 30)).filter(t => TOOLS.includes(t));

  const problems = [];
  if (!team) problems.push('a team name');
  if (!members.length || members.some(m => !m.name || !isEmail(m.email))) problems.push('a name and working email for each teammate');
  if (!project) problems.push('a project name');
  if (!oneLiner) problems.push('a one-line description');
  if (!TRACKS.includes(track)) problems.push('one track');
  if (!isUrl(video)) problems.push('a link to your 2-minute demo video');
  if (!isUrl(link)) problems.push('a link to your project (GitHub or live URL)');
  if (body.confirm !== true && body.confirm !== 'on') problems.push('the confirmation box');
  if (problems.length) return lib.json(res, 400, { ok: false, error: 'Please add ' + problems.join(', ') + '.' });
  if (await lib.overLimit('submit:' + lib.clientIp(req), 15, 600)) return lib.json(res, 429, { ok: false, error: 'Too many submissions from this connection. Find an organizer.' });

  const sub = { ts: Date.now(), team, members, project, oneLiner, track, video, link, tools };
  try {
    const isNew = await lib.saveSubmission(sub);
    return lib.json(res, 200, { ok: true, updated: !isNew });
  } catch (e) {
    return lib.json(res, 503, { ok: false, error: 'We could not save your submission. Find a Founder Square organizer right away.' });
  }
};
