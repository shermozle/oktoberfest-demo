/**
 * Laneway demo — static site generator.
 *
 *   node build.mjs
 *
 * Reads src/data/catalog.json plus src/assets/**, writes a complete static
 * site to docs/ that GitHub Pages can serve with no build step of its own.
 *
 * Every link is relative, so the same output works at a repo subpath
 * (/laneway-demo/), at a domain root, and from the local filesystem.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = 'docs';
const catalog = JSON.parse(readFileSync('src/data/catalog.json', 'utf8'));
const { site, pages, collections, products } = catalog;

const byHandle = new Map(products.map((p) => [p.handle, p]));

/* --- helpers -------------------------------------------------------------- */

const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );

const money = (n) =>
  '$' +
  Number(n).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const priceLabel = (p) =>
  p.priceMin === p.priceMax ? money(p.priceMin) : 'From ' + money(p.priceMin);

function emit(path, html) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
}

/* --- icons ---------------------------------------------------------------- */

const icon = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
  user:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  bag:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  bell:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M18 16V11a6 6 0 1 0-12 0v5l-1.5 3h15L18 16Z"/><path d="M10 21h4"/></svg>',
  menu:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  cart:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  arrow:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

/* --- chrome --------------------------------------------------------------- */

// Order the brand collections the way the original site lists them, rather
// than the order they happen to come back from the Shopify API in.
const BRAND_ORDER = ['rmit', 'southbank-coffee-co', 'laneway'];
const brandCollections = collections
  .filter((c) => c.isBrand)
  .sort((a, b) => BRAND_ORDER.indexOf(a.handle) - BRAND_ORDER.indexOf(b.handle));
const categoryCollections = collections.filter(
  (c) => !c.isBrand && c.handle !== 'new-season'
);

function header(base) {
  const megaList = (items) =>
    '<ul class="mega__list">' +
    items
      .map(
        (c) =>
          '<li><a href="' +
          base +
          'collections/' +
          c.handle +
          '/" data-nav-link="mega">' +
          esc(c.title) +
          '</a></li>'
      )
      .join('') +
    '</ul>';

  return `
<div class="announcement">${esc(site.announcement)}</div>
<header class="site-header">
  <button class="icon-btn nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Menu">${icon.menu}</button>
  <a class="site-header__logo" href="${base}index.html" aria-label="Laneway home">
    <img src="${base}${site.logo}" alt="Laneway" width="96" height="18">
  </a>
  <nav class="site-nav" id="site-nav" aria-label="Main">
    <div class="site-nav__item"><a href="${base}index.html" data-nav-link="header">Home</a></div>
    <div class="site-nav__item"><a href="${base}pages/about/" data-nav-link="header">About</a></div>
    <div class="site-nav__item"><a href="${base}pages/services/" data-nav-link="header">Services</a></div>
    <div class="site-nav__item">
      <a href="${base}collections/" data-nav-link="header" aria-haspopup="true">Shop</a>
      <div class="mega">
        <div>
          <p class="mega__title"><a href="${base}collections/">By Collaboration</a></p>
          ${megaList(brandCollections.concat(collections.filter((c) => c.handle === 'signature')))}
        </div>
        <div>
          <p class="mega__title"><a href="${base}collections/">By Category</a></p>
          ${megaList(categoryCollections.filter((c) => c.handle !== 'signature'))}
        </div>
      </div>
    </div>
  </nav>
  <div class="site-header__actions">
    <button class="icon-btn" type="button" data-search-open aria-label="Search">${icon.search}</button>
    <button class="icon-btn" type="button" data-cards-toggle aria-label="Messages">
      ${icon.bell}<span class="badge" data-cards-count hidden>0</span>
    </button>
    <a class="icon-btn" href="${base}account/" aria-label="Account">${icon.user}</a>
    <a class="icon-btn" href="${base}cart/" aria-label="Cart">
      ${icon.bag}<span class="badge" data-cart-count hidden>0</span>
    </a>
  </div>
</header>

<div class="cards-panel" id="cards-panel" hidden>
  <p class="mega__title" style="margin-bottom:12px">Your messages</p>
  <div data-cards-list></div>
</div>

<div class="search-overlay" id="search-overlay" hidden>
  <div style="display:flex;justify-content:flex-end">
    <button class="icon-btn" type="button" data-search-close aria-label="Close search">${icon.close}</button>
  </div>
  <div class="search-overlay__bar">
    <label class="visually-hidden" for="search-input">Search products</label>
    <input id="search-input" type="search" placeholder="Search products&hellip;" autocomplete="off">
  </div>
  <div class="search-results"></div>
</div>`;
}

