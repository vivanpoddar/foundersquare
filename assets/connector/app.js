import { search, labels, publicFields, titleOf, safeLink } from './search.js';
import { generatedDraft, gmailCompose, draftCard, readDraft } from './follow-up.js';
import { Workspace, liveClient } from './store.js';
import { eventsUI } from './events.js';
import {
  icon,
  esc,
  button,
  linkTo,
  field,
  infoFields,
  readInfo,
  dateLabel,
  avatar,
  heading,
  addButton,
  empty,
  options,
  dialog,
  notice,
} from './ui.js';
const main = document.querySelector('#main'),
  state = { ws: null, client: null, data: null };
let query = '',
  filters = {},
  filtersOpen = false,
  renderVersion = 0,
  loadVersion = 0,
  serviceIssue = '';
let mapView = null;
const draftEdits = new Map();
const detailKeys = Object.keys(labels);
const eventUI = eventsUI({ state, route, reload, profile, capture });
function route() {
  const p = new URLSearchParams(location.search);
  return p.has('event')
    ? { page: 'event', id: p.get('event') }
    : { page: p.get('view') || 'connections', id: p.get('id') || '' };
}
function setRoute(page, id) {
  const next = linkTo(page, id);
  if (next !== location.pathname + location.search) history.pushState({}, '', next);
}
function nav() {
  const r = route(),
    selected = r.page === 'person' ? 'connections' : r.page === 'event' ? 'events' : r.page;
  document.querySelector('#nav').innerHTML = [
    ['connections', 'people', 'My connections'],
    ['map', 'map', 'Map'],
    ['events', 'events', 'Events'],
    ['account', 'profile', 'My profile'],
  ]
    .map(
      ([p, i, l]) =>
        `<a class="nav-link" data-route href="${linkTo(p)}" ${p === selected ? 'aria-current="page"' : ''}>${icon(i)}${p === 'connections' ? '<span class="nav-long">My connections</span><span class="nav-short">Connections</span>' : l}</a>`,
    )
    .join('');
  document.querySelector('#mode').innerHTML = state.ws.demo
    ? `<span class="mode-title">Demo workspace</span><p>Fictional people and events.<br>Changes stay in this browser.</p>${state.client ? button('signin', 'Sign in', 'text-btn') : ''}`
    : `<span class="mode-title">Private workspace</span><p>${esc(state.ws.user.email)}</p>`;
}
function rows() {
  const matches = search(state.data.connections, query, filters);
  const n = document.querySelector('#result-count');
  if (n) n.textContent = matches.length + ' ' + (matches.length === 1 ? 'connection' : 'connections');
  if (!matches.length)
    return state.data.connections.length
      ? empty(
          'No matching connections',
          'Try a shorter name, another topic, or clear your filters.',
          button('clear', 'Clear search and filters'),
        )
      : empty(
          'Save your first connection',
          'Start with a name, an event, or one thing you remember.',
          button('new', 'Save someone', 'btn'),
        );
  return matches
    .map(({ person: p, reasons }) => {
      const latest = [...p.encounters].sort((a, b) => (b.met_on || '').localeCompare(a.met_on || ''))[0];
      const sub = [p.details.role, p.details.affiliation].filter((v) => v && v !== titleOf(p)).join(' · ');
      return `<a class="person-row" data-route href="${esc(linkTo('person', p.id))}">${avatar(p)}<span class="row-who"><strong>${esc(titleOf(p))}</strong><small>${esc(sub)}</small>
      ${reasons.length ? `<span class="why">${esc(reasons.join(' · '))}</span>` : ''}</span><span class="row-context"><strong>${esc(latest?.event_name || '')}</strong><small>${esc(dateLabel(latest?.met_on))}</small></span><span class="row-end">${icon('next')}</span></a>`;
    })
    .join('');
}
function updateRows() {
  const list = document.querySelector('#people-list');
  if (list) list.innerHTML = rows();
}
function home() {
  const people = state.data.connections;
  const select = (key, text, values) =>
    `<label class="form-field">${text}<select data-filter="${key}">${options(values, filters[key])}</select></label>`;
  const savedEvents = new Map();
  for (const person of people)
    for (const encounter of person.encounters) {
      if (!encounter.event_name) continue;
      const linked = state.data.events.find((event) => event.id === encounter.event_id);
      const key = encounter.event_id ? 'id:' + encounter.event_id : 'name:' + encounter.event_name;
      savedEvents.set(key, linked ? linked.title + ' · ' + dateLabel(linked.day) : encounter.event_name);
    }
  if (filters.eventKey && !savedEvents.has(filters.eventKey)) {
    const linked = state.data.events.find((event) => 'id:' + event.id === filters.eventKey);
    if (linked) savedEvents.set(filters.eventKey, linked.title + ' · ' + dateLabel(linked.day));
  }
  const eventFilter =
    '<label class="form-field">Event<select data-filter="eventKey"><option value="">All events</option>' +
    [...savedEvents]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(
        ([key, label]) =>
          `<option value="${esc(key)}" ${filters.eventKey === key ? 'selected' : ''}>${esc(label)}</option>`,
      )
      .join('') +
    '</select></label>';
  return (
    heading(
      'My connections',
      'Find someone by what you remember.',
      '<button class="btn quick-save" type="button" data-action="new" aria-label="Save someone">' +
        icon('plus') +
        '<span class="long-label">Save someone</span><span class="short-label">Save</span></button>',
    ) +
    `<div class="searchline">${icon('search')}<input type="search" id="people-query" aria-label="Search your connections" placeholder="Name, topic, or event…" value="${esc(query)}">
      <button type="button" class="minor" data-action="filters" aria-controls="filters" aria-expanded="${filtersOpen}">${icon('filters')} Filters${Object.keys(filters).some((k) => k !== 'follow' && filters[k]) ? ' · on' : ''}</button></div>
    <div class="filters" id="filters" ${filtersOpen ? '' : 'hidden'}>
      ${eventFilter}${select(
        'affiliation',
        'Affiliation',
        people.map((p) => p.details.affiliation),
      )}
      ${select(
        'tag',
        'Tag',
        people.flatMap((p) => (p.details.tags || '').split(',').map((t) => t.trim())),
      )}
      <div class="form-grid">${['from', 'to'].map((k) => `<label class="form-field">${k === 'from' ? 'From' : 'Through'}<input type="date" data-filter="${k}" value="${esc(filters[k])}"></label>`).join('')}</div>
      ${button('clear', 'Clear search and filters', 'text-btn')}</div>
    <div class="list-tools"><div class="tabs" aria-label="Connection list">${['All connections', 'Follow up'].map((s, i) => `<button class="tab ${Boolean(filters.follow) === Boolean(i) ? 'active' : ''}" aria-pressed="${Boolean(filters.follow) === Boolean(i)}" data-action="${i ? 'follow-list' : 'all-list'}">${s}</button>`).join('')}</div>
    <span id="result-count" class="count" role="status"></span></div><div class="list" id="people-list"></div>`
  );
}
function contactValue(key, value) {
  const href = safeLink(key, value);
  return href && ['website', 'linkedin', 'instagram', 'phone', 'email'].includes(key)
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(value)} ↗</a>`
    : esc(value);
}
function personView(id) {
  const p = state.data.connections.find((c) => c.id === id);
  if (!p)
    return empty(
      'Connection unavailable',
      'It may have been deleted.',
      `<a data-route href="/connector">My connections</a>`,
    );
  const facts = Object.entries(p.details).filter(([k, v]) => k !== 'name' && v);
  return `<a class="back-link" data-route href="/connector">← My connections</a><div class="detail-hero">${avatar(p)}<div><h1>${esc(titleOf(p))}</h1><p class="muted">Private connection</p></div></div>
    <div class="actions section">${button('follow', p.follow_up ? 'Remove from follow up' : 'Add to follow up')}${button('edit-person', 'Edit details')}${button('delete-person', 'Delete', 'text-btn')}</div>
    ${draftCard(draftEdits.get(p.id) || p.email_draft || generatedDraft(p, state.data.profile))}
    ${facts.length ? `<section class="section"><h2>Details</h2><dl class="facts">${facts.map(([k, v]) => `<dt>${esc(labels[k] || k)}</dt><dd>${contactValue(k, v)}</dd>`).join('')}</dl></section>` : ''}
    <section class="section"><div class="section-head"><h2>Encounters</h2>${button('add-encounter', 'Add encounter')}</div><div class="notes">
    ${
      p.encounters.length
        ? [...p.encounters]
            .sort((a, b) => (b.met_on || '').localeCompare(a.met_on || ''))
            .map(
              (e) => `<article class="note"><h3>${esc(e.event_name || 'Private note')}</h3>
      <small>${esc([e.met ? 'Marked as met' : 'Saved context', dateLabel(e.met_on), e.place].filter(Boolean).join(' · '))}</small>${e.note ? `<p>${esc(e.note)}</p>` : ''}<div class="actions">
      ${button('edit-encounter', 'Edit encounter', 'text-btn', e.id)}${button('delete-encounter', 'Delete encounter', 'text-btn', e.id)}</div></article>`,
            )
            .join('')
        : empty('No encounters yet', 'Add a conversation note or record where you met.')
    }</div></section>`;
}
function account() {
  const p = state.data.profile,
    hasNotes = !!state.data.connections.length;
  return (
    heading(
      'My profile',
      state.ws.demo ? 'You’re using fictional demo data. Changes stay in this browser.' : state.ws.user.email,
    ) +
    `<div class="stack"><section class="panel"><h2>${esc(p.name || 'Your attendee profile')}</h2><p>${esc([p.role, p.affiliation].filter(Boolean).join(' · ') || 'Choose what to share separately at each event.')}</p>${button('edit-profile', 'Edit profile')}</section>
    <section class="panel"><h2>Account</h2><p>${state.ws.demo ? (state.client ? 'Sign in to keep your own connections across devices.' : serviceIssue || 'Live sign-in is unavailable in this preview.') : 'Your saved connections and notes are private to you.'}</p>
    ${state.ws.demo ? (state.client ? button('signin', 'Sign in', 'btn') : '') : button('signout', 'Sign out')}</section>
    <section class="panel"><h2>Your data</h2><p>Export a JSON copy of your connections and encounters, or delete them together.</p><div class="actions">${button('export', 'Export connections')}${hasNotes ? button('delete-all', 'Delete saved connections', 'text-btn') : ''}${state.ws.demo ? button('reset', 'Reset demo', 'text-btn') : ''}</div></section></div>`
  );
}
async function render() {
  if (!state.data) return;
  const rev = ++renderVersion,
    r = route();
  nav();
  main.setAttribute('aria-busy', 'true');
  if (r.page !== 'map' && mapView) {
    mapView.unmount();
    mapView = null;
  }
  let content;
  try {
    if (r.page === 'map') {
      const { mountMap } = await import('./map.bundle.js');
      if (rev !== renderVersion) return;
      if (mapView) mapView.update(state.data.connections);
      else {
        main.replaceChildren();
        mapView = mountMap(main, state.data.connections, (id) => {
          setRoute('person', id);
          render();
          main.focus({ preventScroll: true });
          window.scrollTo(0, 0);
        });
      }
      main.setAttribute('aria-busy', 'false');
      document.title = 'Connection map · InterConnected by FounderSquare';
      return;
    }
    if (r.page === 'event') {
      main.innerHTML = '<p>Opening event…</p>';
      content = await eventUI.event(r.id);
    } else if (r.page === 'person') content = personView(r.id);
    else if (r.page === 'events') content = eventUI.list();
    else if (r.page === 'account') content = account();
    else content = home();
  } catch (error) {
    content = empty('Unable to open this view', error.message, button('reload', 'Try again'));
  }
  if (rev !== renderVersion) return;
  main.innerHTML = content;
  main.setAttribute('aria-busy', 'false');
  updateRows();
  document.title =
    (main.querySelector('h1')?.textContent || 'Workspace') + ' · InterConnected by FounderSquare';
}
async function reload(page, id) {
  const version = ++loadVersion,
    ws = state.ws;
  const data = await ws.load();
  if (version !== loadVersion || ws !== state.ws) return;
  state.data = data;
  if (page) setRoute(page, id);
  await render();
}
function profile(returnEvent) {
  dialog(
    'Edit attendee profile',
    `<p>These details stay private until you share selected fields at an event.</p><div class="form-grid">${infoFields(publicFields, state.data.profile)}</div>`,
    async (fd) => {
      const data = readInfo(fd, publicFields);
      if (returnEvent && !data.name) throw Error('Add a display name to appear in the directory.');
      await state.ws.profile(data);
      await reload();
      notice(returnEvent ? 'Profile saved. Choose “Share my profile” to appear.' : 'Profile saved');
    },
    'Save profile',
  );
}
function meetingFields(e = {}, fixedEvent = null) {
  const allEvents = [
    ...new Set([
      ...state.data.events.map((ev) => ev.title),
      ...state.data.connections.flatMap((c) => c.encounters.map((m) => m.event_name)),
    ]),
  ].filter(Boolean);
  return `${fixedEvent ? `<p>Event · ${esc(fixedEvent.title)}</p>` : field('event_name', 'Event or gathering', e.event_name, 'text', 'list="event-options"') + `<datalist id="event-options">${allEvents.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>`}
    <div class="form-grid">${field('met_on', 'Approximate date', e.met_on, 'date')}${field('place', 'Place', e.place)}</div>
    <label class="check"><input type="checkbox" name="met" ${e.met ? 'checked' : ''}>I met this person</label>`;
}
function readMeeting(fd, id, fixedEvent = null, previous = null) {
  const eventName = fixedEvent?.title || String(fd.get('event_name') || '').trim();
  const matches = state.data.events.filter((e) => e.title === eventName);
  const eventId =
    fixedEvent?.id ||
    (previous?.event_name === eventName ? previous?.event_id : null) ||
    (matches.length === 1 ? matches[0].id : null);
  return {
    id,
    event_name: eventName,
    event_id: eventId,
    met_on: String(fd.get('met_on') || '') || null,
    note: String(fd.get('note') || '').trim(),
    place: String(fd.get('place') || '').trim(),
    met: fd.has('met'),
  };
}
const hasContext = (e) => !!(e.event_name || e.note || e.place || e.met_on || e.met);
function capture(attendee = null, event = null, shared = '') {
  const personId = crypto.randomUUID(),
    meetingId = crypto.randomUUID();
  const form = attendee
    ? `${shared}<p>Save a private copy of this profile. You can add your own note.</p>`
    : field('name', 'Name or description', '', 'text', 'placeholder="e.g. Robotics founder from dinner"');
  dialog(
    attendee ? 'Save ' + attendee.details.name : 'Save someone',
    form +
      field('note', 'Private note', '', 'textarea', 'placeholder="What do you want to remember?"') +
      (attendee
        ? meetingFields({}, event)
        : `<details><summary>Where and when you met</summary><div class="stack">${meetingFields()}</div></details>
      <details><summary>Profile and contact details</summary><div class="form-grid">${infoFields(detailKeys.filter((k) => k !== 'name'))}</div></details>`),
    async (fd) => {
      let details;
      if (attendee) {
        const current = (await state.ws.directory(event.id)).find((row) => row.user_id === attendee.user_id);
        if (!current) throw Error('This profile is no longer shared here.');
        details = { ...current.details };
      } else details = readInfo(fd, detailKeys);
      const m = readMeeting(fd, meetingId, event);
      if (!Object.keys(details).length && !m.note && !m.event_name && !m.place)
        throw Error('Add a name, note, or another detail you remember.');
      await state.ws.capture(
        {
          id: personId,
          details,
          profile_id: attendee?.user_id || null,
          created_at: new Date().toISOString(),
          follow_up: false,
        },
        hasContext(m) ? m : null,
      );
      if (attendee) await reload();
      else {
        query = '';
        filters = {};
        await reload('person', personId);
      }
      notice(state.ws.demo ? 'Connection saved in this browser' : 'Connection saved');
    },
    'Save connection',
  );
}
function editEncounter(p, e) {
  const id = e?.id || crypto.randomUUID();
  dialog(
    e ? 'Edit encounter' : 'Add encounter',
    field('note', 'Private note', e?.note, 'textarea') + meetingFields(e || {}),
    async (fd) => {
      const m = readMeeting(fd, id, null, e);
      if (!hasContext(m)) throw Error('Add something you remember.');
      await state.ws.saveEncounter(p.id, m);
      await reload();
      notice('Encounter saved');
    },
    'Save encounter',
  );
}
function confirmChange(title, copy, label, fn) {
  dialog(title, `<p>${esc(copy)}</p>`, fn, label);
}
function signin() {
  if (!state.client) return;
  dialog(
    'Sign in to InterConnected',
    `<p>We’ll email you a sign-in link. Open it to return to your workspace.</p>${field('email', 'Email address', '', 'email', 'required autocomplete="email"')}`,
    async (fd) => {
      const event = route().page === 'event' && !route().id.startsWith('demo-') ? route().id : '';
      const redirect = new URL(event ? linkTo('event', event) : '/connector', location.origin);
      const { error } = await state.client.auth.signInWithOtp({
        email: fd.get('email'),
        options: { emailRedirectTo: redirect.href },
      });
      if (error) throw Error(error.message);
      notice('Check your email for your sign-in link.');
    },
    'Email sign-in link',
  );
}
async function act(a, id) {
  const p = state.data.connections.find((c) => c.id === route().id);
  switch (a) {
    case 'save-draft': {
      const form = document.querySelector('#follow-up-form');
      form.elements.to.setCustomValidity('');
      if (!form.reportValidity()) break;
      const draft = readDraft(form);
      await state.ws.updatePerson(p.id, { email_draft: draft });
      p.email_draft = draft;
      const local = draftEdits.get(p.id);
      if (local && ['to', 'subject', 'body'].every((k) => local[k] === draft[k])) draftEdits.delete(p.id);
      notice('Draft saved to this connection');
      break;
    }
    case 'copy-draft': {
      const form = document.querySelector('#follow-up-form'),
        draft = readDraft(form);
      try {
        await navigator.clipboard.writeText(draft.body);
        notice('Message copied');
      } catch {
        form.elements.body.select();
        notice('Select Copy to copy your message.');
      }
      break;
    }
    case 'new':
      capture();
      break;
    case 'event-connections':
      query = '';
      filters = { eventKey: 'id:' + route().id };
      filtersOpen = true;
      setRoute('connections');
      await render();
      break;
    case 'filters':
      filtersOpen = !filtersOpen;
      await render();
      main.querySelector('[data-action="filters"]').focus();
      break;
    case 'clear':
      filters = {};
      query = '';
      await render();
      main.querySelector('#people-query')?.focus();
      break;
    case 'follow-list':
    case 'all-list':
      filters.follow = a === 'follow-list';
      await render();
      main.querySelector('[data-action="' + a + '"]').focus();
      break;
    case 'follow':
      await state.ws.updatePerson(p.id, { follow_up: !p.follow_up });
      await reload();
      notice('Follow-up preference saved');
      break;
    case 'edit-person':
      dialog(
        'Edit connection',
        `<div class="form-grid">${infoFields(detailKeys, p.details)}</div>`,
        async (fd) => {
          const details = readInfo(fd, detailKeys);
          if (!Object.keys(details).length && !p.encounters.length) throw Error('Keep at least one detail.');
          await state.ws.updatePerson(p.id, { details });
          await reload();
          notice('Details saved');
        },
        'Save changes',
      );
      break;
    case 'delete-person':
      confirmChange(
        'Delete connection?',
        'This deletes the saved connection and all its private encounters.',
        'Delete connection',
        async () => {
          await state.ws.deletePerson(p.id);
          draftEdits.delete(p.id);
          await reload('connections');
          notice('Connection deleted');
        },
      );
      break;
    case 'add-encounter':
      editEncounter(p);
      break;
    case 'edit-encounter':
      editEncounter(
        p,
        p.encounters.find((e) => e.id === id),
      );
      break;
    case 'delete-encounter':
      confirmChange(
        'Delete encounter?',
        'Only this encounter and its note will be deleted.',
        'Delete encounter',
        async () => {
          await state.ws.deleteEncounter(p.id, id);
          await reload();
          notice('Encounter deleted');
        },
      );
      break;
    case 'edit-profile':
      profile();
      break;
    case 'export': {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              format: 'InterConnected v1',
              exported_at: new Date().toISOString(),
              connections: state.data.connections,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'interconnected-connections.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      break;
    }
    case 'delete-all':
      confirmChange(
        'Delete all saved connections?',
        'Your private connections and encounter history will be permanently deleted. You can export a copy first.',
        'Delete all connections',
        async () => {
          await state.ws.deleteAll();
          draftEdits.clear();
          await reload();
          notice('Saved connections deleted');
        },
      );
      break;
    case 'reset':
      confirmChange(
        'Reset demo?',
        'Replace this browser’s demo changes with the original fictional people and events.',
        'Reset demo',
        async () => {
          state.ws.resetDemo();
          draftEdits.clear();
          await reload('connections');
          notice('Demo reset');
        },
      );
      break;
    case 'signin':
      signin();
      break;
    case 'signout': {
      const { error } = await state.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      break;
    }
    case 'reload':
      await reload();
      break;
    default:
      await eventUI.act(a, id);
  }
}
document.addEventListener('click', async (e) => {
  const link = e.target.closest('a[data-route]');
  if (link && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    const dialogEl = document.querySelector('#dialog');
    if (dialogEl.open) dialogEl.close();
    history.pushState({}, '', link.href);
    await render();
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.dataset.action === 'copy-event' || btn.disabled || !state.data) return;
  if (btn.tagName === 'BUTTON') btn.disabled = true;
  try {
    await act(btn.dataset.action, btn.dataset.id);
  } catch (error) {
    notice(error.message);
  } finally {
    btn.disabled = false;
  }
});
main.addEventListener('submit', (e) => {
  if (e.target.id !== 'follow-up-form') return;
  e.preventDefault();
  const form = e.target,
    to = form.elements.to,
    draft = readDraft(form);
  if (!draft.to) {
    to.setCustomValidity('Add their email address to open this draft in Gmail.');
    to.reportValidity();
    return;
  }
  if (!form.reportValidity()) return;
  window.open(gmailCompose(draft), '_blank', 'noopener,noreferrer');
});
main.addEventListener('input', (e) => {
  const form = e.target.closest('#follow-up-form');
  if (form) {
    form.elements.to.setCustomValidity('');
    draftEdits.set(route().id, readDraft(form));
  }
  if (e.target.id === 'people-query') {
    query = e.target.value;
    updateRows();
  }
  if (e.target.id === 'directory-query')
    document.querySelector('#directory-rows').innerHTML = eventUI.directoryRows(e.target.value);
});
main.addEventListener('change', (e) => {
  const k = e.target.dataset.filter;
  if (k) {
    filters[k] = e.target.value;
    updateRows();
  }
});
window.addEventListener('popstate', () => {
  document.querySelector('#dialog').close();
  render();
});
window.addEventListener('storage', (e) => {
  if (e.key === 'foundersquare.interconnected.demo.v1' && state.ws?.demo)
    reload().catch((err) => notice(err.message));
});
async function useSession(user) {
  const box = document.querySelector('#dialog');
  if (box.open) box.close();
  draftEdits.clear();
  if (mapView) {
    mapView.unmount();
    mapView = null;
  }
  query = '';
  filters = {};
  state.data = null;
  state.ws = new Workspace(state.client, user);
  renderVersion++;
  main.innerHTML = '<p>Opening your workspace…</p>';
  main.setAttribute('aria-busy', 'true');
  try {
    await reload();
  } catch (error) {
    main.innerHTML = empty(
      'Workspace unavailable',
      error.message,
      '<a href="' + esc(location.pathname + location.search) + '">Try again</a>',
    );
    main.setAttribute('aria-busy', 'false');
  }
}
async function start() {
  try {
    state.client = await liveClient();
  } catch (error) {
    serviceIssue = error.message;
    main.innerHTML = empty(
      'Couldn’t reach your workspace',
      serviceIssue,
      '<a class="minor" href="' +
        esc(location.pathname + location.search) +
        '">Try again</a> <button class="text-btn" id="open-demo">Open fictional demo</button>',
    );
    main.setAttribute('aria-busy', 'false');
    document.querySelector('#open-demo').onclick = () => useSession(null);
    return;
  }
  const session = state.client ? (await state.client.auth.getSession()).data.session : null;
  await useSession(session?.user);
  state.client?.auth.onAuthStateChange((event, s) => {
    if ((s?.user?.id || null) !== (state.ws.user?.id || null)) setTimeout(() => useSession(s?.user), 0);
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.ws && !state.ws.demo && !document.querySelector('#dialog').open)
    reload().catch((err) => notice(err.message));
});
start().catch((error) => {
  main.textContent = error.message;
  main.setAttribute('aria-busy', 'false');
});
