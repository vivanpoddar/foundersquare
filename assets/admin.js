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
    note.hidden = data.storage === 'redis' && data.email === 'on' && data.code !== 'default';
    note.textContent = [
      data.code === 'default' ? 'You are signed in with the built-in default code. Set ADMIN_CODE on Vercel to replace it; it must be set before storage is connected.' : '',
      data.storage !== 'redis' ? 'Storage is not connected yet, so messages only live in memory until the next deploy.' : '',
      data.email !== 'on' ? 'Email is not connected yet, so new messages are not forwarded to team@foundersquare.org.' : '',
    ].filter(Boolean).join(' ');
    show('inbox'); render(); loadSubscribers(); loadSubmissions();
  }

  // Build Night submissions: one card per team, filtered by track for each judging panel.
  let submissions = [], trackShown = '';
  const url = s => /^https?:\/\//i.test(s) ? esc(s) : '#';
  function renderSubmissions() {
    const shown = submissions.filter(s => !trackShown || s.track === trackShown);
    const count = t => submissions.filter(s => s.track === t).length;
    $('#subMeta').textContent = `${submissions.length} total · Fo ${count('Best Use of Fo')} · Cognee ${count('Best Use of Cognee')} · Computer Vision ${count('Best Use of Computer Vision')} · Overall only ${count('Best Overall only')}`;
    $('#subsGrid').innerHTML = shown.map(s => `
      <li class="message">
        <div class="message-head">
          <div><strong>${esc(s.project)}</strong> <span class="secondary">· ${esc(s.team)}</span></div>
          <time datetime="${new Date(s.ts).toISOString()}">${when(s.ts)}</time>
        </div>
        <p class="message-body">${esc(s.oneLiner)}</p>
        <div class="message-tags"><span class="tag">${esc(s.track)}</span>${(s.tools || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <p class="secondary">${(s.members || []).map(m => `${esc(m.name)} (${esc(m.email)})`).join(' · ')}</p>
        <div class="message-actions">
          <a class="button" href="${url(s.video)}" target="_blank" rel="noopener">Watch the demo ↗</a>
          <a class="text-link" href="${url(s.link)}" target="_blank" rel="noopener">Project ↗</a>
        </div>
      </li>`).join('');
    $('#subEmpty').hidden = shown.length > 0;
    $('#copyCsv').hidden = submissions.length === 0;
  }
  async function loadSubmissions() {
    const r = await fetch('/api/admin/submissions', { credentials: 'same-origin' });
    const data = await r.json().catch(() => ({}));
    submissions = data.ok ? data.submissions : [];
    renderSubmissions();
  }
  $('#trackFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-track]'); if (!b) return;
    trackShown = b.dataset.track;
    $('#trackFilter').querySelectorAll('[data-track]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderSubmissions();
  });
  $('#copyCsv').addEventListener('click', async e => {
    const b = e.currentTarget, q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['Submitted', 'Team', 'Project', 'Track', 'One-liner', 'Demo video', 'Project link', 'Tools', 'Members']]
      .concat(submissions.map(s => [new Date(s.ts).toISOString(), s.team, s.project, s.track, s.oneLiner, s.video, s.link, (s.tools || []).join('; '), (s.members || []).map(m => `${m.name} <${m.email}>`).join('; ')]));
    try { await navigator.clipboard.writeText(rows.map(r => r.map(q).join(',')).join('\n')); b.textContent = 'Copied'; }
    catch { b.textContent = 'Copy failed'; }
    setTimeout(() => { b.textContent = 'Copy as CSV'; }, 1600);
  });

  // Event email list: everyone who signed up through a "Hear about the next event" form.
  let subscribers = [];
  async function loadSubscribers() {
    const r = await fetch('/api/admin/subscribers', { credentials: 'same-origin' });
    const data = await r.json().catch(() => ({}));
    subscribers = data.ok ? data.subscribers : [];
    $('#subsMeta').textContent = data.ok ? `${subscribers.length} email${subscribers.length === 1 ? '' : 's'}` : (data.error || 'Could not load the email list.');
    $('#subsList').innerHTML = subscribers.map(s => `<li><span>${esc(s.email)}</span><time class="secondary" datetime="${new Date(s.ts).toISOString()}">${when(s.ts)}</time></li>`).join('');
    $('#subsEmpty').hidden = subscribers.length > 0;
    $('#copySubs').hidden = subscribers.length === 0;
  }
  $('#copySubs').addEventListener('click', async e => {
    const b = e.currentTarget, all = subscribers.map(s => s.email).join(', ');
    try { await navigator.clipboard.writeText(all); b.textContent = 'Copied'; }
    catch { b.textContent = 'Select the list below'; }
    setTimeout(() => { b.textContent = 'Copy all emails'; }, 1600);
  });
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
