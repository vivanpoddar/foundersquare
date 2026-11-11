import { labels, safeLink, titleOf } from './search.js';
const paths = {
  map: 'M5 7a2 2 0 1 0 .01 0 M19 4a2 2 0 1 0 .01 0 M15 17a2 2 0 1 0 .01 0 M7 8l10-3 M6 10l7 7 M18 8l-2 8',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  people: 'M3 5h15a2 2 0 0 1 2 2v14H5a2 2 0 0 1-2-2z M6 3v4 M9 15c1-3 5-3 6 0 M12 9a1.5 1.5 0 1 0 .1 0',
  events: 'M3 6h18v15H3z M7 3v6 M17 3v6 M3 11h18',
  profile: 'M12 4a4 4 0 1 0 .01 0 M4 21c0-8 16-8 16 0',
  search: 'M10 3a7 7 0 1 0 .01 0 M15.5 15.5l5 5',
  filters: 'M3 7h8 M15 7h6 M3 17h3 M10 17h11 M12 4v6 M8 14v6',
  plus: 'M12 5v14 M5 12h14',
  next: 'm9 6 6 6-6 6',
  back: 'm14 6-6 6 6 6',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
};
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || ''}"/></svg>`;
}
function esc(v) {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
function button(action, label, kind = 'minor', id = '') {
  return `<button type="button" class="${kind}" data-action="${esc(action)}" data-id="${esc(id)}">${esc(label)}</button>`;
}
function linkTo(page, id = '') {
  const q = new URLSearchParams();
  if (page !== 'connections') q.set('view', page);
  if (id) {
    if (page === 'event') {
      q.delete('view');
      q.set('event', id);
    } else q.set('id', id);
  }
  return '/connector' + (q.size ? '?' + q : '');
}
function field(key, label, value = '', type = 'text', extra = '') {
  const id = 'f-' + key;
  const input =
    type === 'textarea'
      ? `<textarea rows="3" maxlength="4000" name="${esc(key)}" id="${id}" ${extra}>${esc(value)}</textarea>`
      : `<input type="${type}" value="${esc(value)}" name="${esc(key)}" id="${id}" maxlength="1000" ${extra}>`;
  return `<label class="form-field" for="${id}">${esc(label)}${input}</label>`;
}
function infoFields(keys, d = {}) {
  return keys
    .map((k) =>
      field(
        k,
        labels[k],
        d[k] || '',
        k === 'email'
          ? 'email'
          : k === 'phone'
            ? 'tel'
            : ['website', 'linkedin', 'instagram'].includes(k)
              ? 'url'
              : 'text',
      ),
    )
    .join('');
}
function readInfo(fd, keys) {
  const d = {};
  for (const k of keys) {
    const v = String(fd.get(k) || '').trim();
    if (v) {
      if (['website', 'linkedin', 'instagram', 'email', 'phone'].includes(k) && !safeLink(k, v))
        throw Error('Check the ' + labels[k] + ' field.');
      d[k] = v;
    }
  }
  return d;
}
function dateLabel(day) {
  if (!day) return '';
  const date = new Date(day.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(date.valueOf())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function avatar(p) {
  const name = titleOf(p);
  const initials = p.details.name
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((t) => [...t][0])
        .join('')
        .toUpperCase()
    : '?';
  const hue = [...name].reduce((n, c) => n + c.codePointAt(0), 0) % 5;
  return `<span aria-hidden="true" class="avatar tone${hue}">${esc(initials)}</span>`;
}
function heading(title, sub = '', action = '') {
  return `<header class="heading"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${action}</header>`;
}
function addButton(action, label) {
  return `<button class="btn" type="button" data-action="${action}">${icon('plus')}${esc(label)}</button>`;
}
function empty(title, copy, action = '') {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;
}
function options(values, selected, all = 'All') {
  return (
    `<option value="">${esc(all)}</option>` +
    [...new Set(values.filter(Boolean))]
      .sort()
      .map((v) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`)
      .join('')
  );
}
function dialog(title, content, submit, save = 'Save') {
  const el = document.querySelector('#dialog');
  document.querySelector('#dialog-body').innerHTML =
    `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="close" aria-label="Close">×</button></div>
      <form class="stack">${content}<p role="alert" class="error"></p>${submit ? `<div class="actions end"><button type="button" class="minor cancel">Cancel</button><button type="submit" class="btn">${esc(save)}</button></div>` : ''}</form>`;
  el.querySelector('.close').onclick = () => el.close();
  const cancel = el.querySelector('.cancel');
  if (cancel) cancel.onclick = () => el.close();
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    if (!submit) return;
    const form = e.currentTarget,
      btn = form.querySelector('[type=submit]'),
      err = form.querySelector('.error');
    if (btn.disabled) return;
    btn.disabled = true;
    err.textContent = '';
    try {
      await submit(new FormData(form), form);
      if (el.open) el.close();
    } catch (error) {
      err.textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  };
  if (!el.open) el.showModal();
  return el;
}
let timer;
function notice(msg) {
  clearTimeout(timer);
  const el = document.querySelector('#notice');
  el.textContent = msg;
  timer = setTimeout(() => {
    el.textContent = '';
  }, 5000);
}
export {
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
};
