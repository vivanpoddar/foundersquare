export const labels = {
  name: 'Name',
  affiliation: 'Affiliation',
  role: 'Role',
  interests: 'Interests',
  looking: 'Building, looking for, or can help with',
  tags: 'Tags',
  website: 'Website',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  email: 'Email',
  phone: 'Phone',
};
export const publicFields = Object.keys(labels).filter((key) => key !== 'tags');
export const normalize = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
export const terms = (value) => normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
export function localDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export function titleOf(person) {
  return (
    person.details.name ||
    person.details.role ||
    person.encounters.find((e) => e.note)?.note ||
    person.details.affiliation ||
    Object.values(person.details).find(Boolean) ||
    'Saved connection'
  );
}
export function safeLink(key, text) {
  if (!text) return '';
  if (key === 'email') return /^[^\s@?#]+@[^\s@?#]+\.[^\s@?#]+$/.test(text) ? 'mailto:' + text : '';
  if (key === 'phone') return /^\+?[\d() .-]{5,25}$/.test(text) ? 'tel:' + text.replace(/[^+\d]/g, '') : '';
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
const stop = new Set(
  terms(
    'a an and at by do for from i in is know last like looking me met month my name of on people person someone sounded than that the their to wanted was who whose with working works',
  ),
);
const families = [
  ['healthcare', 'health', 'medical', 'medtech'],
  ['robot', 'robots', 'robotic', 'robotics'],
  ['design', 'designers', 'designer'],
  ['founders', 'founder'],
  ['build', 'building'],
  ['engineer', 'engineers', 'engineering'],
];
function near(a, b) {
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    errors = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++errors > 1) return false;
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) {
      i += 2;
      j += 2;
    } else {
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
  }
  return errors + a.length - i + b.length - j <= 1;
}
function weight(token, word) {
  if (token === word) return 10;
  if (token.length >= 2 && word.startsWith(token)) return 7;
  if (families.some((group) => group.includes(token) && group.includes(word))) return 6;
  return near(token, word) ? 4 : 0;
}
export function search(people, query = '', filters = {}, now = new Date()) {
  let text = normalize(query);
  let from = filters.from || '',
    to = filters.to || '';
  if (/\blast month\b/.test(text)) {
    const first = localDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const last = localDay(new Date(now.getFullYear(), now.getMonth(), 0));
    from = from > first ? from : first;
    to = to && to < last ? to : last;
    text = text.replace(/\blast month\b/g, '');
  }
  const tokens = [...new Set(terms(text).filter((t) => !stop.has(t)))];
  const metOnly = /\bmet\b/.test(text);
  const results = [];
  for (const person of people) {
    const d = person.details;
    if (filters.follow && !person.follow_up) continue;
    if (filters.affiliation && normalize(d.affiliation) !== normalize(filters.affiliation)) continue;
    if (filters.tag && !(d.tags || '').split(',').some((t) => normalize(t.trim()) === normalize(filters.tag)))
      continue;
    const encounters = person.encounters.filter(
      (e) =>
        (!filters.eventKey ||
          (e.event_id ? 'id:' + e.event_id : 'name:' + e.event_name) === filters.eventKey) &&
        (!metOnly || e.met) &&
        (!from || (e.met_on && e.met_on >= from)) &&
        (!to || (e.met_on && e.met_on <= to)),
    );
    if ((from || to || filters.eventKey || metOnly) && !encounters.length) continue;
    const fields = Object.entries(d)
      .filter(([, v]) => v)
      .map(([k, v]) => [labels[k] || k, v]);
    for (const e of encounters) {
      if (e.note) fields.push(['Private note', e.note]);
      if (e.event_name) fields.push(['Event', e.event_name]);
      if (e.place) fields.push(['Place', e.place]);
    }
    const evidence = [],
      indexed = fields.map(([key, value]) => ({ key, value, words: terms(value) }));
    let score = 0;
    for (const token of tokens) {
      let best = 0,
        winner;
      for (const f of indexed) {
        const n = f.words.reduce((max, w) => Math.max(max, weight(token, w)), 0);
        const ranked = n ? n + (f.key === 'Name' ? 1 : 0) : 0;
        if (ranked > best) {
          best = ranked;
          winner = f;
        }
      }
      if (!winner) {
        score = -1;
        break;
      }
      score += best;
      if (!evidence.includes(winner)) evidence.push(winner);
    }
    if (score < 0 || (query.trim() && !tokens.length && !metOnly && !from && !to)) continue;
    if (normalize(d.name) === text.trim() && text.trim()) score += 20;
    const reasons = evidence.map((f) => f.key + ' · ' + f.value);
    if ((from || to || metOnly || filters.eventKey) && encounters.length) {
      const e = encounters[0];
      reasons.push([e.event_name, e.met_on].filter(Boolean).join(' · '));
    }
    results.push({ person, score, reasons: [...new Set(reasons.filter(Boolean))] });
  }
  return results.sort((a, b) => b.score - a.score || b.person.created_at.localeCompare(a.person.created_at));
}
