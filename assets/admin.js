// The team's inbox at /admin: sign in with the shared code, read every sponsor message.
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const login = $('#login'), inbox = $('#inbox'), list = $('#messages'), empty = $('#empty'), meta = $('#inboxMeta'), note = $('#setupNote');
  let messages = [];

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = ts => new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' });

  function render() {
    const showHandled = $('#showHandled').checked;
    const shown = messages.filter(m => showHandled || !m.handled);
    list.innerHTML = shown.map(m => `
      <li class="message${m.handled ? ' handled' : ''}" data-id="${esc(m.id)}">
        <div class="message-head">
          <div><strong>${esc(m.name)}</strong>${m.role ? ` <span class="secondary">· ${esc(m.role)}</span>` : ''}${m.company ? ` <span class="secondary">· ${esc(m.company)}</span>` : ''}</div>
          <time datetime="${new Date(m.ts).toISOString()}">${when(m.ts)}</time>
        </div>
        <div class="message-tags">
          ${m.event ? `<span class="tag">${esc(m.event)}</span>` : ''}
          ${(m.interests && m.interests.length ? m.interests : (m.interest ? [m.interest] : [])).map(i => `<span class="tag">${esc(i)}</span>`).join('')}
          ${m.budget ? `<span class="tag">Budget: ${esc(m.budget)}</span>` : ''}
          ${m.url ? `<a class="tag" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.url.replace(/^https?:\/\//, ''))} ↗</a>` : ''}
        </div>
        ${m.message ? `<p class="message-body">${esc(m.message).replace(/\n/g, '<br>')}</p>` : '<p class="message-body secondary">No message, just the form.</p>'}
        <div class="message-actions">
          <a class="button" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: sponsoring Founder Square')}">Reply to ${esc(m.email)} ↗</a>
          <button class="text-link" type="button" data-handled="${m.handled ? '0' : '1'}">${m.handled ? 'Mark as open' : 'Mark as handled'}</button>
        </div>
      </li>`).join('');
    empty.hidden = shown.length > 0;
    const open = messages.filter(m => !m.handled).length;
    meta.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'} total · ${open} open`;
  }

  async function load() {
    const r = await fetch('/api/admin/messages', { credentials: 'same-origin' });
    if (r.status === 401) { show('login'); return; }
    const data = await r.json();
    if (!data.ok) { note.hidden = false; note.textContent = data.error || 'Could not load messages.'; show('inbox'); return; }
    messages = data.messages;
    note.hidden = data.storage === 'redis' && data.email === 'on';
    note.textContent = [
      data.storage !== 'redis' ? 'Storage is not connected yet, so messages only live in memory until the next deploy.' : '',
      data.email !== 'on' ? 'Email is not connected yet, so new messages are not forwarded to team@foundersquare.org.' : '',
    ].filter(Boolean).join(' ');
    show('inbox'); render();
  }
  function show(which) { login.hidden = which !== 'login'; inbox.hidden = which !== 'inbox'; if (which === 'login') $('#code').focus(); }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const status = $('#loginStatus'); status.textContent = 'Checking…';
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ code: $('#code').value }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.ok) { status.textContent = ''; $('#code').value = ''; load(); }
    else status.textContent = data.error || 'Sign-in failed.';
  });
  $('#logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); messages = []; show('login'); });
  $('#refresh').addEventListener('click', load);
  $('#showHandled').addEventListener('change', render);
  list.addEventListener('click', async e => {
    const b = e.target.closest('[data-handled]'); if (!b) return;
    const id = b.closest('.message').dataset.id, handled = b.dataset.handled === '1';
    b.disabled = true;
    await fetch('/api/admin/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id, handled }) });
    const m = messages.find(x => x.id === id); if (m) m.handled = handled;
    render();
  });
  load();
})();
