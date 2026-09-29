# Laneway Bank: a mocked retail bank for an Amplitude + Braze demo

A static, fully mocked retail bank website, built to demonstrate Amplitude
and Braze working together on a home loan application: rate comparison,
calculators, a five-step application that saves as you go, an instant
conditional decision, and document upload. The branding carries over from
the Laneway teaching store (the wordmark, Inter, black and white).

Laneway Bank is not a real financial institution. The rates, products and
credit decisions are invented, and nothing leaves the browser except the
calls to Amplitude and Braze.

There is no server. The application in progress, submitted applications, the
customer and browsing history live in `localStorage`; the session id is a
cookie. Everything in `docs/` is plain HTML, CSS, JS and
images, so GitHub Pages can serve it with no build step.

The site is public, with no password. Every page carries
`noindex, nofollow`, so search engines won't list a site that looks like a
bank.

## What's in it

| | |
|---|---|
| Products | 13: seven home loans, two everyday accounts, two savings products, two credit cards |
| Pages | Home, 4 category pages, 13 product pages, borrowing power and repayments calculators, the application, the application outcome, internet banking, talk to a lender, about, 404 |
| Working | Filter and sort home loans, both calculators, the application with save and resume, instant decision, document checklist, internet banking sign-in with persona accounts, live search, recommendations, recently viewed, rate update sign-up, lender callback form |
| Landing page | `/landing/`: a Package Home Loan page for paid traffic, with an offset savings calculator. Pass UTM parameters and they follow the visitor into the application. |
| Instrumented | Amplitude Browser SDK 2 + Session Replay, Braze Web SDK, and an on-page event stream showing every call. See [TRACKING.md](TRACKING.md). |

## Run it locally

```bash
python3 -m http.server 8000 --directory docs
```

Then open <http://localhost:8000>. Any static file server works; it must be
served over HTTP rather than opened as a `file://` path, or the SDKs won't load.

## Before you demo: add your keys

Both keys are client-side keys designed to sit in public page source, so
committing them is normal. Edit `src/assets/js/config.js`, then run
`node build.mjs` to copy it into `docs/`:

```js
AMPLITUDE_API_KEY: 'YOUR_AMPLITUDE_API_KEY',   // Amplitude → Settings → Projects → API Key
BRAZE_API_KEY: 'YOUR_BRAZE_API_KEY',           // Braze → App Settings → Identification → API Key
BRAZE_SDK_ENDPOINT: 'sdk.iad-01.braze.com',    // Braze → App Settings → SDK Endpoint (region-specific)
```

Set `AMPLITUDE_SERVER_ZONE: 'EU'` for an EU Amplitude project.

Until you fill these in the site runs in **dry-run mode**: every Amplitude and
Braze call still appears in the event stream, flagged `NOT SENT`. That is the
mode to rehearse in, so you don't fill a project with demo traffic.

The build regenerates `docs/` from scratch. If `docs/assets/js/config.js` has
been edited directly, the build stops rather than overwrite it; copy the
change into `src/` and rebuild, or pass `--force` to discard it.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. **Settings → Pages → Source:** *Deploy from a branch*.
3. **Branch:** `main`, **folder:** `/docs`. Save.

The site appears at `https://<user>.github.io/<repo>/` within a minute or two.
Every link and asset path in `docs/` is relative, so it works at a repo
subpath, at a domain root, or behind a custom domain with no changes.
`docs/.nojekyll` stops Pages running the output through Jekyll.

## The event stream

