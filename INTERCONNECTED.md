# InterConnected by FounderSquare

InterConnected runs at `/connector` in the existing static site. The search screen, event links and private connection details all use the same extensionless route. The public pages still use their existing registration links.

## Try it locally

From this worktree, run `node scripts/dev.js 4178` and open [the local workspace](http://localhost:4178/connector). Node 22 or later is recommended. There is no frontend build or dependency installation for the app.

The credential-free demo contains fictional people and events, dated relative to the first visit. Try **designer from build night**, **Ainka**, or **people I met last month**. Open a person to see their encounters, or visit **Events → Bay Build Night** to try the opt-in directory. Create a fictional event to exercise the host tools. Under **My profile**, you can export connections, delete them or reset the demo. Demo edits stay in that browser and are never transferred into an account.

## Set up live accounts

1. Create a Supabase project. Run [the database migration](supabase/migrations/202611110001_interconnected.sql) once in its SQL editor, then apply [the private email draft migration](supabase/migrations/202611110002_connection_drafts.sql). If the base schema is already installed, only the draft migration is needed.
2. Enable email sign-in in Supabase Auth. Configure the Site URL and allow the exact InterConnected callback for each environment, including event links with a query string. For this preview use `http://localhost:4178/connector**`; use the equivalent path on your real site. Keep the magic-link template. Configure a production SMTP sender and verify delivery to an outside attendee before a pilot.
3. Set `INTERCONNECTED_SUPABASE_URL` and `INTERCONNECTED_SUPABASE_PUBLISHABLE_KEY` from the project. Use a publishable key or legacy anon key. The app works through the attendee’s authenticated database session and does not need a service-role key. For local work, copy `.env.example` to the ignored `.env.local`, fill in the values and run `node --env-file=.env.local scripts/dev.js 4178`. For a future Vercel rollout, use the project’s environment settings.
4. Sign in with the organizer’s email and get their user UUID from the Supabase Auth Users screen. Give that account permission to create events by running the following SQL in the project SQL editor, substituting the verified UUID. Additional organizers can be added the same way.

```sql
insert into public.ic_organizers (user_id)
values ('REPLACE_WITH_ORGANIZER_UUID'::uuid)
on conflict do nothing;
```

Only the creator manages a given event’s registrations and access requests. The existing website admin inbox and its shared login serve a separate purpose. Members control their own profiles, and other attendees and hosts have no database access to private notes or saved connections.

## Connect an event

In **Events → Create event**, enter confirmed details and the invitation links. For Agent’s After Dark, copy the current date and place from the FounderSquare event page and the registration URL from the site. The repository currently configures [this Luma registration](https://luma.com/x63yuq1r). Add the Partiful link when a host supplies it.

- **Luma API.** Set the server-only `INTERCONNECTED_LUMA_KEY` for the FounderSquare Luma Plus calendar and enter the event’s API ID (`evt-…`) under **Event settings**. A public invitation slug is different from the API ID. Use **Refresh from Luma** to replace that event’s Luma registration snapshot. The server checks host access, reads all result pages and saves the replacement only after the full fetch succeeds. [Luma API guide](https://help.luma.com/p/luma-api)
- **Luma or Partiful CSV.** Export the guest list from the host dashboard. In **Import guest CSV**, choose the source and file, review the preview and confirm. The import retains names, emails when present, and RSVP status. Reimport replaces that source’s snapshot for that event. It never merges accounts by name. Partiful names can be incomplete and exported columns vary. [Luma guest export](https://help.luma.com/p/download-guest-csv) · [Partiful guest export](https://help.partiful.com/en-us/articles/15525376-how-can-i-export-my-guest-list)
- **Manual events.** A host can create an event and review access requests without either service. All three paths support the same private save, search and follow-up workflow.

The pilot supports up to 4,000 registration rows per source per event. A refresh is host-initiated. A registration, a checked-in guest, a published directory profile, a privately saved connection and a marked encounter describe different things. Importing a list does not publish profiles or grant access. If a registration changes, the host reviews the roster and explicitly removes access where appropriate.

## First-event checklist

- [ ] Use two attendee accounts and the organizer account. Verify email delivery, then sign in as the same attendee on a second device and confirm a private test note appears.
- [ ] Create the event, add the confirmed registration links and preview an export or refresh Luma. Compare the imported count and a few RSVP statuses against the host dashboard.
- [ ] Open **Share event**. Display or print its QR code using the real attendee-facing origin. Scan with a phone and request access.
- [ ] In **Host tools**, compare the request email with the registration. Confirm an ambiguous or name-only entry with the person before approving it.
- [ ] Have one attendee fill in **My profile** and select fields under **Share my profile** for that event. Check with the second attendee that only those fields appear. Withdraw visibility and refresh the directory on the second device.
- [ ] Save a directory attendee, add a private note and mark a meeting only if it happened. Confirm that searching the note works for its author. Verify that the other attendee cannot see it.
- [ ] Afterward, try **Follow up**, inspect an export, and delete the test records. Removing directory visibility stops future directory reads. Copies another person explicitly saved as their own connection remain private to them.

## Checks and dependencies

- Run `node --test tests/interconnected/core.test.mjs` for search, dates, imports, link validation and Luma pagination.
- The database isolation test runs the actual migration in disposable PostgreSQL via PGlite, with local stand-ins for Supabase’s verified identity functions. To keep test dependencies outside the website, install PGlite in a temporary folder and point the test to its entry module.

```sh
testdir="$(mktemp -d)"
npm install --prefix "$testdir" @electric-sql/pglite@0.5.16
PGLITE_TEST_MODULE="$testdir/node_modules/@electric-sql/pglite/dist/index.js" node --test tests/interconnected/access.test.mjs
```

- With the demo server running, the optional Chrome smoke test covers the attendee flow, organizer CSV import, direct event links, directory opt-out, export, reset, and the original website navigation. Use the same temporary directory to install Playwright Core and run the test against a fresh browser context.

```sh
npm install --prefix "$testdir" playwright-core
PLAYWRIGHT_TEST_MODULE="$testdir/node_modules/playwright-core/index.mjs" node tests/interconnected/browser.mjs
```

The application uses self-hosted `@supabase/supabase-js` 2.119.0 (official browser distribution) and `qrcode-generator` 2.0.4 (ES module). Both are MIT licensed and are in `assets/connector/vendor/`. Only the live account flow loads the Supabase SDK. QR codes are generated locally. Search uses deterministic matching across user-owned data, including one-edit spelling tolerance, a small topic vocabulary and the user’s local month boundaries. No external AI service receives search queries or notes.

## Map and follow-up drafts

Open **Map** to explore shared affiliations, event context, interests and private tags among your saved people. Hover, focus or tap a line for the stored reasons. Drag people or the background to rearrange the view. Search or use the page controls on larger networks. Page counts and lines describe the contacts currently shown. A shared employer or event does not establish that two people know each other.

Open any person for an editable email suggestion. Suggestions are composed in the browser from saved profile fields and explicitly marked meetings. Private conversation notes are excluded from the generated message. **Save draft** keeps your edits with the private connection across devices (in demo mode, in this browser). **Open in Gmail** transfers the current recipient, subject and message to Gmail’s compose screen. The user sends from Gmail. The app requires no Gmail OAuth token or external AI key.

The map uses self-hosted React and D3 Force, loaded on demand. Its checked-in browser bundle lets the site run as before. To change the component, run `npm ci` and `npm run build` from `components/connection-map`. Runtime licenses are collected in `assets/connector/vendor/MAP-LICENSES.txt`.
