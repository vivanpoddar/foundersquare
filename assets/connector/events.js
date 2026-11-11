import {
  esc,
  button,
  linkTo,
  field,
  dateLabel,
  heading,
  addButton,
  empty,
  dialog,
  notice,
  icon,
} from './ui.js';
import { publicFields, labels, safeLink, normalize } from './search.js';
import { parseRoster } from './roster.js';
function eventsUI(ctx) {
  const state = ctx.state;
  let directory = [],
    hostInfo = null;
  function current() {
    return state.data.events.find((e) => e.id === ctx.route().id);
  }
  function list() {
    const events = [...state.data.events].sort((a, b) => b.day.localeCompare(a.day));
    return (
      heading(
        'Events',
        'Open an event to find people who chose to share their profiles.',
        state.data.organizer ? addButton('new-event', 'Create event') : '',
      ) +
      (events.length
        ? `<div class="list">${events
            .map((e) => {
              const d = new Date(e.day + 'T12:00:00');
              return `<a class="event-row" data-route href="${esc(linkTo('event', e.id))}"><span class="event-date"><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString(undefined, { month: 'short' }))}</small></span><span class="row-who"><strong>${esc(e.title)}</strong><small>${esc(e.place)} · ${esc(dateLabel(e.day))}</small></span>${icon('next')}</a>`;
            })
            .join('')}</div>`
        : empty('Your events will appear here', 'Open the event link or scan the QR code your host shares.'))
    );
  }
  function directoryRows(q = '') {
    const rows = directory.filter((p) =>
      normalize(Object.values(p.details).join(' ')).includes(normalize(q.trim())),
    );
    return rows.length
      ? rows
          .map((p) => {
            const saved = state.data.connections.find((c) => c.profile_id === p.user_id);
            const met = saved?.encounters.some((m) => m.met && m.event_id === current()?.id);
            const tags = [
              p.details.role,
              p.details.affiliation,
              met ? 'Marked as met here' : saved ? 'Saved connection' : 'Event directory',
            ].filter(Boolean);
            return `<button type="button" class="person-row" data-action="attendee" data-id="${esc(p.user_id)}"><span class="row-who"><strong>${esc(p.details.name)}</strong><small>${esc(tags.join(' · '))}</small></span>${icon('next')}</button>`;
          })
          .join('')
      : empty(
          q ? 'No matching attendees' : 'No shared profiles yet',
          q
            ? 'Try another name, role, or interest.'
            : 'Approved members can choose which details to show here.',
        );
  }
  function manage(e) {
    const { requests, rosters } = hostInfo;
    const counts = rosters
      .map(
        (r) =>
          `<p>${esc(r.source === 'luma' ? 'Luma' : 'Partiful')} · ${r.guests.length} registrations · updated ${esc(dateLabel(r.updated_at))}</p>`,
      )
      .join('');
    return `<section class="section panel"><h2>Host tools</h2><p>Check registrations before approving access.</p><div class="actions">
      ${button('edit-event', 'Event settings')}${button('import', 'Import guest CSV')}${button('rosters', 'View registrations')}
      ${!state.ws.demo ? button('luma', 'Refresh from Luma') : ''}</div>${counts}
      <div class="section"><h3>Directory access</h3>${
        requests.length
          ? requests
              .map((m) => {
                if (m.user_id === state.ws.uid)
                  return '<div class="note"><strong>Event host</strong><p>' + esc(m.email) + '</p></div>';
                const match = rosters.flatMap((r) =>
                  r.guests
                    .filter((g) => g.email && m.email && normalize(g.email) === normalize(m.email))
                    .map((g) => r.source + ' · ' + g.status),
                );
                return `<div class="note"><strong>${esc(m.email || 'Demo member')}</strong><p>${esc(m.status)}${match.length ? ' · ' + esc(match.join(', ')) : ''}</p><div class="actions">
        ${m.status !== 'approved' ? button('approve', 'Approve', 'minor', m.user_id) : ''}${m.status !== 'removed' ? button('remove', 'Remove access', 'text-btn', m.user_id) : ''}</div></div>`;
              })
              .join('')
          : '<p>No access requests yet.</p>'
      }</div></section>`;
  }
  async function event(id) {
    const e = state.data.events.find((x) => x.id === id),
      member = state.data.members.find((m) => m.event_id === id);
    const back = `<a class="back-link" data-route href="${linkTo('events')}">← Events</a>`;
    if (!e)
      return (
        back +
        heading('Event access') +
        empty(
          'Open this event',
          state.ws.demo
            ? 'Sign in with your attendee account to open a live event.'
            : 'Request access and your host will review it.',
          state.ws.demo
            ? state.client
              ? button('signin', 'Sign in', 'btn')
              : '<p>Live accounts are unavailable in this preview.</p>'
            : button('request', 'Request access', 'btn'),
        )
      );
    const host = e.host_id === state.ws.uid,
      allowed = host || member?.status === 'approved';
    const top =
      back +
      heading(e.title, [dateLabel(e.day), e.place].filter(Boolean).join(' · '), button('qr', 'Share event'));
    const links = [
      ['luma_url', 'Luma'],
      ['partiful_url', 'Partiful'],
    ]
      .filter(([k]) => safeLink(k, e[k]))
      .map(
        ([k, label]) =>
          `<a class="text-btn" target="_blank" rel="noopener noreferrer" href="${esc(safeLink(k, e[k]))}">Registration on ${label} ↗</a>`,
      )
      .join('');
    if (!allowed)
      return (
        top +
        links +
        empty(
          'Access requested',
          'Your host will review your request. Refresh here after approval.',
          button('reload', 'Refresh'),
        )
      );
    const [members, hostData] = await Promise.all([
      state.ws.directory(id),
      host ? state.ws.hostData(id) : null,
    ]);
    if (ctx.route().id !== id) return '';
    directory = members;
    hostInfo = hostData;
    return (
      top +
      links +
      button('event-connections', 'My connections from this event', 'text-btn') +
      `<section class="section"><div class="section-head"><h2>Attendee directory</h2>${member?.status === 'approved' ? button('sharing', member.shared.includes('name') ? 'Sharing settings' : 'Share my profile') : ''}</div>
      <label class="searchline">${icon('search')}<input id="directory-query" type="search" aria-label="Search attendees" placeholder="Search attendees"></label>
      <div class="list section" id="directory-rows">${directoryRows()}</div></section>` +
      (host ? manage(e) : '')
    );
  }
  function editEvent(e = {}) {
    const id = e.id || crypto.randomUUID();
    const editing = !!e.id;
    dialog(
      editing ? 'Event settings' : 'Create event',
      field('title', 'Event name', e.title, 'text', 'required maxlength="160"') +
        `<div class="form-grid">${field('day', 'Event date', e.day, 'date', 'required')}${field('place', 'Place', e.place)}</div>` +
        field('luma_url', 'Luma registration link', e.luma_url, 'url') +
        field('partiful_url', 'Partiful invitation link', e.partiful_url, 'url') +
        field('luma_id', 'Luma event API ID (optional)', e.luma_id, 'text', 'placeholder="evt-…"') +
        (state.ws.demo
          ? '<p class="muted">Events created here are fictional and stay in this browser.</p>'
          : ''),
      async (fd) => {
        const record = { id };
        for (const key of ['title', 'day', 'place', 'luma_url', 'partiful_url', 'luma_id'])
          record[key] = String(fd.get(key) || '').trim();
        if (!record.title) throw Error('Give the event a name.');
        for (const key of ['luma_url', 'partiful_url'])
          if (record[key] && !safeLink(key, record[key]))
            throw Error('Use an http or https registration link.');
        if (record.luma_id && !/^evt-[\w-]+$/.test(record.luma_id))
          throw Error('Luma event IDs start with evt-.');
        await state.ws.saveEvent(record, editing);
        await ctx.reload('event', id);
        notice(editing ? 'Event updated' : 'Event created');
      },
      editing ? 'Save changes' : 'Create event',
    );
  }
  function importDialog(e) {
    let guests = null;
    const box = dialog(
      'Import registrations',
      `<p>Choose a host-exported CSV. Import replaces the previous list for this source. Attendees choose their own directory visibility.</p>
      <label class="form-field">Source<select name="source"><option value="luma">Luma</option><option value="partiful">Partiful</option></select></label>
      <label class="form-field">Guest CSV<input id="guest-file" type="file" accept=".csv,text/csv" required></label><div id="preview" aria-live="polite"></div>`,
      async (fd) => {
        if (!guests) throw Error('Choose and review a valid CSV first.');
        await state.ws.importRoster(e.id, fd.get('source'), guests);
        await ctx.reload();
        notice('Registrations imported');
      },
      'Import registrations',
    );
    const input = box.querySelector('#guest-file'),
      preview = box.querySelector('#preview');
    input.onchange = async () => {
      guests = null;
      const file = input.files[0];
      preview.textContent = '';
      if (!file) return;
      try {
        if (file.size > 4_000_000) throw Error('Choose a file under 4 MB.');
        const rows = parseRoster(await file.text());
        if (input.files[0] !== file) return;
        guests = rows;
        preview.innerHTML = `<strong>${rows.length} registrations</strong><ul>${rows
          .slice(0, 5)
          .map((g) => `<li>${esc(g.name || g.email)} · ${esc(g.status)}</li>`)
          .join('')}</ul>`;
      } catch (error) {
        preview.textContent = error.message;
      }
    };
  }
  async function act(action, id) {
    const e = current();
    switch (action) {
      case 'new-event':
        editEvent();
        break;
      case 'edit-event':
        editEvent(e);
        break;
      case 'request':
        await state.ws.request(ctx.route().id);
        await ctx.reload();
        notice('Access requested');
        break;
      case 'qr': {
        const url = new URL(linkTo('event', e.id), location.origin).href;
        const { qrcode } = await import('./vendor/qrcode.js');
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        const el = dialog(
          'Share event',
          `<div class="qr">${qr.createSvgTag({ scalable: true })}</div><p>${state.ws.demo ? 'This link opens a fictional demo event.' : 'Scan to open this event and request directory access.'}</p>${field('eventlink', 'Event link', url, 'url', 'readonly')}${button('copy-event', 'Copy link')}`,
        );
        el.querySelector('[data-action="copy-event"]').onclick = async () => {
          try {
            await navigator.clipboard.writeText(url);
            notice('Event link copied');
          } catch {
            el.querySelector('input').select();
          }
        };
        break;
      }
      case 'sharing': {
        const member = state.data.members.find((m) => m.event_id === e.id);
        if (!state.data.profile.name) {
          ctx.profile(e.id);
          break;
        }
        const available = publicFields.filter((k) => state.data.profile[k]);
        dialog(
          'Directory visibility',
          `<p>Choose what members of ${esc(e.title)} can see. Sharing your name makes your profile visible. Clear it to withdraw.</p>${available.map((k) => `<label class="check"><input type="checkbox" name="shared" value="${k}" ${member.shared.includes(k) ? 'checked' : ''}>${esc(labels[k])} · ${esc(state.data.profile[k])}</label>`).join('')}`,
          async (fd) => {
            const chosen = fd.getAll('shared');
            await state.ws.share(e.id, chosen.includes('name') ? chosen : []);
            await ctx.reload();
            notice('Visibility updated');
          },
          'Save visibility',
        );
        break;
      }
      case 'attendee': {
        const latest = state.ws.demo ? directory : await state.ws.directory(current().id);
        const p = latest.find((r) => r.user_id === id);
        if (!p) {
          await ctx.reload();
          throw Error('This profile is no longer shared here.');
        }
        const saved = state.data.connections.find((c) => c.profile_id === id);
        const content = `<dl class="facts">${Object.entries(p.details)
          .filter(([k]) => k !== 'name')
          .map(([k, v]) => `<dt>${esc(labels[k])}</dt><dd>${esc(v)}</dd>`)
          .join('')}</dl>`;
        if (saved) {
          const el = dialog(
            p.details.name,
            content +
              `<a class="btn" href="${esc(linkTo('person', saved.id))}" data-route>Open saved connection</a>`,
          );
          return true;
        }
        if (p.user_id === state.ws.uid) {
          dialog(p.details.name, content);
          return true;
        }
        ctx.capture(p, e, content);
        break;
      }
      case 'import':
        importDialog(e);
        break;
      case 'rosters':
        dialog(
          'Imported registrations',
          hostInfo.rosters.length
            ? hostInfo.rosters
                .map(
                  (r) =>
                    `<div><h3>${esc(r.source === 'luma' ? 'Luma' : 'Partiful')}</h3><ul class="registers">${r.guests.map((g) => `<li>${esc([g.name, g.email, g.status].filter(Boolean).join(' · '))}</li>`).join('')}</ul></div>`,
                )
                .join('')
            : '<p>No registrations imported yet.</p>',
        );
        break;
      case 'luma': {
        const count = await state.ws.refreshLuma(e.id);
        await ctx.reload();
        notice(count + ' Luma registrations refreshed');
        break;
      }
      case 'approve':
      case 'remove': {
        const m = hostInfo.requests.find((x) => x.user_id === id);
        dialog(
          action === 'approve' ? 'Approve access?' : 'Remove access?',
          `<p>${esc(m.email)} ${action === 'approve' ? 'will be able to view opted-in attendees.' : 'will lose directory access and their shared profile will be withdrawn.'}</p>`,
          async () => {
            await state.ws.decide(e.id, id, action === 'approve' ? 'approved' : 'removed');
            await ctx.reload();
            notice('Directory access updated');
          },
          action === 'approve' ? 'Approve' : 'Remove',
        );
        break;
      }
      default:
        return false;
    }
    return true;
  }
  return { list, event, act, directoryRows };
}
export { eventsUI };
