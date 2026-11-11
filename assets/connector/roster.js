// CSVs may contain a BOM, quoted commas, embedded newlines and doubled quotes.
export function csvRows(input) {
  const rows = [],
    text = input.replace(/^\uFEFF/, '');
  let row = [],
    field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else field += ch;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
      closed = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
      closed = false;
    } else if (ch === '"' && !field && !closed) quoted = true;
    else if (closed || ch === '"') throw Error('A quoted CSV field is malformed.');
    else field += ch;
  }
  if (quoted) throw Error('A quoted CSV field is unfinished.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function parseRoster(text) {
  const [header, ...rows] = csvRows(text);
  if (!header || !rows.length) throw Error('Choose a guest CSV with at least one guest.');
  if (rows.length > 4000) throw Error('Import up to 4,000 guests at a time.');
  const names = header.map((s) => s.toLowerCase().replace(/[_-]/g, ' ').trim());
  const col = (...keys) => keys.map((k) => names.indexOf(k)).find((i) => i >= 0);
  const n = col('name', 'guest name', 'full name', 'user name', 'guest'),
    first = col('first name', 'user first name'),
    last = col('last name', 'user last name'),
    email = col('email', 'email address', 'guest email', 'user email'),
    status = col('rsvp', 'rsvp status', 'approval status', 'status', 'registration status', 'response');
  if (n == null && first == null && email == null)
    throw Error('Expected a name or email column. Export a guest list from the host dashboard.');
  return rows.map((r, i) => {
    if (r.length !== header.length) throw Error('Check the column count in guest row ' + (i + 1) + '.');
    const guest = {
      name: (r[n] || [r[first], r[last]].filter(Boolean).join(' ')).slice(0, 180),
      email: (r[email] || '').trim().toLowerCase().slice(0, 254),
      status: (r[status] || 'Unspecified').slice(0, 80),
    };
    if (!guest.name && !guest.email)
      throw Error('Guest row ' + (i + 1) + ' has neither a name nor an email.');
    return guest;
  });
}
