import { checkMapAndDraft } from './map-browser.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_TEST_MODULE || 'playwright-core');
const pictures = process.env.INTERCONNECTED_SCREENSHOTS;
if (pictures) await mkdir(pictures, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
  p = await ctx.newPage(),
  errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.setDefaultTimeout(6000);
const url = process.env.INTERCONNECTED_TEST_URL || 'http://127.0.0.1:4178',
  click = async (a) => p.locator(`[data-action="${a}"]`).first().click();
const submit = async (label) => {
  await p.locator('dialog').getByRole('button', { name: label, exact: true }).click();
  await p.locator('dialog').waitFor({ state: 'hidden' });
};
async function view(path) {
  await p.goto(url + path);
  await p.locator('main[aria-busy=false]').waitFor();
}
async function check(ok, text) {
  assert.ok(ok, text);
  console.log(text);
}
try {
  await checkMapAndDraft(p, ctx, url, pictures);
  await view('/connector');
  await check((await p.locator('.person-row').count()) === 8, 'Demo opens with eight fictional connections');
  for (const w of [1440, 768, 390, 320]) {
    await p.setViewportSize({ width: w, height: w > 900 ? 940 : 844 });
    await p.waitForTimeout(220);
    if (pictures) await p.screenshot({ path: path.join(pictures, `interconnected-${w}.png`) });
    await check(
      await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'App fits ' + w,
    );
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator('#people-query').fill('designer from build night');
  await check(
    (await p.locator('#people-list').innerText()).includes('Anika Rao'),
    'Search matches private notes and event context',
  );
  await p.locator('#people-query').fill('');
  await click('new');
  await p.getByLabel('Private note').fill('A materials researcher looking for recycled copper.');
  await submit('Save connection');
  await p.getByRole('heading', { name: 'Encounters', exact: true }).waitFor();
  await click('edit-person');
  await p.locator('dialog [name=name]').fill('Copper contact');
  await submit('Save changes');
  await click('add-encounter');
  await p.getByLabel('Event or gathering').fill('Open Studio');
  await p.getByLabel('I met this person').check();
  await p.getByLabel('Private note').fill('Discussed recycled metal again.');
  await submit('Save encounter');
  await check((await p.locator('.note').count()) === 2, 'Repeated encounters preserved');
  await click('follow');
  await p.reload();
  await p.getByRole('button', { name: 'Remove from follow up' }).waitFor();
  await click('edit-encounter');
  await p.getByLabel('Private note').fill('Updated private note');
  await submit('Save encounter');
  await click('delete-person');
  await submit('Delete connection');
  await check(
    (await p.locator('#people-list .person-row').count()) === 8,
    'Create, edit, delete and reload work',
  );
  await view('/connector?event=demo-build');
  await click('qr');
  await p.locator('dialog .qr svg').waitFor();
  await check((await p.locator('dialog .qr svg').count()) === 1, 'QR generated locally');
  await p.locator('dialog .close').click();
  await p.locator('#directory-query').fill('Leila');
  await click('attendee');
  await p.getByLabel('Private note').fill('Ask about education research');
  await submit('Save connection');
  await p.locator('#directory-query').fill('Leila');
  await check(
    (await p.locator('#directory-rows').innerText()).includes('Saved connection'),
    'Saving directory attendee does not mark as met',
  );
  await click('event-connections');
  await check(
    (await p.locator('#people-list').innerText()).includes('Leila Hart'),
    'Event opens its own saved connections',
  );
  await check(
    !(await p.locator('#people-list').innerText()).includes('Theo Park'),
    'Other events are excluded',
  );
  await view('/connector?event=demo-build');
  await click('sharing');
  await p.locator('dialog [value=name]').check();
  await submit('Save visibility');
  await p.locator('#directory-query').fill('Demo attendee');
  await check((await p.locator('#directory-rows .person-row').count()) === 1, 'Opted-in profile appears');
  await click('sharing');
  await p.locator('dialog [value=name]').uncheck();
  await submit('Save visibility');
  await p.locator('#directory-query').fill('Demo attendee');
  await check(
    (await p.locator('#directory-rows .person-row').count()) === 0,
    'Opt-out removes directory profile',
  );
  await view('/connector?view=events');
  await click('new-event');
  await p.getByLabel('Event name').fill('Fictional pilot');
  await p.getByLabel('Event date').fill('2026-11-15');
  await submit('Create event');
  for (let pass = 0; pass < 2; pass++) {
    await click('import');
    await p.locator('dialog select').selectOption('partiful');
    await p.locator('#guest-file').setInputFiles({
      name: 'guests.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Name,RSVP\nSample,Going\nSample,Maybe'),
    });
    await p.getByText('2 registrations', { exact: true }).waitFor();
    await submit('Import registrations');
  }
  await click('rosters');
  await check(
    (await p.locator('dialog li').count()) === 2,
    'Repeated Partiful import replaces roster without merging same-name guests',
  );
  await p.locator('dialog .close').click();
  await view('/connector?view=account');
  const filePromise = p.waitForEvent('download');
  await click('export');
  const file = await filePromise;
  await check(file.suggestedFilename().endsWith('.json'), 'JSON export works');
  await click('reset');
  await submit('Reset demo');
  await check((await p.locator('#people-list .person-row').count()) === 8, 'Demo reset works');
  for (const w of [320, 390, 1440]) {
    await p.setViewportSize({ width: w, height: 900 });
    for (const path of ['/', '/events', '/build-night', '/sponsor', '/admin']) {
      await p.goto(url + path, { waitUntil: 'domcontentloaded' });
      await p.locator('nav[aria-label=Primary] a[href="/connector"]').waitFor();
      const layout = await p
        .locator('.header')
        .evaluate((el) =>
          [...el.querySelectorAll('a')].every((a) => a.getBoundingClientRect().right <= innerWidth + 1),
        );
      await check(layout, 'Primary navigation fits ' + path + ' at ' + w);
      if (path === '/events' || path === '/build-night')
        await check(
          (await p.locator('a[href="https://luma.com/x63yuq1r"]').count()) > 0,
          'Luma registration preserved on ' + path,
        );
      if (path === '/' && pictures) {
        await p.waitForTimeout(1200);
        await p.screenshot({ path: pictures + '/site-' + w + '.png' });
      }
    }
  }
  await check(!errors.length, 'No uncaught browser errors: ' + errors.join(', '));
} finally {
  await browser.close();
}