function footer(base) {
  return `
<footer class="footer">
  <div class="footer__top">
    <div>
      <p class="footer__note">${esc(site.footerNote)}</p>
      <p class="footer__note">${esc(site.footerNote2)}</p>
      <p><a class="link-underline" href="${base}pages/about/">[Why this exists &rarr;]</a></p>
    </div>
    <div class="newsletter">
      <h3 style="margin-bottom:6px">${esc(site.newsletterHeading)}</h3>
      <p class="muted">${esc(site.newsletterBody)}</p>
      <form data-newsletter="footer" novalidate>
        <label class="visually-hidden" for="footer-email">Email address</label>
        <input id="footer-email" type="email" placeholder="Email address" autocomplete="email">
        <button type="submit" aria-label="Subscribe">${icon.arrow}</button>
      </form>
      <p class="newsletter__msg" role="status"></p>
    </div>
    <div>
      <p class="mega__title">Shop</p>
      <ul class="mega__list">
        ${collections
          .slice(0, 6)
          .map(
            (c) =>
              '<li><a href="' +
              base +
              'collections/' +
              c.handle +
              '/">' +
              esc(c.title) +
              '</a></li>'
          )
          .join('')}
      </ul>
    </div>
  </div>
  <div class="footer__bottom">
    <span>&copy; 2026 Laneway &mdash; mocked for demonstration</span>
    <a href="${base}pages/about/">About this store</a>
    <a href="${base}account/">Account</a>
  </div>
</footer>`;
}

function gate(base) {
  return `
<div class="gate" id="gate" hidden>
  <div class="gate__inner">
    <img class="gate__logo" src="${base}${site.logo}" alt="Laneway" width="96" height="16">
    <h1>Demo Site</h1>
    <p>This site is exclusively used for education within RMIT's Marketing Technology courses. Enter below with the password from your teacher.</p>
    <p class="muted">Welcome to Laneway. Before you come in, one thing worth knowing: Laneway isn't a real business. It's a working teaching store built by RMIT University's Marketing Technology Lab, where students learn how modern marketing technology actually behaves in the wild. Everything inside is simulated. The brands, the products, the customers have all been created for teaching. Nothing is for sale, nothing ships, and no payment are ever taken. What is real is the technology running underneath &mdash; and once you're in, you'll be able to see exactly how it works.</p>
    <p><strong>Password: MTL</strong></p>
    <form novalidate>
      <label class="visually-hidden" for="gate-password">Password</label>
      <input id="gate-password" type="password" placeholder="Password" autocomplete="off">
      <button class="btn" type="submit">Enter</button>
    </form>
    <p class="gate__error" role="alert" style="color:#c0392b;min-height:20px;margin-top:10px"></p>
  </div>
</div>`;
}

/* --- layout --------------------------------------------------------------- */

function layout(opts) {
  const base = opts.base;
  const title = opts.title
    ? opts.title + ' – ' + site.name
    : site.name;
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(opts.description || site.footerNote)}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(opts.description || site.footerNote)}">
<link rel="icon" href="${base}${site.logo}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${base}assets/css/site.css">
</head>
<body data-page="${esc(opts.page)}">
${header(base)}
<main>
${opts.content}
</main>
${footer(base)}
${gate(base)}
<script>
  window.LANEWAY_BASE = ${JSON.stringify(base)};
  window.LANEWAY_PAGE = ${JSON.stringify(opts.pageData || {})};
</script>
<script src="${base}assets/js/config.js"></script>
<script src="${base}assets/data/index.js"></script>
<script src="${base}assets/js/store.js"></script>
<script src="${base}assets/js/tracking.js"></script>
<script src="${base}assets/js/devtools.js"></script>
<script src="${base}assets/js/app.js"></script>
</body>
</html>
`;
}

/* --- shared blocks -------------------------------------------------------- */

function productCard(p, base) {
  const second = p.images[1]
    ? `<img src="${base}${p.images[1].src}" alt="" loading="lazy">`
    : '';
  return `<article class="card" data-product-card="${esc(p.handle)}">
  <a class="card__media" href="${base}products/${p.handle}/">
    <img src="${base}${p.images[0].src}" alt="${esc(p.images[0].alt)}" loading="lazy">
    ${second}
  </a>
  <div class="card__body">
    <span class="card__brand">${esc(p.brand)}</span>
    <a class="card__title" href="${base}products/${p.handle}/">${esc(p.title)}</a>
    <div class="card__price">${priceLabel(p)}</div>
  </div>
</article>`;
}

function recommendationSection(base, seedHandle, heading, placement) {
  return `<section class="section page" data-placement="${esc(placement)}">
  <div class="section-head__row">
    <h2 style="font-size:20px">${esc(heading)}</h2>
    <a class="link-underline" href="${base}collections/new-season/">View all</a>
  </div>
  <div class="grid grid--4" data-recommend="${esc(seedHandle || '')}" data-recommend-limit="4" data-placement="${esc(placement)}"></div>
