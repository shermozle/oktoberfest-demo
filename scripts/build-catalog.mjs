/**
 * Turns the raw Shopify JSON dumped from lanewaystore.myshopify.com into the
 * flat catalog the static site is generated from.
 *
 *   node scripts/build-catalog.mjs
 *
 * Reads  raw/products.json, raw/collections.json, raw/collections/<handle>.json
 * Writes src/data/catalog.json and raw/image-manifest.txt
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

// --- helpers ---------------------------------------------------------------

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…');

const stripTags = (html) =>
  decode(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Shopify product descriptions here follow a fixed shape: two or three bold
 * headings ("THE THINKING", "DETAILS", …) each followed by a paragraph, with
 * DETAILS holding a bullet list. Parse it into blocks so the product template
 * can render headings and lists rather than one wall of text.
 */
function parseDescription(html) {
  const src = String(html || '');
  const blocks = [];
  // Normalise: split on block-level boundaries, keeping <li> markers.
  const chunks = src
    .replace(/<li[^>]*>/gi, '\n@LI@')
    .replace(/<\/(p|div|ul|ol|li|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .split('\n');

  for (const raw of chunks) {
    const isBullet = raw.startsWith('@LI@');
    const strongHeading = /<strong[^>]*>\s*([^<]+?)\s*<\/strong>\s*$/i.exec(
      raw.replace('@LI@', '')
    );
    const rawText = stripTags(raw.replace('@LI@', ''));
    const text = rawText.replace(/^[•·-]\s*/, '');
    if (!text) continue;

    // Some descriptions fake a list with "• " prefixes inside one paragraph.
    if (isBullet || /^[•·]\s/.test(rawText)) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'list') last.items.push(text);
      else blocks.push({ type: 'list', items: [text] });
      continue;
    }
    // A short, fully-uppercase line (or a <strong>-only paragraph) is a heading.
    const looksHeading =
      (strongHeading && text.length < 60) ||
      (text.length < 40 && text === text.toUpperCase() && /[A-Z]/.test(text));
    if (looksHeading) {
      blocks.push({ type: 'heading', text: text.replace(/[…:]$/, '') });
    } else {
      blocks.push({ type: 'para', text });
    }
  }
  return blocks;
}

const money = (v) => Number(v);

// Shopify's CDN re-encodes to WebP on request, which takes the image set from
// ~81MB to ~5MB. Filenames are normalised to .webp to match.
const IMG_PARAMS = '?width=1100&format=webp';

const slugFromUrl = (url) =>
  basename(url.split('?')[0]).replace(/\.(png|jpe?g|webp)$/i, '') + '.webp';

// Local path an image is downloaded to.
const localImage = (url) => `assets/img/products/${slugFromUrl(url)}`;

// --- load ------------------------------------------------------------------

const products = read('raw/products.json').products;
const collectionsRaw = read('raw/collections.json').collections;

const collectionProducts = {};
for (const f of readdirSync('raw/collections')) {
  if (!f.endsWith('.json')) continue;
  const handle = f.replace(/\.json$/, '');
  collectionProducts[handle] = read(`raw/collections/${f}`).products.map(
    (p) => p.handle
  );
}

// Short one-line subtitles as shown on the live collection banners. The
// collections.json descriptions are Word-pasted HTML, so these are lifted from
// the rendered pages instead.
const collectionSubtitles = {
  accessories:
    'Totes, notebooks and the small things — the finishing pieces of the collection.',
  'all-tees':
    'Every tee in the store, across all three labels. Same staple, three different houses.',
  'all-totes': 'Every tote we carry, from each brand in the range.',
  apparel: 'Tees, hoodies, caps and more — across every label in the range.',
  drinkware:
    'Cups, mugs and bottles built for the daily ritual, from every brand we work with.',
  frontpage: 'Featured on the Laneway home page.',
  laneway: 'Our own studio line — the pieces we make when the brief is ours.',
  'new-season': 'The latest drop in the Laneway range.',
  rmit:
    'Our collaboration with RMIT University — everyday essentials, brought into the Laneway range.',
  signature:
    'Signature is the work we make to no brief but our own. Where the rest of Laneway is shaped by what a client needs, this is the studio answering only to itself — a small, considered capsule of pieces made in limited numbers and held to a higher standard.',
  'southbank-coffee-co':
    'Branded merchandise we designed for Southbank Coffee Co., a Melbourne specialty roaster.',
};

