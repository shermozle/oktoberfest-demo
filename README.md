# Laneway — mocked storefront for an Amplitude + Braze demo

A static, fully mocked rebuild of [lanewaystore.myshopify.com](https://lanewaystore.myshopify.com)
(RMIT's Marketing Technology Lab teaching store), built to demonstrate
Amplitude and Braze working together on a real-looking ecommerce site.

There is no server. The cart, customer, orders and browsing history live in
`localStorage`; the storefront password and session id are cookies. Everything
in `docs/` is plain HTML, CSS, JS and images, so GitHub Pages can serve it with
no build step.

**Password gate:** `mtl`, matching the original. Turn it off with
`REQUIRE_PASSWORD: false` in `docs/assets/js/config.js`.

## What's in it

| | |
|---|---|
| Products | 30, real titles, copy, variants, prices and photography |
| Collections | 10, three brand collaborations (RMIT, Southbank Coffee Co., Laneway) and seven categories |
| Pages | Home, collection index, 10 collections, 30 products, cart, 4-step checkout, order confirmation, account, about, services, 404 |
| Working | Variant picking, cart, quantity edits, checkout, order history, account, live search, filters and sort, recommendations, recently viewed, newsletter capture, B2B enquiry form |
| Instrumented | Amplitude Browser SDK 2 + Session Replay, Braze Web SDK, and an on-page event stream showing every call |

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

- **Stream** — every Amplitude and Braze call in order, with its full payload,
  colour-coded by destination, filterable. Calls held back by a placeholder key
  say so.
- **Controls** — switch between three personas (first-time visitor, repeat
  buyer, high-value customer), seed or empty the cart, wipe all local state.
- **State** — the current identity on both sides, including the ids that bridge
  them.

Turn the whole thing off with `SHOW_DEV_DRAWER: false` for a clean storefront.

## How the two tools connect

`src/assets/js/tracking.js` is the only place either SDK is touched. One
`track()` call fans out to both, so events can't drift apart.

**Product detail** travels in a `products` object array on every event that
has any, in the shape Amplitude's Cart Analysis reads, with `revenue` as the
line total on cart and order lines. Turn on property splitting for `products`
in Amplitude Data to use it. Braze gets the same array for Liquid templating.

**Amplitude → Braze.** On-site behaviour becomes Braze custom attributes and
custom events, so Braze can segment and message on it: `last_brand_viewed`,
`cart_value`, `cart_size`, `lifetime_value`, `favourite_brand`. Adding to cart
or browsing a brand updates both tools in the same breath.

**Braze → Amplitude.** In-app messages and content cards log Amplitude events
when they're shown, clicked and dismissed, so campaign exposure lands in the
same funnels as everything else and lift is measurable.

**Identity.** Amplitude gets a `braze_external_id` user property; Braze gets an
`amplitude_device_id` custom attribute. That pair is what lets you build a
cohort in Amplitude and find the same people in Braze. Both tools also share
the mock's own device id, so the anonymous visitor lines up before sign-in.

See [TRACKING.md](TRACKING.md) for the full event and property list.

## Simulated Braze campaigns (off)

The site can fake Braze in-app messages and content cards locally, so the
campaign half of a demo works before anything exists in Braze. It's switched
off (`SIMULATE_IAM: false`), so only real Braze campaigns appear. Set it to
`true` to bring back:

- a free-shipping nudge on add-to-cart when the cart is under $100
- a cart-abandonment message on a later page view once the cart has sat for
  two minutes (hours, in a real campaign)
- win-back and back-in-stock messages from buttons in the Controls tab
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
| `src/data/catalog.json` | Products, collections and page copy |
| `src/assets/css/site.css` | All styles, storefront and event stream |
| `src/assets/js/config.js` | Keys and feature switches |
| `src/assets/js/store.js` | Cart, customer, orders, history (localStorage + cookies) |
| `src/assets/js/tracking.js` | Amplitude + Braze, the only SDK call sites |
| `src/assets/js/app.js` | Storefront behaviour |
| `src/assets/js/devtools.js` | Event stream drawer |
| `src/assets/img/` | 70 product, collection and site images |
| `scripts/build-catalog.mjs` | Re-derives the catalogue from `raw/` |
| `scripts/fetch-images.sh` | Re-downloads images from `raw/image-manifest.txt` |
| `raw/` | The original Shopify JSON, kept so the catalogue can be rebuilt |

Re-scraping the source store is only needed if its catalogue changes:

```bash
curl -sc raw/jar -o /dev/null https://lanewaystore.myshopify.com/password
curl -sb raw/jar -c raw/jar -o /dev/null -X POST https://lanewaystore.myshopify.com/password \
  --data-urlencode form_type=storefront_password --data-urlencode password=mtl -L
curl -sb raw/jar 'https://lanewaystore.myshopify.com/products.json?limit=250' -o raw/products.json
node scripts/build-catalog.mjs && ./scripts/fetch-images.sh && node build.mjs
```

## Known quirks carried over from the source store

- **Laneway Studio Crew is priced at $0.00.** That is the real price on the
  source store, kept rather than invented. A free line item makes revenue
  demos look broken, so if that matters, set `priceMin`, `priceMax` and the
  variant prices for `laneway-studio-crew` in `src/data/catalog.json` and
  rebuild. $89 fits the range.
- The source store lists a **"Home page" collection** (Shopify's `frontpage`)
  on its collection index. It holds one product and is platform plumbing
  rather than a real collection, so it isn't in this mock.
- Collection descriptions on the source store are Word-pasted HTML. The
  one-line subtitles here were lifted from the rendered pages and live in
  `scripts/build-catalog.mjs`.

## What is and isn't real

Nothing is for sale. No payment details are collected, no card fields exist, no
order ships, and no email is sent. Sign-in accepts any email address and never
stores or checks a password — the identity exists only so you can watch it flow
into Amplitude and Braze. Product photography, copy and brands come from the
RMIT teaching store, which is itself a simulation.