</section>`;
}

/* --- home ----------------------------------------------------------------- */

function homePage() {
  const base = '';
  const home = pages.home;
  const signature = collections.find((c) => c.handle === 'signature');
  const signatureProducts = signature.products
    .map((h) => byHandle.get(h))
    .filter(Boolean);

  const content = `
<section class="hero">
  <img class="hero__media" src="${base}${home.heroImage}" alt="" fetchpriority="high">
  <div class="hero__inner">
    <h1>${esc(home.heroHeading)}</h1>
    <p class="hero__sub">${esc(home.heroSub)}</p>
    <div class="hero__actions">
      <a class="btn btn--ghost" href="${base}collections/new-season/">Shop all</a>
      <a class="btn btn--ghost" href="${base}pages/services/">Work with us</a>
    </div>
  </div>
</section>

<section class="section page">
  <div class="section-head section-head--center">
    <h2>${esc(home.pitchHeading)}</h2>
    <p>${esc(home.pitchBody)}</p>
  </div>
</section>

<section class="section--tight page" data-placement="home-collections">
  <div class="section-head">
    <h2>${esc(home.collectionListHeading)}</h2>
    <p>${esc(home.collectionListSub)}</p>
  </div>
  <div class="grid grid--3">
    ${brandCollections
      .map(
        (c) => `<a class="tile" href="${base}collections/${c.handle}/">
      <span class="tile__media"><img src="${base}${c.image}" alt="${esc(c.title)}" loading="lazy"></span>
      <span class="tile__label">${esc(c.title)}</span>
    </a>`
      )
      .join('')}
  </div>
</section>

<section class="section page" data-placement="home-signature">
  <div class="section-head">
    <h2>${esc(home.signatureHeading)}</h2>
    <p>${esc(home.signatureSub)}</p>
  </div>
  <div class="grid grid--3">
    ${signatureProducts.map((p) => productCard(p, base)).join('')}
  </div>
</section>

<section class="section--tight page" hidden>
  <div class="section-head__row"><h2 style="font-size:20px">Recently viewed</h2></div>
  <div class="grid grid--4" data-recently-viewed data-placement="recently-viewed"></div>
</section>
`;

  return layout({
    base,
    page: 'home',
    title: '',
    description: home.heroSub,
    content,
    pageData: { name: 'Home' },
  });
}

/* --- collections index ---------------------------------------------------- */

function collectionsIndexPage() {
  const base = '../';
  const content = `
<div class="collection-banner collection-banner--plain page">
  <h1>Collections</h1>
  <p class="muted">Every label here is a brand we&rsquo;ve designed for, plus the categories that cut across them.</p>
</div>
<section class="section--tight page" data-placement="collections-index">
  <div class="grid grid--3">
    ${collections
      .map(
        (c) => `<a class="tile" href="${base}collections/${c.handle}/">
      <span class="tile__media"><img src="${base}${c.image}" alt="${esc(c.title)}" loading="lazy"></span>
      <span class="tile__label">${esc(c.title)}</span>
    </a>`
      )
      .join('')}
  </div>
</section>
`;
  return layout({
    base,
    page: 'collections',
    title: 'Collections',
    description: 'Browse Laneway by collaboration or by category.',
    content,
    pageData: { name: 'Collections' },
  });
}

/* --- collection ----------------------------------------------------------- */

function collectionPage(c) {
  const base = '../../';
  const items = c.products.map((h) => byHandle.get(h)).filter(Boolean);
  const maxPrice = Math.max(...items.map((p) => p.priceMax), 0);

  const banner = c.image
    ? `<div class="collection-banner">
  <img class="collection-banner__media" src="${base}${c.image}" alt="" fetchpriority="high">
  <h1>${esc(c.title)}</h1>
  <p>${esc(c.subtitle)}</p>
</div>`
    : `<div class="collection-banner collection-banner--plain page">
  <h1>${esc(c.title)}</h1>
  <p class="muted">${esc(c.subtitle)}</p>
</div>`;

  const content = `
