/**
 * Laneway Bank demo — static site generator.
 *
 *   node build.mjs
 *
 * Reads src/data/catalog.json plus src/assets/**, writes a complete static
 * site to docs/ that GitHub Pages can serve with no build step of its own.
 *
 * Every link is relative, so the same output works at a repo subpath
 * (/oktoberfest-demo/), at a domain root, and from the local filesystem.
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
const { site, pages, categories, products } = catalog;

const categoryByHandle = new Map(categories.map((c) => [c.handle, c]));
const homeLoans = products.filter((p) => p.category === 'home-loans');
const bankingCategories = categories.filter((c) => c.handle !== 'home-loans');

/* --- helpers -------------------------------------------------------------- */

const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );

const money0 = (n) =>
  '$' + Math.round(Number(n)).toLocaleString('en-AU', { maximumFractionDigits: 0 });

const pct = (n) => Number(n).toFixed(2) + '% p.a.';

// The same formula as LanewayFinance.repayment, for the static estimate on
// each loan page.
function monthlyRepayment(principal, ratePct, years) {
  const r = ratePct / 100 / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -years * 12));
}

const productPath = (p) => p.category + '/' + p.handle + '/';

function emit(path, html) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
}

/* --- derived product fields ---------------------------------------------- */

const PURPOSE_LABEL = { owner_occupier: 'Owner occupier', investor: 'Investor' };
const RATE_TYPE_LABEL = { variable: 'Variable', fixed: 'Fixed' };

// The one or two headline numbers a card and a product page lead with.
function figures(p) {
  if (p.category === 'home-loans') {
    return [
      {
        value: p.rate.toFixed(2),
        unit: '% p.a.',
        label:
          p.rateType === 'fixed'
            ? 'fixed rate, ' + p.fixedYears + ' years'
            : 'variable rate',
      },
      { value: p.comparisonRate.toFixed(2), unit: '% p.a.', label: 'comparison rate*' },
    ];
  }
  if (p.rate != null)
    return [{ value: p.rate.toFixed(2), unit: '% p.a.', label: p.rateLabel }];
  return [{ value: p.headline.value, unit: '', label: p.headline.label }];
}

