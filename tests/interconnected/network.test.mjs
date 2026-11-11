import assert from 'node:assert/strict';
import test from 'node:test';
import { demoData } from '../../assets/connector/demo.js';
import { graphEdges } from '../../assets/connector/graph.js';
import { generatedDraft, gmailCompose } from '../../assets/connector/follow-up.js';
import { Workspace } from '../../assets/connector/store.js';
const data = demoData();
test('Gmail receives the edited fields verbatim; generated drafts use confirmed context', () => {
  const maya = data.connections.find((p) => p.id === 'maya-serrin'),
    draft = generatedDraft(maya, { name: 'Sam' });
  assert.match(draft.body, /hiring at Google/);
  assert.match(draft.body, /meeting you at Bay Build Night/);
  assert.ok(!draft.body.includes(maya.encounters[0].note));
  assert.equal(draft.to, 'maya.serrin@example.com');
  const unknown = generatedDraft({
    details: {},
    encounters: [{ met: false, event_name: 'Private event', note: 'private conversation' }],
  });
  assert.equal(unknown.to, '');
  assert.match(unknown.body, /^Hi there,/);
  assert.doesNotMatch(unknown.body, /meeting|Private event|private conversation/);
  const edited = { to: 'sam+events@example.org', subject: 'R&D + mobile', body: 'Hi!\nLunch & coffee? #yes' };
  const url = gmailCompose(edited),
    params = new URL(url).searchParams;
  assert.equal(new URL(url).origin, 'https://mail.google.com');
  for (const [param, key] of [
    ['to', 'to'],
    ['su', 'subject'],
    ['body', 'body'],
  ])
    assert.equal(params.get(param), edited[key]);
});
test('shared facts have distinct identities, exact affiliations and unique pairs', () => {
  const person = (id, affiliation, idAtEvent, day) => ({
    id,
    details: { affiliation, tags: 'Robotics, robotics' },
    encounters: [{ event_id: idAtEvent, event_name: 'Build night', met_on: day }],
  });
  const a = person('a', ' Google ', 'evt1', '2026-11-01'),
    b = person('b', 'google', 'evt2', '2026-11-01');
  let [edge] = graphEdges([a, b]);
  assert.deepEqual(
    edge.reasons.map((r) => r.kind),
    ['affiliation', 'tag'],
  );
  b.details.affiliation = 'Google Ventures';
  b.encounters[0].event_id = 'evt1';
  [edge] = graphEdges([a, b]);
  assert.deepEqual(
    edge.reasons.map((r) => r.kind),
    ['event', 'tag'],
  );
  b.encounters[0].event_id = null;
  a.encounters[0].event_id = null;
  b.encounters[0].met_on = '2026-11-02';
  assert.deepEqual(
    graphEdges([a, b])[0].reasons.map((r) => r.kind),
    ['tag'],
  );
  assert.deepEqual(graphEdges([a]), []);
});
test('existing demos gain the example once and keep personal edits and deletions', async (t) => {
  const key = 'foundersquare.interconnected.demo.v1',
    storage = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  const old = demoData();
  delete old.sampleVersion;
  old.connections = old.connections.filter((p) => !['maya-serrin', 'jonah-vale', 'imani'].includes(p.id));
  old.connections[0].details.name = 'Edited name';
  old.memberships = old.memberships.filter((m) => !['p-maya-serrin', 'p-jonah-vale'].includes(m.user_id));
  storage.set(key, JSON.stringify(old));
  const ws = new Workspace(null, null);
  assert.equal((await ws.load()).connections.length, 7);
  await ws.deletePerson('maya-serrin');
  const updated = await ws.load();
  assert.equal(updated.connections.length, 6);
  assert.equal(updated.connections[0].details.name, 'Edited name');
  assert.ok(!updated.connections.some((p) => p.id === 'imani'));
});