${banner}
<div class="toolbar">
  <div class="filter-pop">
    <button class="btn--sm" type="button" data-pop-toggle="pop-availability"
      style="border:0;background:none;cursor:pointer;padding:6px 0">Availability &#9662;</button>
    <div class="filter-pop__panel" id="pop-availability" hidden>
      <label class="check"><input type="checkbox" value="in-stock" data-filter-availability><span>In stock</span></label>
      <label class="check"><input type="checkbox" value="out-of-stock" data-filter-availability><span>Out of stock</span></label>
    </div>
  </div>
  <div class="filter-pop">
    <button class="btn--sm" type="button" data-pop-toggle="pop-price"
      style="border:0;background:none;cursor:pointer;padding:6px 0">Price &#9662;</button>
    <div class="filter-pop__panel" id="pop-price" hidden>
      <div class="field-row">
        <label class="field"><span>From</span><input type="number" min="0" placeholder="0" data-price-min></label>
        <label class="field"><span>To</span><input type="number" min="0" placeholder="${Math.ceil(maxPrice)}" data-price-max></label>
      </div>
      <p class="muted" style="font-size:12px;margin:0 0 10px">Highest price is ${money(maxPrice)}</p>
      <button class="btn btn--sm btn--outline" type="button" data-filter-clear>Clear all</button>
    </div>
  </div>
  <span class="toolbar__count" data-collection-count>${items.length} items</span>
  <label>
    <span class="visually-hidden">Sort by</span>
    <select data-sort>
      <option value="featured">Featured</option>
      <option value="title-asc">Alphabetically, A-Z</option>
      <option value="title-desc">Alphabetically, Z-A</option>
      <option value="price-asc">Price, low to high</option>
      <option value="price-desc">Price, high to low</option>
      <option value="date-desc">Date, new to old</option>
      <option value="date-asc">Date, old to new</option>
    </select>
  </label>
</div>
<section class="section--tight page" data-placement="collection-grid">
  <div class="grid grid--4" data-collection-grid>
    ${items.map((p) => productCard(p, base)).join('')}
  </div>
</section>
`;

  return layout({
    base,
    page: 'collection',
    title: c.title,
    description: c.subtitle,
    content,
    pageData: {
      name: c.title,
      collection: {
        handle: c.handle,
        title: c.title,
        isBrand: c.isBrand,
        products: c.products,
      },
    },
  });
}

/* --- product -------------------------------------------------------------- */

function productPage(p) {
  const base = '../../';
  const inCollections = collections.filter((c) => c.products.includes(p.handle));
  const brandCollection = inCollections.find((c) => c.isBrand);

  const gallery = p.images
    .map(
      (img, i) =>
        `<figure><img src="${base}${img.src}" alt="${esc(img.alt)}"${
          i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'
        }></figure>`
    )
    .join('');

  const options = p.options
    .map(
      (opt) => `<div class="option">
    <span class="option__label">${esc(opt.name)}</span>
    <div class="option__values" role="group" aria-label="${esc(opt.name)}">
      ${opt.values
        .map(
          (v) =>
            `<button class="swatch" type="button" aria-pressed="false" data-option-name="${esc(
              opt.name
            )}" data-option-value="${esc(v)}">${esc(v)}</button>`
        )
        .join('')}
    </div>
  </div>`
    )
    .join('');

  const description = p.descriptionBlocks
    .map((b) => {
      if (b.type === 'heading') return `<h3>${esc(b.text)}</h3>`;
      if (b.type === 'list')
        return '<ul>' + b.items.map((i) => `<li>${esc(i)}</li>`).join('') + '</ul>';
      return `<p>${esc(b.text)}</p>`;
    })
    .join('');

  const meta = [
    p.brand && ['Brand', p.brand],
    p.type && ['Category', p.type],
    p.tier && ['Tier', p.tier],
    p.season && ['Season', p.season],
  ]
    .filter(Boolean)
    .map((m) => `<span class="chip">${esc(m[0])}: ${esc(m[1])}</span>`)
    .join('');

  const content = `
<nav class="page" aria-label="Breadcrumb" style="padding-top:20px;font-size:12px">
  <a class="muted" href="${base}collections/">Shop</a>
  ${
    brandCollection
      ? ' <span class="muted">/</span> <a class="muted" href="' +
        base +
        'collections/' +
        brandCollection.handle +
        '/">' +
        esc(brandCollection.title) +
        '</a>'
      : ''
  }
  <span class="muted">/</span> <span>${esc(p.title)}</span>
</nav>

<div class="product">
  <div class="product__gallery">${gallery}</div>
  <div class="product__info">
    <p class="product__brand">${esc(p.brand)}</p>
    <h1 class="product__title">${esc(p.title)}</h1>
    <p class="product__price" data-product-price>${money(p.priceMin)}</p>

    ${options}

    <div class="buy-row">
      <div class="qty">
        <button type="button" data-qty-step="-1" aria-label="Decrease quantity">&minus;</button>
        <label class="visually-hidden" for="qty">Quantity</label>
        <input id="qty" type="number" min="1" max="99" value="1" data-qty-input>
        <button type="button" data-qty-step="1" aria-label="Increase quantity">+</button>
      </div>
      <button class="btn" type="button" data-add-to-cart>${icon.cart}<span>Add to cart</span></button>
    </div>
    <a class="btn btn--block btn--outline" href="${base}cart/">View cart</a>

    <div class="product__description">${description}</div>
    <div class="product__meta">${meta}</div>
  </div>