function kicker(p) {
  if (p.category !== 'home-loans') return categoryByHandle.get(p.category).title;
  return [
    RATE_TYPE_LABEL[p.rateType],
    PURPOSE_LABEL[p.purpose],
    p.offset ? 'Offset' : null,
    p.firstHomeBuyer ? 'First home buyers' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Slim product record: what search, filters, recommendations, the
// calculators and the application need on the client, and what every card
// is rendered from.
function slim(p) {
  return {
    handle: p.handle,
    title: p.title,
    category: p.category,
    categoryTitle: categoryByHandle.get(p.category).title,
    tagline: p.tagline,
    path: productPath(p),
    featured: !!p.featured,
    rate: p.rate ?? null,
    comparisonRate: p.comparisonRate ?? null,
    interestOnlyRate: p.interestOnlyRate ?? null,
    rateType: p.rateType || null,
    fixedYears: p.fixedYears || null,
    purpose: p.purpose || null,
    firstHomeBuyer: !!p.firstHomeBuyer,
    repaymentTypes: p.repaymentTypes || null,
    maxLvr: p.maxLvr || null,
    offset: !!p.offset,
    annualFee: p.fees ? p.fees.annual ?? 0 : 0,
    kicker: kicker(p),
    figures: figures(p),
  };
}

const slimProducts = products.map(slim);
const slimByHandle = new Map(slimProducts.map((p) => [p.handle, p]));

/* --- icons ---------------------------------------------------------------- */

const icon = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
  user:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  doc:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  bell:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M18 16V11a6 6 0 1 0-12 0v5l-1.5 3h15L18 16Z"/><path d="M10 21h4"/></svg>',
  menu:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
};

/* --- chrome --------------------------------------------------------------- */

function wordmark(base, cls) {
  return `<span class="wordmark ${cls || ''}"><img src="${base}${site.wordmark}" alt="Laneway" width="334" height="92"><span class="wordmark__bank">Bank</span></span>`;
}

function header(base) {
  const link = (href, text) =>
    `<li><a href="${base}${href}" data-nav-link="mega">${esc(text)}</a></li>`;

  return `
<div class="announcement">${esc(site.announcement)}</div>
<header class="site-header">
  <button class="icon-btn nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Menu">${icon.menu}</button>
  <a class="site-header__logo" href="${base}index.html" aria-label="Laneway Bank home">${wordmark(base)}</a>
  <nav class="site-nav" id="site-nav" aria-label="Main">
    <div class="site-nav__item">
      <a href="${base}home-loans/" data-nav-link="header" aria-haspopup="true">Home loans</a>
      <div class="mega">
        <div>
          <p class="mega__title"><a href="${base}home-loans/">Home loans</a></p>
          <ul class="mega__list">${homeLoans.map((p) => link(productPath(p), p.title)).join('')}</ul>
        </div>
        <div>
          <p class="mega__title">Tools</p>
          <ul class="mega__list">
            ${link('calculators/borrowing-power/', 'Borrowing power calculator')}
            ${link('calculators/repayments/', 'Repayments calculator')}
            ${link('apply/', 'Apply online')}
            ${link('talk-to-us/', 'Talk to a lender')}
          </ul>
        </div>
      </div>
    </div>
    <div class="site-nav__item">
      <a href="${base}everyday/" data-nav-link="header" aria-haspopup="true">Banking</a>
      <div class="mega">
        ${bankingCategories
          .map(
            (c) => `<div>
          <p class="mega__title"><a href="${base}${c.handle}/">${esc(c.title)}</a></p>
          <ul class="mega__list">${products
            .filter((p) => p.category === c.handle)
            .map((p) => link(productPath(p), p.title))
            .join('')}</ul>
        </div>`
          )
          .join('')}
      </div>
    </div>
    <div class="site-nav__item"><a href="${base}calculators/borrowing-power/" data-nav-link="header">Calculators</a></div>
    <div class="site-nav__item"><a href="${base}talk-to-us/" data-nav-link="header">Talk to us</a></div>
    <div class="site-nav__item"><a href="${base}pages/about/" data-nav-link="header">About</a></div>
  </nav>
  <div class="site-header__actions">
    <button class="icon-btn" type="button" data-search-open aria-label="Search">${icon.search}</button>
    <button class="icon-btn" type="button" data-cards-toggle aria-label="Messages">
      ${icon.bell}<span class="badge" data-cards-count hidden>0</span>
    </button>
    <a class="icon-btn" href="${base}apply/" aria-label="Your application" data-draft-link hidden>
      ${icon.doc}<span class="badge badge--dot" data-draft-badge>1</span>
    </a>
    <a class="icon-btn" href="${base}account/" aria-label="Internet banking">${icon.user}</a>
    <a class="btn btn--sm site-header__cta" href="${base}apply/" data-apply-link data-apply-source="header">Apply now</a>
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
    <label class="visually-hidden" for="search-input">Search</label>
    <input id="search-input" type="search" placeholder="Search home loans, accounts and cards&hellip;" autocomplete="off">
  </div>
  <div class="search-results"></div>
</div>`;
}

function footer(base) {
  const list = (items) =>
    '<ul class="mega__list">' +
    items.map((i) => `<li><a href="${base}${i[0]}">${esc(i[1])}</a></li>`).join('') +
    '</ul>';
  return `
<footer class="footer">
  <div class="footer__top">
    <div>
      ${wordmark(base, 'wordmark--footer')}
      <p class="footer__note">${esc(site.footerNote)}</p>
      <p class="footer__note">${esc(site.footerNote2)}</p>
      <p><a class="link-underline" href="${base}pages/about/">[Why this exists &rarr;]</a></p>
    </div>
    <div class="newsletter">
      <h3 style="margin-bottom:6px">${esc(site.newsletterHeading)}</h3>
      <p class="muted">${esc(site.newsletterBody)}</p>
      <form data-newsletter="footer" novalidate>
        <label class="visually-hidden" for="footer-email">Email address</label>
        <input id="footer-email" type="email" placeholder="Email address" autocomplete="email" required aria-required="true">
        <button type="submit" aria-label="Subscribe">${icon.arrow}</button>
      </form>
      <p class="newsletter__msg" role="status"></p>
    </div>
    <div>
      <p class="mega__title">Home loans</p>
      ${list([
        ['home-loans/', 'Compare home loans'],
        ['calculators/borrowing-power/', 'Borrowing power'],
        ['calculators/repayments/', 'Repayments'],
        ['apply/', 'Apply online'],
      ])}
    </div>
    <div>
      <p class="mega__title">Banking</p>
      ${list(bankingCategories.map((c) => [c.handle + '/', c.title]).concat([['talk-to-us/', 'Talk to us']]))}
    </div>
  </div>
  <p class="footer__legal">${esc(site.comparisonNote)}</p>
  <div class="footer__bottom">
    <span>&copy; 2026 Laneway Bank &middot; a simulation, not a real bank</span>
    <a href="${base}pages/about/">About this site</a>
    <a href="${base}account/">Internet banking</a>
  </div>
</footer>`;
}

/* --- layout --------------------------------------------------------------- */

function layout(opts) {
  const base = opts.base;
  const title = opts.title ? opts.title + ' – ' + site.name : site.name;
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
<link rel="icon" href="${base}${site.favicon}" type="image/svg+xml">
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
<script>
  window.LANEWAY_BASE = ${JSON.stringify(base)};
  window.LANEWAY_PAGE = ${JSON.stringify(opts.pageData || {})};
</script>
<script src="${base}assets/js/config.js"></script>
<script src="${base}assets/data/index.js"></script>
<script src="${base}assets/js/store.js"></script>
<script src="${base}assets/js/finance.js"></script>
<script src="${base}assets/js/tracking.js"></script>
<script src="${base}assets/js/devtools.js"></script>
<script src="${base}assets/js/app.js"></script>
</body>
</html>
`;
}

/* --- shared blocks -------------------------------------------------------- */

// Mirrored by cardHtml() in app.js, which renders the same card on the
// client after a filter, sort or recommendation.
function productCard(p, base) {
  const s = slimByHandle.get(p.handle) || p;
  return `<article class="rate-card" data-product-card="${esc(s.handle)}">
  <p class="rate-card__kicker">${esc(s.kicker)}</p>
  <a class="rate-card__title" href="${base}${s.path}">${esc(s.title)}</a>
  <p class="rate-card__tagline">${esc(s.tagline)}</p>
  <div class="rate-card__figures">
    ${s.figures
      .map(
        (f) =>
          `<div class="figure"><span class="figure__value">${esc(f.value)}<small>${esc(
            f.unit
          )}</small></span><span class="figure__label">${esc(f.label)}</span></div>`
      )
      .join('')}
  </div>
  <a class="btn btn--sm btn--outline rate-card__cta" href="${base}${s.path}">View details</a>
</article>`;
}

function recommendationSection(base, seedHandle, heading, placement) {
  return `<section class="section page" data-placement="${esc(placement)}">
  <div class="section-head__row">
    <h2 style="font-size:20px">${esc(heading)}</h2>
    <a class="link-underline" href="${base}home-loans/">Compare home loans</a>
  </div>
  <div class="grid grid--3" data-recommend="${esc(seedHandle || '')}" data-recommend-limit="3" data-placement="${esc(placement)}"></div>
</section>`;
}

const recentlyViewedSection = () => `
<section class="section--tight page" hidden>
  <div class="section-head__row"><h2 style="font-size:20px">Recently viewed</h2></div>
  <div class="grid grid--3" data-recently-viewed data-placement="recently-viewed"></div>
</section>`;

function steps() {
  return [
    ['Apply online', 'About 20 minutes. Save as you go and come back any time.'],
    ['See where you stand', 'A conditional decision on screen as soon as you submit.'],
    ['Send your documents', 'Payslips, ID and statements, uploaded from your phone.'],
    ['Settle with a lender', 'One lender takes your loan all the way to settlement.'],
  ];
}

/* --- home ----------------------------------------------------------------- */

function homePage() {
  const base = '';
  const home = pages.home;
  const featured = products.filter((p) => p.featured);
  const lead = homeLoans
    .filter((p) => p.rateType === 'variable')
    .sort((a, b) => a.rate - b.rate)[0];

  const content = `
<section class="hero">
  <div class="hero__inner">
    <p class="eyebrow">${esc(home.heroEyebrow)}</p>
    <h1>${esc(home.heroHeading)}</h1>
    <p class="hero__sub">${esc(home.heroSub)}</p>
    <div class="hero__actions">
      <a class="btn" href="${base}home-loans/">Compare home loans</a>
      <a class="btn btn--outline" href="${base}calculators/borrowing-power/">What can I borrow?</a>
    </div>
  </div>
  <div class="hero__card" data-placement="home-hero">
    ${productCard(lead, base)}
  </div>
</section>

<section class="section page" data-placement="home-featured">
  <div class="section-head__row">
    <div class="section-head" style="margin:0">
      <h2>${esc(home.featuredHeading)}</h2>
      <p>${esc(home.featuredSub)}</p>
    </div>
    <a class="link-underline" href="${base}home-loans/">Compare all ${homeLoans.length}</a>
  </div>
  <div class="grid grid--3">
    ${featured.map((p) => productCard(p, base)).join('')}
  </div>
</section>

<section class="section--tight page">
  <div class="section-head">
    <h2>${esc(home.toolsHeading)}</h2>
    <p>${esc(home.toolsSub)}</p>
  </div>
  <div class="grid grid--2">
    <a class="tool-tile" href="${base}calculators/borrowing-power/">
      <span class="tool-tile__label">Borrowing power</span>
      <span class="tool-tile__title">How much could I borrow?</span>
      <span class="muted">Your income, your expenses and our assessment rate, in one number.</span>
      <span class="link-underline">Work it out</span>
    </a>
    <a class="tool-tile" href="${base}calculators/repayments/">
      <span class="tool-tile__label">Repayments</span>
      <span class="tool-tile__title">What would my repayments be?</span>
      <span class="muted">Weekly, fortnightly or monthly, on any of our loans.</span>
      <span class="link-underline">Work it out</span>
    </a>
  </div>
</section>

<section class="section page">
  <div class="section-head section-head--center">
    <h2>HOW APPLYING WORKS</h2>
  </div>
  <ol class="how-steps">
    ${steps()
      .map(
        (s, i) =>
          `<li><span class="how-steps__n">${i + 1}</span><strong>${esc(s[0])}</strong><span class="muted">${esc(
            s[1]
          )}</span></li>`
      )
      .join('')}
  </ol>
  <p style="text-align:center;margin-top:28px"><a class="btn" href="${base}apply/" data-apply-link data-apply-source="home_how_it_works">Start an application</a></p>
</section>

<section class="section--tight page">
  <div class="section-head">
    <h2>${esc(home.bankingHeading)}</h2>
    <p>${esc(home.bankingSub)}</p>
  </div>
  <div class="grid grid--3">
    ${bankingCategories
      .map(
        (c) => `<a class="tool-tile" href="${base}${c.handle}/">
      <span class="tool-tile__label">${esc(c.title)}</span>
      <span class="muted">${esc(c.subtitle)}</span>
      <span class="link-underline">See ${esc(c.title.toLowerCase())}</span>
    </a>`
      )
      .join('')}
  </div>
</section>
${recentlyViewedSection()}
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

/* --- category ------------------------------------------------------------- */

function categoryPage(c) {
  const base = '../';
  const items = products.filter((p) => p.category === c.handle);
  const isLoans = c.handle === 'home-loans';
  const hasRates = items.some((p) => p.rate != null);

  const pop = (id, label, boxes) => `<div class="filter-pop">
    <button class="btn--sm" type="button" data-pop-toggle="${id}"
      style="border:0;background:none;cursor:pointer;padding:6px 0">${label} &#9662;</button>
    <div class="filter-pop__panel" id="${id}" hidden>
      ${boxes
        .map(
          (b) =>
            `<label class="check"><input type="checkbox" value="${b[1]}" data-filter="${b[0]}"><span>${esc(
              b[2]
            )}</span></label>`
        )
        .join('')}
    </div>
  </div>`;

  const filters = isLoans
    ? pop('pop-purpose', 'Purpose', [
        ['purpose', 'owner_occupier', 'Owner occupier'],
        ['purpose', 'investor', 'Investor'],
      ]) +
      pop('pop-rate', 'Rate type', [
        ['rateType', 'variable', 'Variable'],
        ['rateType', 'fixed', 'Fixed'],
      ]) +
      pop('pop-features', 'Features', [
        ['offset', 'true', 'Offset account'],
        ['firstHomeBuyer', 'true', 'For first home buyers'],
      ]) +
      `<button class="btn--sm" type="button" data-filter-clear style="border:0;background:none;cursor:pointer;padding:6px 0;text-decoration:underline">Clear</button>`
    : '';

  const content = `
<div class="collection-banner page">
  <p class="eyebrow">${isLoans ? 'Compare' : 'Banking'}</p>
  <h1>${esc(c.title)}</h1>
  <p class="muted">${esc(c.subtitle)}</p>
</div>
<div class="toolbar">
  ${filters}
  <span class="toolbar__count" data-collection-count>${items.length} products</span>
  <label>
    <span class="visually-hidden">Sort by</span>
    <select data-sort>
      <option value="featured">Featured</option>
      ${hasRates ? '<option value="rate-asc">Interest rate, low to high</option>' : ''}
      ${isLoans ? '<option value="comparison-asc">Comparison rate, low to high</option>' : ''}
      ${isLoans ? '<option value="fee-asc">Annual fee, low to high</option>' : ''}
      <option value="title-asc">Name, A&ndash;Z</option>
    </select>
  </label>
</div>
<section class="section--tight page" data-placement="category-grid">
  <div class="grid grid--3" data-collection-grid>
    ${items.map((p) => productCard(p, base)).join('')}
  </div>
</section>
${
  isLoans
    ? `<section class="section--tight page">
  <div class="grid grid--2">
    <a class="tool-tile" href="${base}calculators/borrowing-power/">
      <span class="tool-tile__label">Not sure which?</span>
      <span class="tool-tile__title">Start with what you can borrow</span>
      <span class="link-underline">Borrowing power calculator</span>
    </a>
    <a class="tool-tile" href="${base}talk-to-us/">
      <span class="tool-tile__label">Rather talk it through?</span>
      <span class="tool-tile__title">A lender can come to you</span>
      <span class="link-underline">Talk to a lender</span>
    </a>
  </div>
</section>`
    : ''
}
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
        products: items.map((p) => p.handle),
      },
    },
  });
}

/* --- product -------------------------------------------------------------- */

function productPage(p) {
  const base = '../../';
  const s = slimByHandle.get(p.handle);
  const c = categoryByHandle.get(p.category);
  const isLoan = p.category === 'home-loans';

  const yesNo = (v) => (v ? 'Yes' : 'No');
  const fee = (n) => (n ? money0(n) : '$0');
  const facts = isLoan
    ? [
        ['Rate type', p.rateType === 'fixed' ? `Fixed for ${p.fixedYears} years` : 'Variable'],
        ['Interest rate', pct(p.rate)],
        ['Comparison rate*', pct(p.comparisonRate)],
        p.interestOnlyRate && ['Interest-only rate', pct(p.interestOnlyRate)],
        ['For', PURPOSE_LABEL[p.purpose]],
        ['Maximum LVR', p.maxLvr + '%'],
        ['Offset account', yesNo(p.offset)],
        ['Redraw', yesNo(p.redraw)],
        ['Application fee', fee(p.fees.application)],
        ['Annual fee', fee(p.fees.annual)],
        ['Monthly fee', fee(p.fees.monthly)],
      ].filter(Boolean)
    : [
        p.rate != null && [p.rateLabel[0].toUpperCase() + p.rateLabel.slice(1), pct(p.rate)],
        p.fees && p.fees.annual != null && ['Annual fee', fee(p.fees.annual)],
        p.fees && p.fees.monthly != null && ['Monthly account fee', fee(p.fees.monthly)],
      ].filter(Boolean);

  const example = isLoan
    ? `<p class="muted" style="font-size:13px;margin:14px 0 0">On a ${money0(600000)} loan over 30 years, that&rsquo;s about <strong>${money0(
        monthlyRepayment(600000, p.rate, 30)
      )} a month</strong>${p.rateType === 'fixed' ? ' during the fixed term' : ''}.</p>`
    : '';

  const actions = isLoan
    ? `<a class="btn btn--block" href="${base}apply/?product=${esc(p.handle)}" data-apply-link data-apply-source="product_page">Apply now</a>
    <a class="btn btn--block btn--outline" href="${base}calculators/repayments/?product=${esc(p.handle)}">Calculate repayments</a>
    <p class="muted" style="font-size:13px;margin:12px 0 0">Prefer to talk first? <a class="link-underline" href="${base}talk-to-us/">A lender can call you</a>.</p>`
    : `<button class="btn btn--block" type="button" data-register-interest>Register interest</button>
    <p class="muted" style="font-size:13px;margin:12px 0 0" data-interest-msg>Opening ${esc(
      c.title.toLowerCase()
    )} online isn&rsquo;t part of this demo. Registering interest shows how a cross-sell signal lands in Braze.</p>`;

  const content = `
<nav class="page" aria-label="Breadcrumb" style="padding-top:20px;font-size:12px">
  <a class="muted" href="${base}${c.handle}/">${esc(c.title)}</a>
  <span class="muted">/</span> <span>${esc(p.title)}</span>
</nav>

<div class="product">
  <div>
    <p class="eyebrow">${esc(s.kicker)}</p>
    <h1 class="product__title">${esc(p.title)}</h1>
    <p class="product__lede">${esc(p.tagline)}</p>

    <div class="product__figures">
      ${s.figures
        .map(
          (f) =>
            `<div class="figure figure--lg"><span class="figure__value">${esc(f.value)}<small>${esc(
              f.unit
            )}</small></span><span class="figure__label">${esc(f.label)}</span></div>`
        )
        .join('')}
    </div>

    <div class="product__description">
      <p>${esc(p.description)}</p>
      <h3>Features</h3>
      <ul class="ticks">${p.features.map((f) => `<li>${icon.check}<span>${esc(f)}</span></li>`).join('')}</ul>
      ${
        facts.length
          ? `<h3>Key facts</h3>
      <dl class="facts">${facts.map((f) => `<div><dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd></div>`).join('')}</dl>`
          : ''
      }
      ${isLoan ? `<p class="muted" style="font-size:12px;margin-top:18px">${esc(site.comparisonNote)}</p>` : ''}
    </div>
  </div>

  <aside class="product__info">
    <div class="summary">
      <p class="mega__title" style="margin-bottom:8px">${esc(p.title)}</p>
      ${s.figures
        .slice(0, 1)
        .map(
          (f) =>
            `<p class="figure"><span class="figure__value">${esc(f.value)}<small>${esc(
              f.unit
            )}</small></span><span class="figure__label">${esc(f.label)}</span></p>`
        )
        .join('')}
      ${example}
      <div class="stack" style="margin-top:18px">${actions}</div>
    </div>
  </aside>
</div>

${recommendationSection(base, p.handle, 'You might also consider', 'product-recs')}
${recentlyViewedSection()}

${
  isLoan
    ? `<div class="quick-bar">
  <span class="quick-bar__text">${esc(p.title)}<span>${esc(s.figures[0].value + s.figures[0].unit + ' ' + s.figures[0].label)}</span></span>
  <a class="btn btn--sm" href="${base}apply/?product=${esc(p.handle)}" data-apply-link data-apply-source="sticky_bar">Apply now</a>
</div>`
    : ''
}
`;

  return layout({
    base,
    page: 'product',
    title: p.title,
    description: p.tagline,
    content,
    pageData: { name: p.title, product: s },
  });
}

/* --- calculators ---------------------------------------------------------- */

const loanOptions = (selected) =>
  homeLoans
    .map(
      (p) =>
        `<option value="${esc(p.handle)}"${p.handle === selected ? ' selected' : ''}>${esc(
          p.title
        )} (${pct(p.rate)})</option>`
    )
    .join('');

const segmented = (name, options, checked) =>
  `<div class="segmented" role="radiogroup">${options
    .map(
      (o) =>
        `<label><input type="radio" name="${name}" value="${esc(o[0])}"${
          o[0] === checked ? ' checked' : ''
        }><span>${esc(o[1])}</span></label>`
    )
    .join('')}</div>`;

const moneyField = (name, label, value, hint) =>
  `<label class="field"><span>${esc(label)}</span><span class="input-money"><input name="${name}" type="number" inputmode="numeric" min="0" step="1000" value="${
    value ?? ''
  }"></span>${hint ? `<small class="muted">${esc(hint)}</small>` : ''}</label>`;

function borrowingPowerPage() {
  const base = '../../';
  const content = `
<div class="collection-banner page">
  <p class="eyebrow">Calculator</p>
  <h1>How much could I borrow?</h1>
  <p class="muted">An estimate from your income and outgoings, tested the way we&rsquo;d test a real application: at the loan&rsquo;s rate plus a 3% buffer.</p>
</div>
<div class="calc page">
  <form class="calc__form" data-calc="borrowing_power" novalidate>
    <fieldset class="field">
      <legend>Who&rsquo;s applying?</legend>
      ${segmented('applicants', [['1', 'Just me'], ['2', 'Two of us']], '1')}
    </fieldset>
    <div class="field-row">
      ${moneyField('income', 'Your income before tax, per year', 95000)}
      <div data-partner-only hidden>${moneyField('partnerIncome', 'Their income before tax, per year', 0)}</div>
    </div>
    ${moneyField('otherIncome', 'Other income per year', 0, 'Rent, dividends, a second job.')}
    <label class="field"><span>Dependants</span>
      <select name="dependants"><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option></select>
    </label>
    ${moneyField('expenses', 'Living expenses per month', 2000, 'Groceries, bills, transport, childcare. Not rent.')}
    ${moneyField('debts', 'Other loan repayments per month', 0, 'Car loans, personal loans, HECS repayments.')}
    ${moneyField('cardLimits', 'Total credit card limits', 5000, 'The limit counts, not what you owe.')}
    <label class="field"><span>Loan to test against</span><select name="product">${loanOptions('variable-home-loan')}</select></label>
  </form>
  <aside class="calc__result summary" aria-live="polite">
    <p class="mega__title">You could borrow around</p>
    <p class="calc__big" data-result="amount">&mdash;</p>
    <p class="muted" data-result="assessed"></p>
    <div class="summary__row"><span>Estimated repayments</span><strong data-result="repayment">&mdash;</strong></div>
    <div class="stack" style="margin-top:18px">
      <a class="btn btn--block" href="${base}apply/" data-calc-apply data-apply-link data-apply-source="borrowing_power_calculator">Apply with this amount</a>
      <a class="btn btn--block btn--outline" href="${base}talk-to-us/">Talk to a lender</a>
    </div>
    <p class="muted" style="font-size:12px;margin:14px 0 0">An estimate only, not an offer of credit. Assumes a ${30}-year principal and interest loan.</p>
  </aside>
</div>
`;
  return layout({
    base,
    page: 'calc-borrowing',
    title: 'Borrowing power calculator',
    description: 'Estimate how much you could borrow for a home loan.',
    content,
    pageData: { name: 'Borrowing power calculator' },
  });
}

function repaymentsPage() {
  const base = '../../';
  const content = `
<div class="collection-banner page">
  <p class="eyebrow">Calculator</p>
  <h1>What would my repayments be?</h1>
  <p class="muted">Pick a loan, an amount and how often you&rsquo;d pay.</p>
</div>
<div class="calc page">
  <form class="calc__form" data-calc="repayments" novalidate>
    ${moneyField('amount', 'Loan amount', 600000)}
    <label class="field"><span>Loan</span><select name="product">${loanOptions('variable-home-loan')}</select></label>
    <label class="field"><span>Loan term</span>
      <select name="term"><option value="30">30 years</option><option value="25">25 years</option><option value="20">20 years</option><option value="15">15 years</option></select>
    </label>
    <fieldset class="field">
      <legend>Repayments</legend>
      ${segmented('frequency', [['monthly', 'Monthly'], ['fortnightly', 'Fortnightly'], ['weekly', 'Weekly']], 'monthly')}
    </fieldset>
    <fieldset class="field" data-repayment-type>
      <legend>Repayment type</legend>
      ${segmented('repaymentType', [['principal_and_interest', 'Principal and interest'], ['interest_only', 'Interest only']], 'principal_and_interest')}
    </fieldset>
  </form>
  <aside class="calc__result summary" aria-live="polite">
    <p class="mega__title" data-result="label">Monthly repayment</p>
    <p class="calc__big" data-result="repayment">&mdash;</p>
    <p class="muted" data-result="rate"></p>
    <div class="summary__row"><span>Total interest</span><strong data-result="interest">&mdash;</strong></div>
    <div class="summary__row"><span>Total repaid</span><strong data-result="total">&mdash;</strong></div>
    <div class="stack" style="margin-top:18px">
      <a class="btn btn--block" href="${base}apply/" data-calc-apply data-apply-link data-apply-source="repayments_calculator">Apply for this loan</a>
      <a class="btn btn--block btn--outline" href="${base}calculators/borrowing-power/">How much could I borrow?</a>
    </div>
    <p class="muted" style="font-size:12px;margin:14px 0 0">An estimate only. Fixed rates revert to the variable rate after the fixed term, which this doesn&rsquo;t model.</p>
  </aside>
</div>
`;
  return layout({
    base,
    page: 'calc-repayments',
    title: 'Repayments calculator',
    description: 'Estimate your home loan repayments.',
    content,
    pageData: { name: 'Repayments calculator' },
  });
}

/* --- application ---------------------------------------------------------- */

const STATES = ['VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

function applyPage() {
  const base = '../';
  const content = `
<div class="checkout">
  <form data-apply-form novalidate>
    <ol class="steps">
      <li data-step-nav aria-current="step">1 About you</li>
      <li data-step-nav>2 The property</li>
      <li data-step-nav>3 Your finances</li>
      <li data-step-nav>4 Your loan</li>
      <li data-step-nav>5 Review</li>
    </ol>
    <p class="muted" data-resume-note hidden style="margin:-12px 0 20px">Welcome back. We saved your application where you left it.</p>

    <section class="checkout__step" data-step>
      <h1 class="step-title">About you</h1>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required aria-required="true"></label>
      <div class="field-row">
        <label class="field"><span>First name</span><input name="firstName" autocomplete="given-name"></label>
        <label class="field"><span>Last name</span><input name="lastName" autocomplete="family-name"></label>
      </div>
      <fieldset class="field"><legend>Who&rsquo;s applying?</legend>
        ${segmented('applicants', [['1', 'Just me'], ['2', 'Two of us']], '1')}
      </fieldset>
      <fieldset class="field"><legend>Is this your first home?</legend>
        ${segmented('firstHomeBuyer', [['yes', 'Yes'], ['no', 'No']], 'no')}
      </fieldset>
      <label class="check"><input type="checkbox" name="marketingOptIn" checked><span>Send me rate updates and tips on buying</span></label>
      <p class="muted" style="font-size:12px;margin-top:10px">We need your email to save the application and to send you updates on it. It&rsquo;s also what identifies you in Amplitude and Braze.</p>
      <div class="step-actions"><button class="btn" type="button" data-step-next>Continue</button></div>
    </section>

    <section class="checkout__step" data-step hidden>
      <h1 class="step-title">The property</h1>
      <fieldset class="field"><legend>What&rsquo;s the loan for?</legend>
        ${segmented('loanPurpose', [['buy_home', 'Buying a home to live in'], ['buy_investment', 'Buying an investment'], ['refinance', 'Refinancing']], 'buy_home')}
      </fieldset>
      <label class="field" data-buy-only><span>Where are you up to?</span>
        <select name="propertyStage">
          <option value="researching">Just researching</option>
          <option value="looking" selected>Looking at properties</option>
          <option value="found">Found a property</option>
          <option value="contract_signed">Signed a contract</option>
        </select>
      </label>
      <div class="field-row">
        ${moneyField('propertyValue', 'Property value', 750000)}
        <div data-buy-only>${moneyField('deposit', 'Your deposit', 150000)}</div>
        <div data-refi-only hidden>${moneyField('currentBalance', 'What you owe now', 480000)}</div>
      </div>
      <div class="field-row">
        <label class="field"><span>State</span><select name="state">${STATES.map((s) => `<option>${s}</option>`).join('')}</select></label>
        <label class="field"><span>Postcode</span><input name="postcode" inputmode="numeric" maxlength="4"></label>
      </div>
      <p class="callout" data-lvr-note></p>
      <div class="step-actions">
        <button class="btn btn--outline" type="button" data-step-back>Back</button>
        <button class="btn" type="button" data-step-next>Continue</button>
      </div>
    </section>

    <section class="checkout__step" data-step hidden>
      <h1 class="step-title">Your finances</h1>
      <label class="field"><span>Employment</span>
        <select name="employment">
          <option value="full_time">Full time</option>
          <option value="part_time">Part time</option>
          <option value="casual">Casual</option>
          <option value="self_employed">Self employed</option>
        </select>
      </label>
      <div class="field-row">
        ${moneyField('income', 'Your income before tax, per year', 120000)}
        <div data-partner-only hidden>${moneyField('partnerIncome', 'Their income before tax, per year', 0)}</div>
      </div>
      ${moneyField('otherIncome', 'Other income per year', 0)}
      <div class="field-row">
        <label class="field"><span>Dependants</span>
          <select name="dependants"><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option></select>
        </label>
        ${moneyField('expenses', 'Living expenses per month', 2000)}
      </div>
      <div class="field-row">
        ${moneyField('debts', 'Other loan repayments per month', 0)}
        ${moneyField('cardLimits', 'Total credit card limits', 5000)}
      </div>
      <p class="muted" style="font-size:12px">Your exact income stays in this browser. Amplitude and Braze get a band, like <code>$50k&ndash;$100k</code>.</p>
      <div class="step-actions">
        <button class="btn btn--outline" type="button" data-step-back>Back</button>
        <button class="btn" type="button" data-step-next>Continue</button>
      </div>
    </section>

    <section class="checkout__step" data-step hidden>
      <h1 class="step-title">Your loan</h1>
      <fieldset class="field"><legend>Choose a loan</legend>
        <div class="loan-choices" data-loan-choices></div>
      </fieldset>
      <fieldset class="field" data-repayment-type><legend>Repayment type</legend>
        ${segmented('repaymentType', [['principal_and_interest', 'Principal and interest'], ['interest_only', 'Interest only']], 'principal_and_interest')}
      </fieldset>
      <div class="field-row">
        <label class="field"><span>Loan term</span>
          <select name="term"><option value="30">30 years</option><option value="25">25 years</option><option value="20">20 years</option></select>
        </label>
        <fieldset class="field"><legend>Repayments</legend>
          ${segmented('frequency', [['monthly', 'Monthly'], ['fortnightly', 'Fortnightly'], ['weekly', 'Weekly']], 'monthly')}
        </fieldset>
      </div>
      <div class="step-actions">
        <button class="btn btn--outline" type="button" data-step-back>Back</button>
        <button class="btn" type="button" data-step-next>Review</button>
      </div>
    </section>

    <section class="checkout__step" data-step hidden>
      <h1 class="step-title">Review and submit</h1>
      <dl class="facts" data-review></dl>
      <label class="check" style="margin-top:18px"><input type="checkbox" name="creditCheckConsent" checked><span>I agree to Laneway Bank running a credit check (simulated: nothing is checked)</span></label>
      <p class="muted" style="font-size:12px;margin-top:10px">Submitting sends <code>Application Submitted</code> to Amplitude and Braze with the loan, the LVR and the instant decision. Only your email is required.</p>
      <div class="step-actions">
        <button class="btn btn--outline" type="button" data-step-back>Back</button>
        <button class="btn" type="button" data-submit-application>Submit application</button>
      </div>
    </section>
  </form>

  <aside class="summary apply-summary" aria-live="polite">
    <p class="mega__title" style="margin-bottom:12px">Your application</p>
    <div data-apply-summary></div>
    <p class="muted" style="font-size:12px;margin:14px 0 0">Saved in this browser after every step.</p>
  </aside>
</div>
`;
  return layout({
    base,
    page: 'apply',
    title: 'Apply for a home loan',
    content,
    pageData: { name: 'Home loan application' },
  });
}

function submittedPage() {
  const base = '../../';
  const content = `
<div class="page page--narrow" style="padding-block:56px 80px">
  <div data-application></div>
  <p style="margin-top:28px">
    <a class="btn" href="${base}account/">Go to internet banking</a>
    <a class="btn btn--outline" href="${base}talk-to-us/">Talk to a lender</a>
  </p>
</div>
<section class="section page" data-placement="post-application-cross-sell">
  <div class="section-head__row"><h2 style="font-size:20px">Set up the rest of your banking</h2></div>
  <div class="grid grid--3">
    ${['offset-account', 'bonus-saver', 'rewards-card']
      .map((h) => productCard(products.find((p) => p.handle === h), base))
      .join('')}
  </div>
</section>
`;
  return layout({
    base,
    page: 'submitted',
    title: 'Application submitted',
    content,
    pageData: { name: 'Application submitted' },
  });
}

/* --- account -------------------------------------------------------------- */

function accountPage() {
  const content = `<div class="auth" data-account></div>`;
  return layout({
    base: '../',
    page: 'account',
    title: 'Internet banking',
    content,
    pageData: { name: 'Internet banking' },
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
  <p class="muted">This is a static site with no server. The application in progress, submitted applications, the customer and browsing history all live in your browser's localStorage, and the session id is a cookie. Open the event stream at the bottom right to watch every Amplitude and Braze call as you click.</p>
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

/* --- talk to us ----------------------------------------------------------- */

function talkPage() {
  const base = '../';
  const t = pages.talk;
  const content = `
<section class="section page">
  <div class="section-head">
    <p class="eyebrow">Talk to us</p>
    <h1 style="margin-bottom:14px">${esc(t.title)}</h1>
    <p style="font-size:17px">${esc(t.lede)}</p>
  </div>
</section>

<section class="section--tight page">
  <div class="section-head"><h2 style="font-size:20px">${esc(t.optionsHeading)}</h2></div>
  <div class="service-cards">
    ${t.items
      .map(
        (item) => `<article class="service-card">
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.body)}</p>
      <p class="muted" style="font-size:13px">${esc(item.bestFor)}</p>
      <a class="btn btn--sm" href="#request" data-contact-cta="${esc(item.method)}">Choose ${esc(item.name.toLowerCase())}</a>
    </article>`
      )
      .join('')}
  </div>
</section>

<section class="section page page--narrow" id="request">
  <div class="section-head"><h2 style="font-size:24px">Ask a lender to get in touch</h2><p>${esc(t.formNote)}</p></div>
  <form data-enquiry novalidate>
    <div class="field-row">
      <label class="field"><span>Name</span><input name="name" autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required aria-required="true"></label>
    </div>
    <div class="field-row">
      <label class="field"><span>What&rsquo;s it about?</span>
        <select name="topic">
          <option value="first_home">Buying my first home</option>
          <option value="next_home">Buying my next home</option>
          <option value="refinance">Refinancing</option>
          <option value="investing">Investing</option>
          <option value="my_application">My application</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label class="field"><span>How should we get in touch?</span>
        <select name="method">
          ${t.items.map((i) => `<option value="${esc(i.method)}">${esc(i.name)}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="field"><span>Best time</span>
      <select name="time"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select>
    </label>
    <label class="field"><span>Anything we should know?</span><textarea name="message" rows="4"></textarea></label>
    <button class="btn" type="submit">Send request</button>
  </form>
  <div data-enquiry-done hidden>
    <h3>Thanks. That&rsquo;s logged.</h3>
    <p class="muted">This sends <code>Lender Callback Requested</code> to Amplitude and Braze, and tags the Braze profile with <code>lead_type: home_loan_enquiry</code>. Open the event stream to see both.</p>
  </div>
  <p class="muted" style="font-size:12px;margin-top:20px">${esc(t.disclaimer)}</p>
</section>
`;
  return layout({
    base,
    page: 'talk',
    title: 'Talk to a lender',
    description: t.lede,
    content,
    pageData: { name: 'Talk to a lender' },
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
  <p>That page doesn&rsquo;t exist at Laneway Bank.</p>
  <a id="home" href="/">Go to Laneway Bank</a>
</div>
<script>
  // On a GitHub Pages project site everything lives under /<repo>/, so the
  // site root is the first path segment. At a domain root it is "/".
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
  return (
    '/* Generated by build.mjs — slim catalogue for search, recommendations,\n' +
    '   the calculators and the application. Inlined as a script (not\n' +
    '   fetched) so the site also works opened straight off the filesystem. */\n' +
    'window.LANEWAY_INDEX = ' +
    JSON.stringify({
      products: slimProducts,
      categories: categories.map((c) => ({ handle: c.handle, title: c.title })),
    }) +
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

const built = [
  ['index.html', homePage()],
  ...categories.map((c) => [c.handle + '/index.html', categoryPage(c)]),
  ...products.map((p) => [productPath(p) + 'index.html', productPage(p)]),
  ['calculators/borrowing-power/index.html', borrowingPowerPage()],
  ['calculators/repayments/index.html', repaymentsPage()],
  ['apply/index.html', applyPage()],
  ['apply/submitted/index.html', submittedPage()],
  ['account/index.html', accountPage()],
  ['talk-to-us/index.html', talkPage()],
  ['pages/about/index.html', aboutPage()],
  ['404.html', notFoundPage()],
];
built.forEach(([path, html]) => emit(path, html));

console.log('built ' + built.length + ' pages into ' + OUT + '/');