// Collections that represent a brand/collaboration rather than a category.
const brandCollections = ['rmit', 'southbank-coffee-co', 'laneway'];

// --- transform products ----------------------------------------------------

const tagValue = (tags, prefix) => {
  const hit = tags.find((t) => t.startsWith(prefix + ':'));
  return hit ? hit.slice(prefix.length + 1) : null;
};

const outProducts = products.map((p) => {
  const images = (p.images || []).map((i) => ({
    src: localImage(i.src),
    remote: i.src,
    alt: i.alt || p.title,
  }));

  const options = (p.options || [])
    .filter((o) => !(o.values.length === 1 && o.values[0] === 'Default Title'))
    .map((o) => ({ name: o.name, values: o.values }));

  const variants = (p.variants || []).map((v) => ({
    id: String(v.id),
    title: v.title,
    price: money(v.price),
    available: v.available !== false,
    options: [v.option1, v.option2, v.option3].filter(Boolean),
  }));

  const prices = variants.map((v) => v.price);

  return {
    handle: p.handle,
    title: p.title,
    brand: p.vendor,
    type: p.product_type || 'Other',
    tags: p.tags,
    tier: tagValue(p.tags, 'tier'),
    season: tagValue(p.tags, 'season'),
    typeTag: tagValue(p.tags, 'type'),
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    images,
    options,
    variants,
    descriptionBlocks: parseDescription(p.body_html),
    descriptionText: stripTags(p.body_html),
    publishedAt: p.published_at,
  };
});

const byHandle = new Map(outProducts.map((p) => [p.handle, p]));

// --- transform collections -------------------------------------------------

const outCollections = collectionsRaw
  .filter((c) => c.handle !== 'frontpage')
  .map((c) => {
    const handles = collectionProducts[c.handle] || [];
    const first = handles.map((h) => byHandle.get(h)).find(Boolean);
    const image = c.image?.src
      ? `assets/img/collections/${slugFromUrl(c.image.src)}`
      : first?.images[0]?.src || null;
    return {
      handle: c.handle,
      title: c.title,
      subtitle: collectionSubtitles[c.handle] || stripTags(c.description),
      image,
      remoteImage: c.image?.src || null,
      isBrand: brandCollections.includes(c.handle),
      products: handles,
    };
  });

// --- static pages ----------------------------------------------------------