</div>

${recommendationSection(base, p.handle, 'You may also like', 'product-recs')}

<section class="section--tight page" hidden>
  <div class="section-head__row"><h2 style="font-size:20px">Recently viewed</h2></div>
  <div class="grid grid--4" data-recently-viewed data-placement="recently-viewed"></div>
</section>

<div class="quick-bar">
  <img src="${base}${p.images[0].src}" alt="">
  <span class="quick-bar__text">${esc(p.title)}<span data-quickbar-variant></span></span>
  <span data-product-price>${money(p.priceMin)}</span>
  <button class="btn btn--sm" type="button" data-quickbar-add>${icon.cart}<span>Add to cart</span></button>
</div>
`;

  return layout({
    base,
    page: 'product',
    title: p.title,
    description: p.descriptionText.slice(0, 160),
    content,
    pageData: {
      name: p.title,
      product: {
        handle: p.handle,
        title: p.title,
        brand: p.brand,
        category: p.type,
        tier: p.tier,
        priceMin: p.priceMin,
        options: p.options,
        variants: p.variants,
        images: p.images.map((i) => ({ src: i.src })),
      },
    },
  });
}

/* --- cart ----------------------------------------------------------------- */

function cartPage() {
  const base = '../';
  const content = `
<div data-cart-empty hidden>
  <div class="empty-state">
    <h1 style="margin-bottom:12px">Your cart is empty</h1>
    <p>Nothing in here yet.</p>
    <a class="btn" href="${base}collections/new-season/" style="margin-top:12px">Continue shopping</a>
  </div>
</div>

<div data-cart-body>
  <div class="cart">
    <div>
      <div class="cart__title">
        <h1 style="font-size:28px">Cart</h1>
        <span class="cart__count" data-cart-title-count>0</span>
      </div>
      <p class="muted" data-shipping-progress role="status" style="margin-bottom:8px"></p>
      <div data-cart-lines></div>
      <p style="margin-top:24px"><a class="link-underline" href="${base}collections/new-season/">Continue shopping</a></p>
    </div>
    <aside class="summary">
      <details class="disclosure" style="margin-bottom:12px">
        <summary>Discount</summary>
        <label class="field" style="margin-top:12px">
          <span class="visually-hidden">Discount code</span>
          <input type="text" placeholder="Discount code">
        </label>
        <p class="muted" style="font-size:12px;margin:0">No codes are active on this teaching store.</p>
      </details>
      <div data-cart-summary></div>
      <p class="summary__note">Taxes and shipping calculated at checkout.</p>
      <button class="btn btn--block" type="button" data-checkout>Check out</button>
    </aside>
  </div>
  ${recommendationSection(base, '', 'You may also like', 'cart-recs')}
</div>
`;
  return layout({
    base,
    page: 'cart',
    title: 'Your Shopping Cart',
    content,
    pageData: { name: 'Cart' },
  });
}

/* --- checkout ------------------------------------------------------------- */

function checkoutPage() {
  const base = '../';
  const content = `
<div data-checkout-empty hidden>
  <div class="empty-state">
    <h1 style="margin-bottom:12px">Nothing to check out</h1>
    <a class="btn" href="${base}collections/new-season/" style="margin-top:12px">Continue shopping</a>
  </div>
</div>

