import { normalize } from './search.js';
const kinds = { affiliation: 'Affiliation', event: 'Event', interest: 'Interest', tag: 'Tag' };
const clean = (text) => normalize(text).trim().replace(/\s+/g, ' ');
function graphName(person) {
  return person.details.name || person.details.role || person.details.affiliation || 'Unnamed connection';
}
function facts(person) {
  const result = new Map();
  const add = (kind, value, identity = clean(value)) => {
    if (identity && value?.trim()) result.set(`${kind}/${identity}`, { kind, value: value.trim() });
  };
  add('affiliation', person.details.affiliation);
  for (const [kind, field] of [
    ['interest', 'interests'],
    ['tag', 'tags'],
  ])
    for (const v of (person.details[field] || '').split(/[,;\n]/)) add(kind, v);
  for (const encounter of person.encounters) {
    const name = encounter.event_name?.trim();
    if (!name) continue;
    // Independently typed titles need a matching date to identify a particular gathering.
    const key = encounter.event_id
      ? 'id/' + encounter.event_id
      : encounter.met_on
        ? 'manual/' + JSON.stringify([clean(name), encounter.met_on])
        : '';
    add('event', name, key);
  }
  return result;
}
function graphEdges(people) {
  // The renderer calls this for the visible page of contacts, bounding dense cohorts.
  const groups = new Map(),
    pairs = new Map();
  for (const p of people)
    for (const [key, fact] of facts(p)) {
      const members = groups.get(key) || [];
      for (const other of members) {
        const [source, target] = [p.id, other].sort();
        const id = JSON.stringify([source, target]);
        if (!pairs.has(id)) pairs.set(id, { id, source, target, reasons: [] });
        pairs.get(id).reasons.push(fact);
      }
      members.push(p.id);
      groups.set(key, members);
    }
  return [...pairs.values()].map((edge) => ({
    ...edge,
    reasons: edge.reasons.sort(
      (a, b) =>
        Object.keys(kinds).indexOf(a.kind) - Object.keys(kinds).indexOf(b.kind) ||
        a.value.localeCompare(b.value),
    ),
  }));
}
function explain(reason) {
  if (reason.kind === 'affiliation') return `Both list ${reason.value} as their affiliation.`;
  if (reason.kind === 'event') return `You saved both people with ${reason.value} as event context.`;
  if (reason.kind === 'interest') return `Both list ${reason.value} as an interest.`;
  return `You tagged both people “${reason.value}”.`;
}
export { kinds, graphName, graphEdges, explain };
