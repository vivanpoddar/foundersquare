import { esc, icon } from './ui.js';
function generatedDraft(person, profile = {}) {
  const d = person.details;
  const name = (d.name || '').trim();
  const first =
    name && !/\b(founder|from|manager|someone|unknown|engineer|designer)\b/i.test(name)
      ? name.split(/\s+/)[0]
      : '';
  const event = [...person.encounters]
    .filter((e) => e.met && e.event_name)
    .sort((a, b) => (b.met_on || '').localeCompare(a.met_on || ''))[0]?.event_name;
  const company = d.affiliation?.trim();
  const role = d.role?.trim() || '';
  const topic = d.interests?.split(/[,;]/)[0].trim();
  const hiring = /\b(hiring|recruit(?:er|ing|ment)|talent acquisition)\b/i.test(role);
  const greeting = first ? `Hi ${first},` : 'Hi there,';
  const intro = event
    ? `It was good meeting you at ${event}.`
    : person.encounters.some((e) => e.met)
      ? 'It was good meeting you.'
      : 'I wanted to reach out.';
  let ask, subject;
  if (hiring) {
    subject = company ? `A question about hiring at ${company}` : 'A question about hiring';
    ask = `I’d love to hear what you look for when hiring${company ? ` at ${company}` : ''}. Is there a role or team you’d recommend I learn more about?`;
  } else {
    subject = event
      ? `Following up after ${event}`
      : company
        ? `A question about your work at ${company}`
        : 'Getting in touch';
    if (topic)
      ask = `I’d love to hear more about your work in ${topic}${company ? ` at ${company}` : ''}. What are you focused on these days?`;
    else if (company)
      ask = `I’d love to learn more about what you’re working on at ${company}. Would you be open to a quick conversation?`;
    else if (role)
      ask = `I’d love to hear more about your work as ${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}. What are you focused on these days?`;
    else ask = 'I’d like to stay in touch. Would you be open to a quick conversation?';
  }
  const signature = profile.name?.trim();
  return {
    to: d.email || '',
    subject,
    body: [greeting, intro + ' ' + ask, signature ? 'Thanks,\n' + signature : 'Thanks!'].join('\n\n'),
  };
}
function gmailCompose(draft) {
  const url = new URL('https://mail.google.com/mail/');
  for (const [key, value] of Object.entries({
    view: 'cm',
    fs: '1',
    to: draft.to.trim(),
    su: draft.subject,
    body: draft.body,
  }))
    url.searchParams.set(key, value);
  return url.href;
}
function draftCard(draft) {
  return `<section class="draft-panel" aria-labelledby="draft-heading"><div class="draft-title">${icon('mail')}<h2 id="draft-heading">Follow-up email</h2></div>
  <form id="follow-up-form"><label class="draft-line"><span>To</span><input type="email" name="to" aria-label="Recipient email" placeholder="Add their email address" autocomplete="off" maxlength="254" value="${esc(draft.to)}"></label>
  <label class="draft-line"><span>Subject</span><input name="subject" type="text" required maxlength="300" value="${esc(draft.subject)}"></label>
  <label class="draft-body"><span class="visually-hidden">Message</span><textarea aria-label="Message" name="body" required maxlength="5000" rows="8">${esc(draft.body)}</textarea></label>
  <div class="draft-footer"><button class="btn" type="submit">Open in Gmail ↗</button><button class="minor" type="button" data-action="save-draft">Save draft</button>
  <button class="text-btn" type="button" data-action="copy-draft">Copy message</button></div></form></section>`;
}
function readDraft(form) {
  const { to, subject, body } = form.elements;
  return { to: to.value.trim(), subject: subject.value, body: body.value };
}
export { generatedDraft, gmailCompose, draftCard, readDraft };