<div data-checkout-wrap>
<div class="checkout">
  <form data-checkout-form novalidate>
    <ol class="steps">
      <li data-step-nav aria-current="step">1 Contact</li>
      <li data-step-nav>2 Shipping</li>
      <li data-step-nav>3 Payment</li>
      <li data-step-nav>4 Review</li>
    </ol>

    <section class="checkout__step" data-step>
      <h1 style="font-size:24px;margin-bottom:18px">Contact</h1>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email"></label>
      <div class="field-row">
        <label class="field"><span>First name</span><input name="firstName" autocomplete="given-name"></label>
        <label class="field"><span>Last name</span><input name="lastName" autocomplete="family-name"></label>
      </div>
      <label class="check"><input type="checkbox" name="marketingOptIn" checked><span>Email me about new collections and collaborations</span></label>
      <p class="muted" style="font-size:12px;margin-top:10px">Nothing is charged and nothing ships. The email is only used to show how identity flows into Amplitude and Braze.</p>
      <button class="btn" type="button" data-step-next style="margin-top:14px">Continue to shipping</button>
    </section>

    <section class="checkout__step" data-step hidden>
      <h1 style="font-size:24px;margin-bottom:18px">Shipping</h1>
      <label class="field"><span>Address</span><input name="address" autocomplete="street-address"></label>
      <div class="field-row">
        <label class="field"><span>City</span><input name="city" autocomplete="address-level2"></label>
        <label class="field"><span>Postcode</span><input name="postcode" autocomplete="postal-code"></label>
      </div>
      <label class="field"><span>Country</span>
        <select name="country"><option>Australia</option><option>New Zealand</option></select>
      </label>
      <fieldset style="border:1px solid var(--line);border-radius:12px;padding:14px;margin:0 0 14px">
        <legend style="font-size:13px;padding:0 6px">Delivery</legend>
        <label class="check"><input type="radio" name="shippingMethod" value="standard" checked><span>Standard &mdash; free over ${money(
          9.95 * 0 + 100
        )}, otherwise ${money(9.95)}</span></label>
        <label class="check"><input type="radio" name="shippingMethod" value="express"><span>Express &mdash; ${money(
          19.95
        )}</span></label>
      </fieldset>
      <button class="btn btn--outline" type="button" data-step-back>Back</button>
      <button class="btn" type="button" data-step-next>Continue to payment</button>
    </section>

    <section class="checkout__step" data-step hidden>
      <h1 style="font-size:24px;margin-bottom:18px">Payment</h1>
      <p class="muted">No payment is taken and no card details are collected. Pick a method so the event carries one.</p>
      <fieldset style="border:1px solid var(--line);border-radius:12px;padding:14px;margin:14px 0">
        <legend style="font-size:13px;padding:0 6px">Method</legend>
        <label class="check"><input type="radio" name="paymentMethod" value="card" checked><span>Card (simulated)</span></label>
        <label class="check"><input type="radio" name="paymentMethod" value="paypal"><span>PayPal (simulated)</span></label>
        <label class="check"><input type="radio" name="paymentMethod" value="afterpay"><span>Afterpay (simulated)</span></label>
      </fieldset>
      <button class="btn btn--outline" type="button" data-step-back>Back</button>
      <button class="btn" type="button" data-step-next>Review order</button>
    </section>

    <section class="checkout__step" data-step hidden>
      <h1 style="font-size:24px;margin-bottom:18px">Review</h1>
      <p class="muted">Placing the order writes it to localStorage and sends Amplitude an <code>Order Completed</code> event carrying the order total as revenue and a <code>products</code> array. Braze gets the same event and a <code>logPurchase</code> per line item.</p>
      <button class="btn btn--outline" type="button" data-step-back>Back</button>
      <button class="btn" type="button" data-place-order>Place order</button>
    </section>
  </form>

  <aside class="summary">
    <p class="mega__title" style="margin-bottom:12px">Order summary</p>
    <div data-checkout-lines></div>
    <div data-checkout-summary style="margin-top:14px"></div>
  </aside>
</div>
</div>
`;
  return layout({
    base,
    page: 'checkout',
    title: 'Checkout',
    content,
    pageData: { name: 'Checkout' },
  });
}

/* --- order ---------------------------------------------------------------- */

function orderPage() {
  const base = '../';
  const content = `
<div class="page page--narrow" style="padding-block:56px 80px">
  <div data-order></div>
  <p style="margin-top:28px">
    <a class="btn" href="${base}collections/new-season/">Continue shopping</a>
    <a class="btn btn--outline" href="${base}account/">View account</a>
  </p>
</div>
${recommendationSection(base, '', 'Complete the set', 'post-purchase-recs')}
`;
  return layout({
    base,
    page: 'order',
    title: 'Order confirmed',
    content,
    pageData: { name: 'Order confirmation' },
  });
}

/* --- account -------------------------------------------------------------- */

function accountPage() {
  const content = `<div class="auth" data-account></div>`;
  return layout({
    base: '../',
    page: 'account',
    title: 'Account',
    content,
    pageData: { name: 'Account' },
  });
}

/* --- about ---------------------------------------------------------------- */

function aboutPage() {
  const base = '../../';
  const a = pages.about;
  const content = `
<div class="page page--narrow" style="padding-block:64px 80px">
  <h1 style="margin-bottom:24px">${esc(a.title)}</h1>
  <p style="font-size:20px;line-height:1.5">${esc(a.lede)}</p>
  ${a.body.map((p) => `<p>${esc(p)}</p>`).join('')}
  <hr style="border:0;border-top:1px solid var(--line);margin:40px 0">
  <h2 style="font-size:20px;margin-bottom:12px">About this mock</h2>
  <p class="muted">This is a static, fully mocked rebuild of the Laneway teaching store, made to demonstrate Amplitude and Braze working together. There is no server: the cart, customer, orders and browsing history all live in your browser's localStorage, and the storefront password is a cookie. Open the event stream at the bottom right to watch every Amplitude and Braze call as you click.</p>
