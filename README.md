# Founder Square

Static website for Founder Square, a student-run UC Berkeley builder community. Four HTML pages share `assets/site.css` and `assets/site.js`; no build step is required.

- `/`: community homepage, waterfront photograph, upcoming event, About, registration banner.
- `/events`: Agent's After Dark Build Night on Monday, November 16, 2026, 4–9 PM, Chou Hall N100 at Berkeley Haas. Future events are announced only when confirmed.
- `/build-night`: event details, prizes, registration on Luma (email as fallback), FAQ.
- `/sponsor`: "Sponsor us". A contact form that goes to the team (see below), plus the plain email link.
- `/sponsors`: the sponsors and partners of the current event, with a line and a link each. Logos can be added per card.
- `/admin`: team sign-in with the shared code; shows every message sent through the contact form, with reply and "mark handled".

Vercel's `cleanUrls` configuration serves the HTML pages without file extensions.

## Design

The site uses the Founder Square logo exactly as designed: the red mark with "founder square" in Plus Jakarta Sans ExtraBold, outlined in `brand/logos/logo-red.svg`. Its red, `#e42425`, is the only red on the site: logo, buttons, bands and focus rings. Headings are serif on white and pale red surfaces.

The homepage photograph is Francisco Delgado's “Sunrise by the Ferry Building,” used under the [Unsplash License](https://unsplash.com/photos/HdtcZUI3Qvk). Its credit appears in the footer. It depicts San Francisco Bay, not the event venue. Other SF photo galleries have been removed.

## Contact line and admin inbox

The sponsor form on `/sponsor` posts to `api/contact.js`, a Vercel function that stores the message and emails it to `team@foundersquare.org`. The team reads the history at `/admin` after signing in with the shared code (`api/admin/*.js`). Nothing here needs a build step; the `api/` folder is picked up by Vercel as Node functions.

Set these in the Vercel project (Settings → Environment Variables), then redeploy:

| Variable | What it is |
| --- | --- |
| `ADMIN_CODE` | The code the team types at `/admin`. Long and random; everyone shares it. |
| `SESSION_SECRET` | Optional second random string that signs the 30-day admin cookie. Defaults to `ADMIN_CODE`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | From **Storage → Create → Upstash for Redis** on the Vercel project; the integration adds both automatically. Messages are kept in a Redis list. |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) after adding `foundersquare.org` as a verified domain (three DNS records). Sends each message to the team inbox with the sponsor as reply-to. |
| `MAIL_TO`, `MAIL_FROM` | Optional. Default `team@foundersquare.org` and `Founder Square <team@foundersquare.org>`. |

Until the store is connected, messages are kept in memory (lost on redeploy) and the admin page says so; until Resend is connected, nothing is emailed and the form still works. If both are missing the form falls back to opening an email draft. `.env.example` lists the same variables for local work.

## Links

Every outside link (Luma event, Partiful event, Luma calendar, Instagram, X, LinkedIn) lives in `LINKS` at the top of `assets/site.js`. Buttons whose URL is empty stay hidden and the email fallbacks show instead. Registration buttons on `/build-night`, `/events` and the home page point at Luma and Partiful once those two URLs are filled in.

All email links use `team@foundersquare.org`, including the footer copy-address buttons.

## Details still to announce

- A run-of-show schedule
- Future event dates
- The Luma, Partiful and social URLs in `LINKS`
- Sponsor logos on `/sponsors`

## Future work

- A Team page with the people behind Founder Square.
- Logos on the sponsors page once the files are collected.

## Local preview

Use a static server that resolves extensionless HTML routes, or open the `.html` paths directly with Python's server:

```sh
ADMIN_CODE=anything node scripts/dev.js 4175
```

That serves the pages with clean URLs and mounts the `api/` functions the way Vercel does, with messages kept in memory. `python3 -m http.server` still works for the static pages alone.

Production deploys from `main` through Vercel. Pull request branches may receive Vercel preview deployments.

The brand system (logo files, tokens, identity, language, motion and imagery guides, component guidelines) is in `brand/`; live previews are in the [Founder Square design system](https://claude.ai/artifact/1Tdh7sFEqkBQz2f3n5RFuE). Site styles are in `assets/site.css`. Local `.taste-skill/` inspection reports are ignored by Git.
