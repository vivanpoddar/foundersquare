import test from 'node:test';
import assert from 'node:assert/strict';
import { search, safeLink } from '../../assets/connector/search.js';
import { demoData } from '../../assets/connector/demo.js';
import { parseRoster } from '../../assets/connector/roster.js';
import api from '../../api/interconnected.js';
const people = demoData().connections;
const ids = (text, filters) => search(people, text, filters).map((r) => r.person.id);
test('partial names, transposed letters and ordinary phrasing', () => {
  for (const q of ['Ani', 'Ainka', 'Someone whose name sounded like Anika']) assert.equal(ids(q)[0], 'anika');
  assert.deepEqual(ids('flutist'), []);
});
test('topics, local calendar months, private notes and grounded explanations', () => {
  assert.equal(ids('Person I met last month who wanted a designer')[0], 'anika');
  const hits = search(people, 'healthcare founder from the build night');
  assert.equal(hits[0].person.id, 'imani');
  assert.ok(hits[0].reasons.some((r) => r.includes('Bay Build Night')));
  assert.ok(ids('Who do I know working on robotics?').includes('unknown'));
  assert.deepEqual(ids('People I met at the founder dinner').sort(), ['theo', 'unknown']);
  assert.deepEqual(ids('peaches', { eventKey: 'id:demo-build' }), []);
  assert.deepEqual(ids('', { tag: 'Design', affiliation: 'Fieldwork Robotics', follow: true }), ['anika']);
});
test('January last-month range and marking someone as met are independent', () => {
  const sample = [
    {
      id: '1',
      details: { name: 'Kay' },
      encounters: [{ met: true, met_on: '2025-12-31', note: 'Textiles' }],
      created_at: '2025-01-01',
    },
    {
      id: '2',
      details: { name: 'Kay' },
      encounters: [{ met: false, met_on: '2025-12-01', note: 'Textiles' }],
      created_at: '2025-01-01',
    },
  ];
  assert.equal(search(sample, 'people I met last month', {}, new Date(2026, 0, 1)).length, 1);
  assert.equal(search(sample, 'textiles last month', {}, new Date(2026, 0, 1)).length, 2);
});
test('CSV preview keeps duplicate names, handles quotes, drops unrelated private columns', () => {
  assert.deepEqual(
    parseRoster(
      '\ufeffFull Name,Email Address,RSVP Status,Notes\r\n"May, Jo",a@example.com,Going,"Line 1\nLine 2"\r\n"May, Jo",,Maybe,private',
    ),
    [
      { name: 'May, Jo', email: 'a@example.com', status: 'Going' },
      { name: 'May, Jo', email: '', status: 'Maybe' },
    ],
  );
  assert.throws(() => parseRoster('Other,Notes\none,two'));
  assert.throws(() => parseRoster('Name,Status\n"unfinished'));
  assert.throws(() => parseRoster('Name,Status\nBob,Yes,extra'));
  assert.equal(safeLink('website', 'javascript:alert(1)'), '');
  assert.equal(safeLink('email', 'name@example.com'), 'mailto:name@example.com');
});
test('Luma reads every page, minimizes fields and refuses incomplete replacement', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, req) => {
    calls.push(url);
    assert.equal(url.origin, 'https://public-api.luma.com');
    assert.equal(req.headers['x-luma-api-key'], 'test');
    return Response.json({
      entries: [
        {
          user_name: 'Sample',
          user_email: 'test@example.com',
          approval_status: 'approved',
          phone_number: 'ignored',
        },
      ],
      has_more: calls.length === 1,
      next_cursor: 'next',
    });
  });
  const rows = await api.getLumaRoster('evt-sample', 'test');
  assert.equal(calls[1].searchParams.get('pagination_cursor'), 'next');
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]), ['name', 'email', 'status']);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ entries: [], has_more: true }));
  await assert.rejects(api.getLumaRoster('evt-sample', 'test'), /incomplete/);
});
test('public config rejects secret keys and Luma sync requires the event owner', async (t) => {
  const keys = [
    'INTERCONNECTED_SUPABASE_URL',
    'INTERCONNECTED_SUPABASE_PUBLISHABLE_KEY',
    'INTERCONNECTED_LUMA_KEY',
  ];
  const original = keys.map((k) => process.env[k]);
  t.after(() =>
    keys.forEach((k, i) => {
      if (original[i] === undefined) delete process.env[k];
      else process.env[k] = original[i];
    }),
  );
  Object.assign(process.env, {
    INTERCONNECTED_SUPABASE_URL: 'https://sandbox.example.com',
    INTERCONNECTED_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example',
    INTERCONNECTED_LUMA_KEY: 'server-only-test',
  });
  const invoke = async (method, body, authorization = '') => {
    let response;
    const res = {
      setHeader() {},
      end(value) {
        response = JSON.parse(value);
      },
    };
    await api({ method, body, headers: { authorization } }, res);
    return { status: res.statusCode, body: response };
  };
  assert.deepEqual((await invoke('GET')).body, { config: null });
  process.env.INTERCONNECTED_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_example';
  const config = (await invoke('GET')).body.config;
  assert.deepEqual(config, { url: 'https://sandbox.example.com', key: 'sb_publishable_example' });
  const event_id = '10000000-0000-4000-8000-000000000001',
    calls = [];
  let host = 'another-user',
    fail = false;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    url = new URL(url);
    calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'test-user' });
    if (url.pathname === '/rest/v1/ic_events')
      return Response.json([{ host_id: host, luma_id: 'evt-sample' }]);
    if (url.hostname === 'public-api.luma.com') {
      if (fail) return new Response(null, { status: 503 });
      return Response.json({
        entries: [{ user_name: 'Guest', approval_status: 'approved' }],
        has_more: false,
      });
    }
    assert.equal(url.pathname, '/rest/v1/ic_rosters');
    assert.equal(init.headers.Authorization, 'Bearer test');
    assert.equal(JSON.parse(init.body).guests[0].name, 'Guest');
    return new Response(null, { status: 201 });
  });
  assert.equal((await invoke('POST', { event_id })).status, 401);
  assert.equal((await invoke('POST', { event_id }, 'Bearer test')).status, 403);
  assert.ok(!calls.includes('/v1/events/guests/list'));
  host = 'test-user';
  fail = true;
  assert.equal((await invoke('POST', { event_id }, 'Bearer test')).status, 502);
  assert.ok(!calls.includes('/rest/v1/ic_rosters'), 'failed refresh preserves previous snapshot');
  fail = false;
  assert.deepEqual((await invoke('POST', { event_id }, 'Bearer test')).body, { count: 1 });
});