Bottom right, or press `` ` ``. Three tabs:

- **Stream**: every Amplitude and Braze call in order, with its full payload,
  colour-coded by destination, filterable. Calls held back by a placeholder key
  say so.
- **Controls**: switch between three personas (a first home buyer, a
  customer refinancing from another bank, an investor with an existing
  Laneway home loan), seed an application stopped at step 3 or discard the
  one in progress, wipe all local state.
- **State**: the current identity on both sides, including the ids that bridge
  them.

Turn the whole thing off with `SHOW_DEV_DRAWER: false` for a clean site.

## How the two tools connect

`src/assets/js/tracking.js` is the only place either SDK is touched. One
`track()` call fans out to both, so events can't drift apart.

**Product detail** travels as flat `product_*` properties on every event
about one product, and as `product_ids` on events about a list. Income and
property value go as bands (`$50k–$100k`); the loan amount and borrowing
power go exactly, because a campaign quotes them back.

**Amplitude → Braze.** On-site behaviour becomes Braze custom attributes and
custom events, so Braze can segment and message on it: `application_status`,
`application_step`, `loan_purpose`, `borrowing_power`,
`documents_outstanding`. Finishing an application step updates both tools in
the same breath, which is what an abandoned application campaign needs.

**Braze → Amplitude.** In-app messages and content cards log Amplitude events
when they're shown, clicked and dismissed, so campaign exposure lands in the
same funnels as everything else and lift is measurable.

**Identity.** Braze's external id and Amplitude's user id are the same (the
email), and Amplitude uses Braze's device id. That's what Braze Currents needs
to land Braze events, such as content card clicks, on the right Amplitude user,
signed in or anonymous. The drawer's State tab shows both sets of ids and
whether they match.

See [TRACKING.md](TRACKING.md) for the full event and property list.

## Web push

Signing up for rate updates in the footer asks for notification permission
(`WEB_PUSH_ON_RATE_UPDATES` in config). Braze needs web push enabled for the app,
which it is for this one. `build.mjs` writes `service-worker.js` next to
`index.html`, loading Braze's worker for the same SDK version as
`tracking.js`, and the SDK is pointed at it, so it works under a GitHub Pages
repo path. The permission is granted to the whole `github.io` origin. iPhone
only gets web push for sites added to the home screen, which would also need
a web app manifest; this site doesn't have one.

## Simulated Braze campaigns (off)

The site can fake Braze in-app messages and content cards locally, so the
campaign half of a demo works before anything exists in Braze. It's switched
off (`SIMULATE_IAM: false`), so only real Braze campaigns appear. Set it to
`true` to bring back:

- a "you could borrow around $X" message after the borrowing power
  calculator, offering to start an application with that amount
- an abandoned application message on a later page once the draft has sat
  for two minutes (a day, in a real campaign)
- abandoned application, rate cut and refinance messages from buttons in the
  Controls tab
- two content cards behind the bell icon

Each fake logs `In-App Message Shown`, `Clicked` or `Dismissed` to Amplitude,
the same events real Braze messages produce.

## Rebuilding

`docs/` is generated and committed, so deployment needs no build. To change
anything, edit `src/` and regenerate:

```bash
node build.mjs
```

| Path | |
|---|---|
| `build.mjs` | Generates `docs/` from the catalogue and templates |
| `src/data/catalog.json` | Products, rates, categories and page copy |
| `src/assets/css/site.css` | All styles, site and event stream |
| `src/assets/js/config.js` | Keys, feature switches and the lending assumptions |
| `src/assets/js/store.js` | Application draft, submitted applications, customer, history (localStorage + cookies) |
| `src/assets/js/finance.js` | Repayments, tax, borrowing power and income bands, shared by the calculators and the application |
| `src/assets/js/tracking.js` | Amplitude + Braze, the only SDK call sites |
| `src/assets/js/app.js` | Site behaviour |
| `src/assets/js/devtools.js` | Event stream drawer |
| `src/assets/img/site/` | The Laneway wordmark and the favicon |
| `src/assets/img/homes/` | Web-sized photos (WebP, 800px and 1600px) |
| `scripts/optimise-photos.py` | Makes those from the full-size originals in `photos/` |
| `scripts/check-links.mjs` | Fails if any generated link or asset doesn't resolve |

To change a rate, edit it in `src/data/catalog.json` and rebuild. Cards,
product pages, calculators and the application all read from there. The
announcement bar and the simulated messages quote rates in plain text, so
update those too.

## Photos

The photos are from Pexels, free to use without attribution; the about page
and the landing page footer credit the photographers anyway. The full-size
originals live in `photos/`, which is git-ignored because they're 35MB, and
`scripts/optimise-photos.py` (needs Pillow) turns them into the WebP files
the site serves. To add one, drop it in `photos/`, give it a name in the
script's `PHOTOS` list, run it, then use it: a home loan's photo is its
`image` in `src/data/catalog.json`, and the other pages pick theirs from
`PHOTO` in `build.mjs`.

## What is and isn't real

Laneway Bank is not a bank. No account is opened, no credit check is run, no
document is uploaded and no money moves. The conditional decision is
arithmetic on what was typed: within the estimated borrowing power and the
loan's maximum LVR is approved, anything else is referred. Sign-in accepts
any email address and never stores or checks a password; the identity exists
only so you can watch it flow into Amplitude and Braze. The rates are
invented and the comparison rates are illustrative, not calculated.