</div>
`;
  return layout({
    base,
    page: 'about',
    title: a.title,
    description: a.lede,
    content,
    pageData: { name: 'About' },
  });
}

/* --- services ------------------------------------------------------------- */

function servicesPage() {
  const base = '../../';
  const s = pages.services;
  const content = `
<section class="section page">
  <div class="section-head">
    <h1 style="margin-bottom:14px">${esc(s.title)}</h1>
    <p style="font-size:17px">${esc(s.lede)}</p>
    <p style="margin-top:18px"><a class="btn" href="#enquiry" data-service-cta="Custom Collection Design">Start a project</a></p>
  </div>
</section>

<section class="section--tight page">
  <div class="section-head">
    <h2 style="font-size:20px">What we do</h2>
    <p>${esc(s.whatWeDo)}</p>
  </div>
</section>

<section class="section page">
  <div class="section-head"><h2>${esc(s.servicesHeading)}</h2></div>
  <div class="service-cards">
    ${s.items
      .map(
        (item) => `<article class="service-card">
      <h3>${esc(item.name)}</h3>
      <p class="service-card__price">${esc(item.price)}</p>
      <p>${esc(item.body)}</p>
      <p class="muted" style="font-size:13px">${esc(item.bestFor)}</p>
      <a class="btn btn--sm" href="#enquiry" data-service-cta="${esc(item.name)}">Start a project</a>
    </article>`
      )
      .join('')}
  </div>
</section>

<section class="section--tight page" data-placement="services-work">
  <div class="section-head"><h2 style="font-size:20px">Recent work</h2></div>
  <div class="grid grid--3">
    ${brandCollections
      .map(
        (c) => `<a class="tile" href="${base}collections/${c.handle}/">
      <span class="tile__media"><img src="${base}${c.image}" alt="${esc(c.title)}" loading="lazy"></span>
      <span class="tile__label">${esc(c.title)}</span>
    </a>`
      )
      .join('')}
  </div>
</section>

<section class="section page page--narrow" id="enquiry">
  <div class="section-head"><h2 style="font-size:24px">Start a project</h2><p>${esc(
    s.enquiryNote
  )}</p></div>
  <form data-enquiry novalidate>
    <div class="field-row">
      <label class="field"><span>Name</span><input name="name" autocomplete="name"></label>
      <label class="field"><span>Work email</span><input name="email" type="email" autocomplete="email"></label>
    </div>
    <div class="field-row">
      <label class="field"><span>Company</span><input name="company"></label>
      <label class="field"><span>Service</span>
        <select name="service">
          ${s.items.map((i) => `<option>${esc(i.name)}</option>`).join('')}
          <option>Not sure yet</option>
        </select>
      </label>
    </div>
    <label class="field"><span>Budget</span>
      <select name="budget">
        <option>Under $5,000</option>
        <option>$5,000 &ndash; $15,000</option>
        <option>$15,000 &ndash; $50,000</option>
        <option>Over $50,000</option>
      </select>
    </label>
    <label class="field"><span>What are you working on?</span><textarea name="message" rows="4"></textarea></label>
    <button class="btn" type="submit">Send enquiry</button>
  </form>
  <div data-enquiry-done hidden>
    <h3>Thanks &mdash; that&rsquo;s logged.</h3>
    <p class="muted">In a real setup this would create a Braze profile with <code>lead_type: b2b_enquiry</code> and fire an <code>Enquiry Submitted</code> event into Amplitude. Open the event stream to see both.</p>
  </div>
  <p class="muted" style="font-size:12px;margin-top:20px">${esc(s.disclaimer)}</p>
</section>
`;
  return layout({
    base,
    page: 'services',
    title: 'Services',
    description: s.lede,
    content,
    pageData: { name: 'Services' },
  });
}

/* --- 404 ------------------------------------------------------------------ */

/**
 * GitHub Pages serves 404.html for any missing path, at whatever depth was
 * requested, so relative asset URLs would resolve against the wrong
 * directory. This page is therefore standalone: inline styles, no shared
 * assets, and the home link is worked out at runtime from the URL.
 */
function notFoundPage() {
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found – ${esc(site.name)}</title>
<meta name="robots" content="noindex, nofollow">
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         padding:40px 16px; font:14px/1.6 Inter, -apple-system, system-ui, sans-serif;
         color:rgba(0,0,0,.81); background:#fff; text-align:center; }
  h1 { font-size:clamp(28px,5vw,44px); margin:0 0 12px; letter-spacing:-.01em; }
  p { margin:0 0 24px; }
  a { display:inline-block; padding:16px 32px; border-radius:14px;
      background:#000; color:#fff; text-decoration:none; }
</style>
</head>
<body>
<div>
  <h1>Page not found</h1>
  <p>That page doesn&rsquo;t exist in this mock.</p>
  <a id="home" href="/">Go to the storefront</a>
</div>
<script>
  // On a GitHub Pages project site everything lives under /<repo>/, so the
  // storefront root is the first path segment. At a domain root it is "/".
  (function () {
    var seg = location.pathname.split('/').filter(Boolean);
    document.getElementById('home').href = seg.length > 1 ? '/' + seg[0] + '/' : '/';
  })();
</script>
</body>
</html>
`;
}