const pages = {
  about: {
    title: 'About this store',
    lede: "Laneway isn't real — and that's the point.",
    body: [
      'Most of what shapes a modern shopping experience is invisible. The email that arrives just after you abandon a cart. The "you might also like" that\'s quietly built from your browsing. The way three different analytics tools can watch the same click and count it three different ways.',
      "Laneway exists to make all of that visible. It's a fully working store — real storefront, real product data, real marketing technology — built by RMIT University's Marketing Technology Lab so students can get inside the machinery instead of reading about it.",
      "Everything you see is simulated for teaching. The products won't ship. The customers are personas. Southbank Coffee Co. and Volta Studio are invented brands; RMIT's own products appear here under a teaching arrangement. No real orders, no real payments, no real personal data.",
      "The technology underneath, though, is exactly what the industry runs on. That's the part we want you to see.",
    ],
  },
  services: {
    title: 'Merch your audience actually wants',
    lede:
      'Laneway is a Melbourne design studio. We design branded merchandise and retail experiences for brands.',
    whatWeDo:
      'Most branded merch is an afterthought. We treat it as design — from a single considered collection to a full pop-up launch, we make merchandise people choose to keep.',
    servicesHeading: "You've already seen our work, now be part of it",
    items: [
      {
        name: 'Brand Merch Audit',
        price: 'From $1,500',
        body:
          'A clear-eyed review of what your brand puts into the world. We audit your current merch, benchmark it, and hand back a prioritised set of recommendations — what to keep, cut, and create.',
        bestFor: "Best for brands whose existing merch isn't landing.",
      },
      {
        name: 'Custom Collection Design',
        price: 'From $5,000',
        body:
          'A bespoke branded collection, designed end to end — concept, design, materials and production-ready specs, the way we built the Southbank Coffee Co. range.',
        bestFor: 'Best for brands launching or refreshing a merch line.',
      },
      {
        name: 'Pop-Up & Launch',
        price: 'From $15,000',
        body:
          'The full experience — we design, build and launch a physical or digital pop-up that brings your brand to life in a space, the way Laneway built its own.',
        bestFor: 'Best for launches, activations and flagship moments.',
      },
    ],
    enquiryNote:
      "Tell us what you're working on and we'll be in touch within two business days.",
    disclaimer:
      "Laneway is a teaching simulation by RMIT's Marketing Technology Lab. Enquiries demonstrate how B2B marketing technology works and won't result in a real engagement.",
  },
  home: {
    heroHeading: 'COOL MERCH FROM COOL BRANDS',
    heroSub: 'Laneway makes merch for your favourite brands.',
    heroImage: 'assets/img/site/hero.webp',
    heroRemote:
      'https://cdn.shopify.com/s/files/1/0806/5571/2515/files/SB_Reference.png?v=1782041236&width=2400',
    pitchHeading: 'OUR SHOP IS OUR PORTFOLIO',
    pitchBody:
      'Laneway works with brands to design custom merchandise that reflects who they are. Every product in our shop began as a client collaboration or a studio project — so our retail range is proof of what we do. If you like what you see, imagine what we could make for your brand.',
    collectionListHeading: 'SHOP BY COLLECTION',
    collectionListSub:
      "Every label here is a brand we've designed for. Browse the work by who it was made with.",
    signatureHeading: 'THE SIGNATURE RANGE',
    signatureSub:
      "The work we make to no brief but our own — limited, considered, made at the studio's highest standard.",
  },
  site: {
    name: 'Laneway',
    announcement: 'Melbourne-designed branded merchandise, made to be kept.',
    logo: 'assets/img/site/logo.jpg',
    logoRemote:
      'https://cdn.shopify.com/s/files/1/0806/5571/2515/files/Laneway_Logo.jpg?v=1774775441&width=400',
    currency: 'AUD',
    footerNote:
      "Laneway is a simulated teaching store by RMIT's Marketing Technology Lab.",
    footerNote2: 'Nothing here is real or for sale.',
    newsletterHeading: 'Join our email list',
    newsletterBody: 'Be first to see new collections and collaborations.',
  },
};

// --- write -----------------------------------------------------------------

const catalog = { site: pages.site, pages, collections: outCollections, products: outProducts };
writeFileSync('src/data/catalog.json', JSON.stringify(catalog, null, 2));

// Image manifest for the download script: "<remote url>\t<local path>"
const manifest = new Set();
const remote = (url) => url.split('?')[0] + IMG_PARAMS;
for (const p of products)
  for (const i of p.images || [])
    manifest.add(`${remote(i.src)}\t${localImage(i.src)}`);
for (const c of collectionsRaw)
  if (c.image?.src)
    manifest.add(
      `${remote(c.image.src)}\tassets/img/collections/${slugFromUrl(c.image.src)}`
    );
manifest.add(
  `${pages.home.heroRemote.split('?')[0]}?width=2000&format=webp\t${pages.home.heroImage}`
);
manifest.add(`${pages.site.logoRemote.split('?')[0]}?width=400\t${pages.site.logo}`);
writeFileSync('raw/image-manifest.txt', [...manifest].join('\n') + '\n');

console.log(
  `catalog: ${outProducts.length} products, ${outCollections.length} collections, ${manifest.size} images`
);
