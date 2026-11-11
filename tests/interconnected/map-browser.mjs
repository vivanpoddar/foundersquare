import assert from 'node:assert/strict';
import path from 'node:path';
async function checkMapAndDraft(p, ctx, url, pictures) {
  await p.goto(url + '/connector?view=map');
  const pair = p.locator('[data-pair="jonah-vale:maya-serrin"]');
  await pair.waitFor();
  async function pointerOnEdge(locator) {
    const pos = await locator.evaluate((el) => {
      for (const k of [0.48, 0.55, 0.42, 0.62, 0.35, 0.7]) {
        const xy = el.getPointAtLength(el.getTotalLength() * k).matrixTransform(el.getScreenCTM());
        if (document.elementFromPoint(xy.x, xy.y) === el) return { x: xy.x, y: xy.y };
      }
      throw Error('Shared link is obscured by a node or another line.');
    });
    return pos;
  }
  await p.waitForTimeout(250);
  let xy = await pointerOnEdge(pair);
  await p.mouse.move(xy.x, xy.y);
  await p.getByRole('tooltip').getByText('Affiliation · Google', { exact: true }).waitFor();
  if (pictures) await p.screenshot({ path: path.join(pictures, 'network-desktop.png'), fullPage: true });
  await p.mouse.click(xy.x, xy.y);
  await p.mouse.move(5, 5);
  assert.equal(await pair.getAttribute('aria-pressed'), 'true');
  await p.getByLabel('Find people on the map').fill('Google');
  assert.equal(await p.locator('.network-node').count(), 2);
  await p.getByLabel('Link by', { exact: true }).selectOption('affiliation');
  assert.equal(await p.locator('.network-hit').count(), 1);
  await p.getByLabel('Zoom in', { exact: true }).click();
  await p.getByLabel('Reset map view').click();
  const maya = p.getByRole('link', { name: 'Open Maya Serrin', exact: true });
  const orig = await maya.getAttribute('transform'),
    box = await maya.locator('.node-ring').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 16, { steps: 4 });
  await p.mouse.up();
  assert.notEqual(await maya.getAttribute('transform'), orig);
  assert.match(p.url(), /view=map/);
  await maya.focus();
  await p.keyboard.press('Enter');
  const form = p.locator('#follow-up-form');
  await form.waitFor();
  assert.equal(await form.getByLabel('Recipient email').inputValue(), 'maya.serrin@example.com');
  assert.match(await form.getByLabel('Message', { exact: true }).inputValue(), /hiring at Google/);
  if (pictures) await p.screenshot({ path: path.join(pictures, 'hiring-manager-draft.png') });
  const message = 'Hi Maya,\n\nThanks for the conversation about R&D. Is Tuesday good?';
  await form.getByLabel('Subject', { exact: true }).fill('Hiring & R&D');
  await form.getByLabel('Message', { exact: true }).fill(message);
  await form.getByRole('button', { name: 'Save draft' }).click();
  await p.getByText('Draft saved to this connection', { exact: true }).waitFor();
  await p.reload();
  await form.waitFor();
  assert.equal(await form.getByLabel('Message', { exact: true }).inputValue(), message);
  // Intercept the new tab before navigation leaves the local test. Never submit mail.
  const destination = new Promise((resolve) =>
    ctx.route('https://mail.google.com/**', async (route) => {
      resolve(new URL(route.request().url()));
      await route.fulfill({ body: 'Local compose handoff check' });
    }),
  );
  await form.getByRole('button', { name: 'Open in Gmail' }).click();
  const gmail = await destination;
  assert.equal(gmail.searchParams.get('to'), 'maya.serrin@example.com');
  assert.equal(gmail.searchParams.get('su'), 'Hiring & R&D');
  assert.equal(gmail.searchParams.get('body'), message);
  for (const tab of ctx.pages()) if (tab !== p) await tab.close();
  const touch = await ctx
    .browser()
    .newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    const phone = await touch.newPage();
    await phone.goto(url + '/connector?view=map');
    const target = phone.locator('[data-pair="jonah-vale:maya-serrin"]');
    await target.waitFor();
    await phone.waitForTimeout(200);
    const point = await pointerOnEdge(target);
    await phone.touchscreen.tap(point.x, point.y);
    assert.equal(await target.getAttribute('aria-pressed'), 'true');
    await phone.getByRole('tooltip').waitFor();
    if (pictures) await phone.screenshot({ path: path.join(pictures, 'network-phone.png'), fullPage: true });
    const mobileNode = phone.getByRole('link', { name: 'Open Maya Serrin' });
    await mobileNode.locator('.node-ring').tap();
    await phone.getByRole('heading', { name: 'Follow-up email' }).waitFor();
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await touch.close();
  }
  console.log('Passed graph hover, touch, keyboard, drag, filter, and exact Gmail compose handoff.');
}
export { checkMapAndDraft };