/* --- slim client index ---------------------------------------------------- */

function indexScript() {
  const slim = products.map((p) => ({
    handle: p.handle,
    title: p.title,
    brand: p.brand,
    category: p.type,
    tier: p.tier,
    typeTag: p.typeTag,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    available: p.variants.some((v) => v.available),
    image: p.images[0] ? p.images[0].src : null,
    image2: p.images[1] ? p.images[1].src : null,
    publishedAt: p.publishedAt,
    firstVariantId: p.variants[0] ? p.variants[0].id : null,
    firstVariantTitle:
      p.variants[0] && p.variants[0].title !== 'Default Title'
        ? p.variants[0].title
        : null,
    // { Color: 'Gray', Size: 'XL' }: the same shape the product page stores
    // on a cart line, so seeded lines carry colour and size too.
    firstVariantOptions:
      p.options.length && p.variants[0]
        ? Object.fromEntries(
            p.options.map((o, i) => [o.name, p.variants[0].options[i]])
          )
        : null,
  }));
  const slimCollections = collections.map((c) => ({
    handle: c.handle,
    title: c.title,
    isBrand: c.isBrand,
    count: c.products.length,
  }));
  return (
    '/* Generated by build.mjs — slim catalogue for search, recommendations\n' +
    '   and cart lookups. Inlined as a script (not fetched) so the site also\n' +
    '   works opened straight off the filesystem. */\n' +
    'window.LANEWAY_INDEX = ' +
    JSON.stringify({ products: slim, collections: slimCollections }) +
    ';\n'
  );
}

/* --- build ---------------------------------------------------------------- */

// docs/ is regenerated from scratch, so a key pasted straight into
// docs/assets/js/config.js would be silently lost. Refuse instead.
const builtConfig = join(OUT, 'assets/js/config.js');
if (existsSync(builtConfig) && !process.argv.includes('--force')) {
  const built = readFileSync(builtConfig, 'utf8');
  const source = readFileSync('src/assets/js/config.js', 'utf8');
  if (built !== source) {
    console.error(
      'docs/assets/js/config.js differs from src/assets/js/config.js.\n' +
        'Copy your changes into src/ (the build overwrites docs/), then rebuild.\n' +
        'Run with --force to discard the docs/ version.'
    );
    process.exit(1);
  }
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

cpSync('src/assets', join(OUT, 'assets'), { recursive: true });
mkdirSync(join(OUT, 'assets/data'), { recursive: true });
writeFileSync(join(OUT, 'assets/data/index.js'), indexScript());

// Tells GitHub Pages not to run the output through Jekyll.
writeFileSync(join(OUT, '.nojekyll'), '');

// Braze web push service worker. It sits beside index.html so its scope is
// the whole site (a worker only controls its own directory and below). Its
// Braze version is read from tracking.js, since the worker and the SDK must
// match.
const brazeVersion = /web-sdk\/([\d.]+)\/braze\.min\.js/.exec(
  readFileSync('src/assets/js/tracking.js', 'utf8')
);
if (!brazeVersion) throw new Error('Braze SDK version not found in tracking.js');
writeFileSync(
  join(OUT, 'service-worker.js'),
  `self.importScripts('https://js.appboycdn.com/web-sdk/${brazeVersion[1]}/service-worker.js');\n`
);

emit('index.html', homePage());
emit('collections/index.html', collectionsIndexPage());
collections.forEach((c) =>
  emit('collections/' + c.handle + '/index.html', collectionPage(c))
);
products.forEach((p) => emit('products/' + p.handle + '/index.html', productPage(p)));
emit('cart/index.html', cartPage());
emit('checkout/index.html', checkoutPage());
emit('order/index.html', orderPage());
emit('account/index.html', accountPage());
emit('pages/about/index.html', aboutPage());
emit('pages/services/index.html', servicesPage());
emit('404.html', notFoundPage());

console.log(
  'built ' +
    (products.length + collections.length + 8) +
    ' pages into ' +
    OUT +
    '/'
);
