/* ==========================================================================
   Laneway Bank synthetic data: the behaviour model.

   Turns config.mjs into Amplitude events, shaped exactly as the site sends
   them (see TRACKING.md): the same event names, properties, user properties
   and context, plus what the Browser SDK autocaptures ([Amplitude] Page
   Viewed, session_start and session_end, form interactions, UTM
   attribution) and the Braze email events Currents would add.

   The home loan application is the main journey. Around it: people who
   leave straight away, browsers who search, filter and come back days
   later, lead forms, internet banking customers, and the odd things people
   do mid-application (going back a step, leaving the tab open, finishing
   on a different device).

   It reuses the site's own lending maths (src/assets/js/finance.js) and
   loan catalogue (src/data/catalog.json), so borrowing power, decisions
   and rates match what the real site would produce.

   Each visitor gets their own seeded random stream, so changing one
   visitor's behaviour doesn't reshuffle everyone after them.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* --- the site's own code and data ---------------------------------------- */

function loadSite() {
  const window = {};
  vm.runInNewContext(readFileSync('src/assets/js/config.js', 'utf8'), { window });
  vm.runInNewContext(readFileSync('src/assets/js/finance.js', 'utf8'), { window });
  const catalog = JSON.parse(readFileSync('src/data/catalog.json', 'utf8'));
  return { siteConfig: window.LANEWAY_CONFIG, finance: window.LanewayFinance, catalog };
}

const { siteConfig, finance, catalog } = loadSite();
export { siteConfig };

const PRODUCTS = new Map(catalog.products.map((p) => [p.handle, p]));
const HOME_LOANS = catalog.products.filter((p) => p.category === 'home-loans');
const CATEGORY = new Map(catalog.categories.map((c) => [c.handle, c]));
const productPath = (p) => p.category + '/' + p.handle + '/';

// Mirrors kicker() in build.mjs: the line search matches against.
function kickerOf(p) {
  if (p.category !== 'home-loans') return CATEGORY.get(p.category).title;
  return [
    p.rateType === 'fixed' ? 'Fixed' : 'Variable',
    p.purpose === 'investor' ? 'Investor' : 'Owner occupier',
    p.offset ? 'Offset' : null,
    p.firstHomeBuyer ? 'First home buyers' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Mirrors productProps() in src/assets/js/tracking.js.
function productProps(handle) {
  const p = PRODUCTS.get(handle);
  if (!p) return {};
  const props = { product_id: p.handle, product_name: p.title, product_category: p.category };
  if (p.rate != null) props.interest_rate = p.rate;
  if (p.comparisonRate != null) props.comparison_rate = p.comparisonRate;
  if (p.rateType) props.rate_type = p.rateType;
  if (p.fixedYears) props.fixed_years = p.fixedYears;
  if (p.purpose) props.loan_purpose_type = p.purpose;
  return props;
}

// Mirrors search() in src/assets/js/app.js.
function search(query) {
  const needle = query.trim().toLowerCase();
  return catalog.products
    .map((p) => {
      const title = p.title.toLowerCase();
      const hay = [p.title, kickerOf(p), CATEGORY.get(p.category).title, p.tagline].join(' ').toLowerCase();
      let score = 0;
      if (title.startsWith(needle)) score += 5;
      if (title.includes(needle)) score += 3;
      if (hay.includes(needle)) score += 1;
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.p);
}

// Mirrors recommend() in src/assets/js/app.js.
function recommend(seedHandle, viewed, limit = 3) {
  const seed = PRODUCTS.get(seedHandle) || PRODUCTS.get(viewed[0]);
  const pool = catalog.products.filter((p) => p !== seed);
  if (!seed) return pool.filter((p) => p.featured).slice(0, limit);
  return pool
    .map((p) => {
      let score = 0;
      if (p.category === seed.category) score += 3;
      if (p.purpose && p.purpose === seed.purpose) score += 2;
      if (p.rateType && p.rateType === seed.rateType) score += 1;
      if (seed.offset && p.handle === 'offset-account') score += 4;
      if (seed.firstHomeBuyer && p.handle === 'bonus-saver') score += 3;
      if (p.rate != null && seed.rate != null && p.category === seed.category)
        score -= Math.min(2, Math.abs(p.rate - seed.rate) * 2);
      if (viewed.includes(p.handle)) score -= 2;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.p);
}

// Mirrors STEPS, STEP_NEEDS and progressProps() in src/assets/js/app.js.
const STEPS = ['about_you', 'property', 'income', 'expenses', 'loan', 'review'];
const STEP_NEEDS = {
  about_you: 'Your contact details',
  property: 'The property and your deposit',
  income: 'Your income and employment',
  expenses: 'Your monthly expenses and any other debts',
  loan: 'Your choice of loan and repayments',
  review: 'A final check, and your OK for a credit check',
};

function progressProps(next) {
  const done = STEPS.slice(0, next);
  const left = STEPS.slice(next);
  return {
    application_step: left[0] || 'submitted',
    application_steps_completed: done,
    application_steps_remaining: left.length,
    application_percent_complete: Math.round((done.length / STEPS.length) * 100),
    application_info_needed: left.map((k) => STEP_NEEDS[k]),
  };
}

const TITLE = {
  'index.html': 'Laneway Bank',
  'landing/': 'Package Home Loan with 100% offset – Laneway Bank',
  'home-loans/': 'Home loans – Laneway Bank',
  'everyday/': 'Everyday accounts – Laneway Bank',
  'savings/': 'Savings – Laneway Bank',
  'credit-cards/': 'Credit cards – Laneway Bank',
  'calculators/borrowing-power/': 'Borrowing power calculator – Laneway Bank',
  'calculators/repayments/': 'Repayments calculator – Laneway Bank',
  'apply/': 'Apply for a home loan – Laneway Bank',
  'apply/submitted/': 'Application submitted – Laneway Bank',
  'account/': 'Internet banking – Laneway Bank',
  'talk-to-us/': 'Talk to a lender – Laneway Bank',
  'pages/about/': 'About Laneway Bank – Laneway Bank',
};

/* --- random numbers ------------------------------------------------------ */

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed) {
    this.r = mulberry32(seed);
  }
  next() {
    return this.r();
  }
  chance(p) {
    return this.next() < p;
  }
  between(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.between(a, b + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  // Skewed towards the low end, with a long tail: most people come back
  // soon, a few much later.
  skewed(a, b) {
    return a + (b - a) * Math.pow(this.next(), 2.2);
  }
  weighted(items, weightOf = (x) => x.weight) {
    const total = items.reduce((s, x) => s + weightOf(x), 0);
    let r = this.next() * total;
    for (const x of items) {
      r -= weightOf(x);
      if (r <= 0) return x;
    }
    return items[items.length - 1];
  }
  weightedKey(obj) {
    return this.weighted(Object.keys(obj), (k) => obj[k]);
  }
  hex(n) {
    let s = '';
    while (s.length < n) s += Math.floor(this.next() * 16).toString(16);
    return s;
  }
  uuid() {
    return [this.hex(8), this.hex(4), '4' + this.hex(3), '8' + this.hex(3), this.hex(12)].join('-');
  }
}

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/* --- local time ---------------------------------------------------------- */

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function makeClock(timezone) {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = (ms) => Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const offset = (ms) => {
    const p = parts(ms);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
  };
  return {
    // A local date and hour (fractional) as a UTC timestamp, DST included.
    at(date, hours) {
      const [y, m, d] = date.split('-').map(Number);
      const naive = Date.UTC(y, m - 1, d) + hours * HOUR;
      const first = naive - offset(naive - 10 * HOUR);
      return naive - offset(first);
    },
    hourOf(ms) {
      return +parts(ms).hour;
    },
    dateOf(ms) {
      const p = parts(ms);
      return `${p.year}-${p.month}-${p.day}`;
    },
  };
}

function* days(start, end) {
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/* --- names --------------------------------------------------------------- */

const FIRST = ['Olivia', 'Jack', 'Mia', 'Noah', 'Charlotte', 'Liam', 'Isla', 'Oliver', 'Amelia', 'Leo', 'Ava', 'Henry',
  'Grace', 'Lucas', 'Chloe', 'Ethan', 'Zara', 'Arjun', 'Priya', 'Wei', 'Mei', 'Hiroshi', 'Sofia', 'Mateo', 'Aisha',
  'Omar', 'Fatima', 'Nikos', 'Eleni', 'Luca', 'Giulia', 'Tom', 'Sam', 'Alex', 'Jordan', 'Riley', 'Harper', 'Kai',
  'Ruby', 'Hamish', 'Ngaio', 'Tane', 'Linh', 'Minh', 'Anh', 'Daniel', 'Hannah', 'Ben', 'Lily', 'Josh', 'Emily',
  'Sienna', 'Archie', 'Matilda', 'Oscar', 'Frankie', 'Ivy', 'Rahul', 'Ananya', 'Jin', 'Soo-ah'];
const LAST = ['Smith', 'Nguyen', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Johnson', 'White', 'Martin', 'Anderson',
  'Thompson', 'Tran', 'Le', 'Kelly', 'Walker', 'Harris', 'Ryan', 'Robinson', 'Patel', 'Singh', 'Chen', 'Wang', 'Li',
  'Zhang', 'Kim', 'Park', 'Papadopoulos', 'Rossi', 'Russo', 'Costa', 'Murphy', "O'Brien", 'Campbell', 'Stewart',
  'Mitchell', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Ali', 'Khan',
  'Haddad', 'Sato', 'Tanaka', 'Fernandes', 'Silva', 'Novak', 'Kowalski', 'Jensen', 'Larsen', 'Morgan'];
// Reserved domains: nothing sent to these addresses can reach a real inbox.
const DOMAINS = ['example.com', 'example.net', 'example.org'];

/* --- the generator ------------------------------------------------------- */

export function generate(cfg) {
  const clock = makeClock(cfg.timezone);
  const endMs = clock.at(cfg.end, 24) - 1;
  const launchMs = clock.at(cfg.braze.launch, 10);
  const base = new URL(cfg.site);
  const sitePath = base.pathname;
  const B = cfg.behaviour;
  const events = [];
  const stats = { visitors: 0, sessions: 0 };

  const startDay = new Date(cfg.start + 'T00:00:00Z');
  const bandOf = (n) => finance.loanBand(n);

  /* --- one visitor ------------------------------------------------------ */

  function pickDevice(rng, mobile) {
    return rng.weighted(cfg.devices[mobile ? 'mobile' : 'desktop']);
  }

  function visitor(index) {
    const rng = new Rng(hash(`${cfg.seed}:${index}`));
    const channel = rng.weighted(cfg.channels);
    const mobile = rng.chance(channel.mobileShare);
    const persona = rng.weighted(cfg.personas);
    const first = rng.pick(FIRST);
    const last = rng.pick(LAST);
    const slug = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
    const v = {
      index,
      rng,
      channel,
      mobile,
      device: pickDevice(rng, mobile),
      place: rng.weighted(cfg.locations),
      persona,
      deviceId: rng.uuid(),
      userId: null,
      intent: Math.exp(rng.between(-0.5, 0.4)),
      first,
      last,
      email: `${slug(first)}.${slug(last)}${index}@${rng.pick(DOMAINS)}`,
      seq: 0,
      app: null,
      viewed: [],
      speedRunner: rng.chance(B.speedRunner),
    };
    v.profile = profile(v);
    return v;
  }

  // A different phone or laptop: new device id, same person.
  function switchDevice(v) {
    v.mobile = !v.mobile;
    v.device = pickDevice(v.rng, v.mobile);
    v.deviceId = v.rng.uuid();
  }

  function profile(v) {
    const { rng, persona: p } = v;
    const couple = rng.chance(p.couple);
    const value = Math.round(rng.between(...p.propertyValue) / 5000) * 5000;
    const purpose = p.name === 'refinancer' ? 'refinance' : p.name === 'investor' ? 'buy_investment' : 'buy_home';
    const share = rng.between(...p.depositShare);
    const deposit = Math.round((value * share) / 1000) * 1000;
    const balance = Math.round((value * (1 - share)) / 1000) * 1000;
    return {
      couple,
      firstHomeBuyer: p.name === 'first_home_buyer',
      purpose,
      stage: rng.weightedKey({ researching: 10, looking: 45, found: 30, contract_signed: 15 }),
      value,
      deposit,
      balance,
      loanAmount: purpose === 'refinance' ? balance : value - deposit,
      income: Math.round(rng.between(...p.income) / 1000) * 1000,
      partnerIncome: couple ? Math.round((rng.between(...p.income) * 0.75) / 1000) * 1000 : 0,
      otherIncome: rng.chance(0.2) ? rng.int(5, 30) * 1000 : 0,
      dependants: Number(rng.weightedKey({ 0: 50, 1: 22, 2: 20, 3: 8 })),
      expenses: Math.round(rng.between(...p.expenses) / 50) * 50,
      debts: rng.chance(0.35) ? rng.int(2, 12) * 50 : 0,
      cardLimits: Number(rng.weightedKey({ 0: 20, 5000: 35, 10000: 25, 20000: 15, 30000: 5 })),
      employment: rng.weightedKey({ full_time: 68, part_time: 11, casual: 5, self_employed: 16 }),
      marketingOptIn: rng.chance(0.68),
      repaymentType: p.name === 'investor' && rng.chance(0.4) ? 'interest_only' : 'principal_and_interest',
      term: rng.chance(0.85) ? 30 : 25,
      frequency: rng.weightedKey({ monthly: 60, fortnightly: 30, weekly: 10 }),
      product: rng.weightedKey(p.products),
    };
  }

  /* --- sessions and events ---------------------------------------------- */

  function session(v, at, entry) {
    stats.sessions += 1;
    // Amplitude's session_id is the session's start time in whole ms.
    const start = Math.round(at);
    const s = { v, t: start, id: start, key: 'sess_' + start.toString(36) + v.rng.hex(6), pageCounter: 0, path: '', rel: '', ended: false };
    const attribution = {};
    if (entry && entry.utm) {
      attribution.$set = Object.assign({}, entry.utm);
      attribution.$setOnce = Object.fromEntries(Object.entries(entry.utm).map(([k, val]) => ['initial_' + k, val]));
    }
    if (entry && entry.referrer) {
      const host = new URL(entry.referrer).hostname;
      attribution.$set = Object.assign(attribution.$set || {}, { referrer: entry.referrer, referring_domain: host });
      attribution.$setOnce = Object.assign(attribution.$setOnce || {}, { initial_referrer: entry.referrer, initial_referring_domain: host });
    }
    emit(s, 'session_start', {}, Object.keys(attribution).length ? attribution : null);
    return s;
  }

  function emit(s, type, props, userProps, at) {
    const v = s.v;
    const e = {
      event_type: type,
      device_id: v.deviceId,
      time: Math.round(at || s.t),
      session_id: s.id,
      insert_id: eventId(v),
      platform: 'Web',
      os_name: v.device.os_name,
      os_version: v.device.os_version,
      device_model: v.device.device_model,
      language: 'en-AU',
      country: 'Australia',
      region: v.place.region,
      city: v.place.city,
      event_properties: props,
    };
    if (v.userId) e.user_id = v.userId;
    if (userProps) e.user_properties = userProps;
    if (e.time <= endMs) events.push(e);
  }

  // Events added on top of data that's already been sent (the Canvas
  // layer, Darren) take ids in their own namespace, so the ids of
  // everything already sent never move.
  const eventId = (v) => `ldg-${cfg.seed}-${v.index}-${v.idPrefix ? v.idPrefix + '-' : ''}${v.seq++}`;

  const wait = (s, a, b) => (s.t += s.v.rng.between(a, b) * MIN);
  const secs = (s, a, b) => (s.t += s.v.rng.between(a, b) * 1000);

  // Links on the site are relative, so the href Navigation Clicked reports
  // depends on how deep the current page is.
  const relativeHref = (s, to) => '../'.repeat(s.rel.split('/').filter((x) => x && x !== 'index.html').length) + to;

  function page(s, path, query) {
    s.rel = path;
    s.path = sitePath + (path === 'index.html' ? '' : path);
    s.pageCounter += 1;
    const url = base.origin + s.path;
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    emit(s, '[Amplitude] Page Viewed', {
      '[Amplitude] Page Counter': s.pageCounter,
      '[Amplitude] Page Domain': base.hostname,
      '[Amplitude] Page Location': url + qs,
      '[Amplitude] Page Path': s.path,
      '[Amplitude] Page Title': TITLE[path] || productTitle(path),
      '[Amplitude] Page URL': url,
    });
    secs(s, 2, 8);
  }

  function productTitle(path) {
    const p = PRODUCTS.get(path.split('/').filter(Boolean).pop());
    return p ? p.title + ' – Laneway Bank' : 'Laneway Bank';
  }

  // The site's track(): context properties on every event.
  function track(s, name, props, userProps) {
    const v = s.v;
    emit(
      s,
      name,
      Object.assign(
        {
          session_id: s.key,
          signed_in: !!v.userId,
          application_in_progress: !!(v.app && !v.app.submitted),
          page_path: s.path,
          currency: 'AUD',
        },
        props
      ),
      userProps ? { $set: userProps } : null
    );
    secs(s, 1, 4);
  }

  // Amplitude form autocapture. The site's forms have no id, name or
  // action, so the destination is the page itself.
  function form(s, kind) {
    if (!B.formAutocapture) return;
    emit(s, '[Amplitude] Form ' + kind, { '[Amplitude] Form Destination': base.origin + s.path });
  }

  function end(s) {
    if (s.ended) return;
    s.ended = true;
    emit(s, 'session_end', {});
  }

  function identity(v, extra) {
    v.userId = v.email;
    return Object.assign(
      {
        email: v.email,
        first_name: v.first,
        last_name: v.last,
        marketing_opt_in: v.profile.marketingOptIn,
        existing_customer: v.channel.name === 'existing_customer',
        has_home_loan: false,
      },
      extra
    );
  }

  /* --- page actions, as the site fires them ------------------------------ */

  function nav(s, label, to, location) {
    track(s, 'Navigation Clicked', { label, destination: relativeHref(s, to), location: location || 'header' });
    page(s, to);
  }

  function productPage(s, handle, via) {
    const v = s.v;
    const p = PRODUCTS.get(handle);
    if (via && via.placement) {
      track(s, 'Product Card Clicked', Object.assign({ placement: via.placement, position: via.position || 1 }, productProps(handle)));
    }
    page(s, productPath(p));
    v.viewed = [handle].concat(v.viewed.filter((h) => h !== handle)).slice(0, 12);
    track(s, 'Product Viewed', productProps(handle), { last_product_viewed: p.title, last_category_viewed: CATEGORY.get(p.category).title });
    const recs = recommend(handle, v.viewed);
    track(s, 'Recommendations Shown', { seed_product_id: handle, placement: 'product-recs', product_ids: recs.map((x) => x.handle) });
    secs(s, 15, 120);
    if (v.rng.chance(0.4)) track(s, 'Product Detail Read', productProps(handle));
    return recs;
  }

  function listPage(s, category) {
    const v = s.v;
    const c = CATEGORY.get(category);
    let list = catalog.products.filter((p) => p.category === category);
    track(s, 'Product List Viewed', {
      category: c.title,
      category_handle: c.handle,
      product_count: list.length,
      product_ids: list.map((p) => p.handle),
    });
    secs(s, 8, 50);
    if (category === 'home-loans' && v.rng.chance(B.filterOrSort)) {
      if (v.rng.chance(0.55)) {
        const sort = v.rng.weightedKey({ 'rate-asc': 55, 'comparison-asc': 25, 'fee-asc': 10, 'title-asc': 10 });
        const key = { 'rate-asc': 'rate', 'comparison-asc': 'comparisonRate', 'fee-asc': 'fee', 'title-asc': 'title' }[sort];
        list = list.slice().sort((a, b) =>
          key === 'title' ? a.title.localeCompare(b.title) : key === 'fee' ? a.fees.annual - b.fees.annual : a[key] - b[key]
        );
        track(s, 'Product List Sorted', { category: c.title, sort_by: sort, results_count: list.length, product_ids: list.map((p) => p.handle) });
      }
      if (v.rng.chance(0.6)) {
        const investor = v.persona.name === 'investor';
        const purpose = v.rng.chance(0.7) ? [investor ? 'investor' : 'owner_occupier'] : [];
        const rateType = v.rng.chance(0.4) ? [v.rng.chance(0.6) ? 'variable' : 'fixed'] : [];
        const features = v.rng.chance(0.35) ? [v.profile.firstHomeBuyer && v.rng.chance(0.6) ? 'first_home_buyer' : 'offset'] : [];
        const shown = list.filter(
          (p) =>
            (!purpose.length || purpose.includes(p.purpose)) &&
            (!rateType.length || rateType.includes(p.rateType)) &&
            (!features.includes('offset') || p.offset) &&
            (!features.includes('first_home_buyer') || p.firstHomeBuyer)
        );
        track(s, 'Product List Filtered', {
          category: c.title,
          purpose,
          rate_type: rateType,
          features,
          results_count: shown.length,
          product_ids: shown.map((p) => p.handle),
        });
        if (shown.length) list = shown;
      }
    }
    return list;
  }

  // Opens search, types a query (sometimes in two goes), maybe clicks a
  // result. Returns the product it went to, if any.
  function useSearch(s) {
    const v = s.v;
    track(s, 'Search Opened', {});
    const query = v.rng.weightedKey(B.searchQueries);
    // Typing pauses long enough mid-word for a partial query to log.
    if (query.length > 5 && v.rng.chance(0.3)) {
      const partial = query.slice(0, v.rng.int(3, query.length - 2));
      const hits = search(partial);
      track(s, 'Search Performed', { query: partial, results_count: hits.length, product_ids: hits.map((p) => p.handle) });
    }
    secs(s, 2, 8);
    const hits = search(query);
    track(s, 'Search Performed', { query, results_count: hits.length, product_ids: hits.map((p) => p.handle) });
    if (hits.length && v.rng.chance(B.searchClick)) {
      const position = v.rng.chance(0.7) ? 1 : v.rng.int(1, hits.length);
      const hit = hits[position - 1];
      track(s, 'Search Result Clicked', Object.assign({ query, position }, productProps(hit.handle)));
      productPage(s, hit.handle);
      return hit;
    }
    secs(s, 3, 15);
    return null;
  }

  function borrowingCalculator(s) {
    const v = s.v;
    const pr = v.profile;
    form(s, 'Started');
    const runs = v.rng.chance(B.calculatorFiddle) ? v.rng.int(3, 7) : v.rng.int(1, 2);
    let last = 0;
    for (let i = 0; i < runs; i++) {
      wait(s, 0.4, 2.5);
      // A fiddler tries things: a pay rise, a partner, no expenses at all.
      const silly = i > 0 && v.rng.chance(0.35);
      const income = silly ? v.rng.pick([1000000, 30000, pr.income * 2, 250000]) : pr.income;
      const couple = i > 0 && v.rng.chance(0.2) ? !pr.couple : pr.couple;
      const expenses = silly && v.rng.chance(0.5) ? 0 : pr.expenses;
      const power = finance.borrowingPower({
        applicants: couple ? 2 : 1,
        income,
        partnerIncome: couple ? pr.partnerIncome || pr.income * 0.7 : 0,
        otherIncome: pr.otherIncome,
        dependants: pr.dependants,
        expenses,
        debts: pr.debts,
        cardLimits: pr.cardLimits,
        rate: 5.84,
      });
      const band = finance.incomeBand(income + (couple ? pr.partnerIncome : 0));
      track(
        s,
        'Borrowing Power Calculated',
        Object.assign(
          {
            applicant_count: couple ? 2 : 1,
            dependants: pr.dependants,
            income_band: band,
            borrowing_power: power,
            estimated_repayment: Math.round(finance.repayment(power, 5.84, 30, 'monthly')),
          },
          productProps('variable-home-loan')
        ),
        { borrowing_power: power, income_band: band }
      );
      last = power;
    }
    return last;
  }

  function repaymentsCalculator(s) {
    const v = s.v;
    form(s, 'Started');
    const runs = v.rng.chance(B.calculatorFiddle) ? v.rng.int(3, 6) : v.rng.int(1, 2);
    for (let i = 0; i < runs; i++) {
      wait(s, 0.3, 2);
      const handle = i === 0 ? v.profile.product : v.rng.pick(HOME_LOANS).handle;
      const p = PRODUCTS.get(handle);
      const amount = i === 0 ? Math.round(v.profile.loanAmount / 10000) * 10000 : v.rng.int(20, 200) * 10000;
      const years = v.rng.weighted([{ y: 30, weight: 70 }, { y: 25, weight: 20 }, { y: 20, weight: 10 }]).y;
      const frequency = v.rng.weightedKey({ monthly: 60, fortnightly: 30, weekly: 10 });
      const type = p.interestOnlyRate && v.rng.chance(0.3) ? 'interest_only' : 'principal_and_interest';
      const rate = type === 'interest_only' ? p.interestOnlyRate : p.rate;
      track(
        s,
        'Repayments Calculated',
        Object.assign(
          {
            loan_amount: amount,
            loan_amount_band: bandOf(amount),
            loan_term_years: years,
            repayment_frequency: frequency,
            repayment_type: type,
            repayment: Math.round(finance.repayment(amount, rate, years, frequency, type)),
          },
          productProps(handle),
          { interest_rate: rate }
        )
      );
    }
  }

  // Accounts, savings, cards: browsed, occasionally registered interest in.
  function otherProducts(s) {
    const v = s.v;
    const category = v.rng.pick(['everyday', 'savings', 'credit-cards']);
    nav(s, CATEGORY.get(category).title, category + '/', 'mega');
    const list = listPage(s, category);
    const pick = v.rng.int(1, list.length);
    productPage(s, list[pick - 1].handle, { placement: 'category-grid', position: pick });
    if (v.rng.chance(0.12)) {
      const p = list[pick - 1];
      track(s, 'Product Interest Registered', productProps(p.handle), { interested_product: p.title });
    }
  }

  // Rings a lender instead of finishing online.
  function talkToLender(s, topic) {
    const v = s.v;
    nav(s, 'Talk to us', 'talk-to-us/');
    secs(s, 10, 60);
    const method = v.rng.weightedKey({ phone: 55, video: 25, mobile_lender: 20 });
    if (v.rng.chance(0.6)) track(s, 'Contact Method Chosen', { contact_method: method });
    if (!v.rng.chance(0.7)) return; // looked, didn't ask
    form(s, 'Started');
    wait(s, 0.5, 3);
    form(s, 'Submitted');
    const who = identity(v, { marketing_opt_in: true, lead_type: 'home_loan_enquiry', enquiry_topic: topic });
    track(s, 'Lender Callback Requested', {
      topic,
      contact_method: method,
      preferred_time: v.rng.weightedKey({ morning: 30, afternoon: 35, evening: 35 }),
      message_length: v.rng.chance(0.5) ? v.rng.int(20, 400) : 0,
    }, who);
  }

  // Footer rate updates: the push prompt comes first, inside the click.
  function rateUpdates(s) {
    const v = s.v;
    const p = B.push;
    if (v.rng.chance(p.prompted)) {
      track(s, 'Push Permission Requested', { source: 'rate_updates' });
      secs(s, 1, 6);
      const r = v.rng.next();
      if (r < p.granted) track(s, 'Push Permission Granted', { source: 'rate_updates' });
      else if (r < p.granted + p.denied) track(s, 'Push Permission Denied', { source: 'rate_updates', permission: 'denied' });
      else track(s, 'Push Permission Denied', { source: 'rate_updates', permission: 'default' });
    }
    form(s, 'Submitted');
    v.profile.marketingOptIn = true;
    track(s, 'Rate Updates Subscribed', { email: v.email, source: 'footer' }, identity(v, { marketing_opt_in: true }));
  }

  /* --- the first visit --------------------------------------------------- */

  function firstVisit(v, start) {
    const s = session(v, start, { utm: v.channel.utm, referrer: v.channel.referrer });
    if (v.channel.landing === 'landing/') return landingVisit(s);
    if (v.channel.landing === 'account/') return customerVisit(s);
    return browseVisit(s, 1);
  }

  // Bits of background any visit can pick up before leaving.
  function wander(s) {
    const v = s.v;
    if (v.rng.chance(B.otherProducts)) otherProducts(s);
    if (v.rng.chance(B.rateUpdates)) rateUpdates(s);
    if (!v.userId && v.rng.chance(B.register)) {
      nav(s, 'Internet banking', 'account/');
      form(s, 'Submitted');
      const who = identity(v);
      track(s, 'Account Created', { email: v.email, method: 'email' }, who);
    }
  }

  function landingVisit(s) {
    const v = s.v;
    const { rng } = v;
    const utm = v.channel.utm || {};
    page(s, 'landing/', utm);
    track(s, 'Product Viewed', Object.assign({ page_type: 'landing' }, utm, productProps('package-home-loan')), {
      last_product_viewed: 'Package Home Loan',
      last_category_viewed: 'Home loans',
    });
    if (rng.chance(B.bounce.landing)) {
      secs(s, 3, 40);
      end(s);
      return 'bounced';
    }
    secs(s, 15, 70);
    if (rng.chance(0.5)) {
      // Some slide the offset slider back and forth for a while.
      const runs = rng.chance(B.calculatorFiddle) ? rng.int(3, 6) : 1;
      form(s, 'Started');
      for (let i = 0; i < runs; i++) {
        const loan = i === 0 ? Math.round(v.profile.loanAmount / 10000) * 10000 : rng.int(20, 200) * 10000;
        const offset = rng.int(0, 60) * 5000;
        const saved = finance.offsetSavings(loan, offset, PRODUCTS.get('package-home-loan').rate, 30);
        const extra = (loan * (5.94 - 5.84)) / 100 + 395;
        track(
          s,
          'Offset Savings Calculated',
          Object.assign(
            {
              loan_amount: loan,
              loan_amount_band: bandOf(loan),
              offset_balance: offset,
              interest_saved_first_year: Math.round(saved.firstYear),
              interest_saved_total: Math.round(saved.interestSaved),
              months_sooner: saved.monthsSooner,
              package_beats_variable: saved.firstYear - extra >= 0,
              page_type: 'landing',
            },
            utm,
            productProps('package-home-loan')
          ),
          { estimated_offset_saving: Math.round(saved.firstYear), offset_balance: offset }
        );
        secs(s, 5, 40);
      }
    }
    const faqs = rng.chance(0.22) ? rng.int(1, 3) : 0;
    for (let i = 0; i < faqs; i++) {
      const faq = rng.weighted([
        { weight: 30, q: 'What is an offset account?', n: 1 },
        { weight: 35, q: 'Is the $395 annual fee worth it?', n: 2 },
        { weight: 15, q: 'Can I switch from another bank?', n: 3 },
        { weight: 10, q: 'What is the comparison rate?', n: 4 },
        { weight: 10, q: 'How long does applying take?', n: 5 },
      ]);
      track(s, 'FAQ Opened', { question: faq.q, position: faq.n, page_type: 'landing' });
      secs(s, 8, 40);
    }
    if (rng.chance(0.5)) track(s, 'Product Detail Read', Object.assign({ page_type: 'landing' }, productProps('package-home-loan')));
    if (rng.chance(0.14)) track(s, 'Landing CTA Clicked', Object.assign({ cta: 'hero_savings' }, utm));

    const startP = cfg.funnel.landingStart * v.channel.startFactor * v.intent;
    if (rng.chance(startP)) {
      // Most landing page applicants stay with the Package.
      if (rng.chance(cfg.funnel.landingPackageBias)) v.profile.product = 'package-home-loan';
      const source = rng.weightedKey({ landing_hero: 44, landing_calculator: 26, landing_sticky: 18, landing_header: 7, landing_footer: 5 });
      return startApplication(s, v, source, utm, 'package-home-loan');
    }
    if (rng.chance(0.04)) {
      talkToLender(s, v.profile.purpose === 'refinance' ? 'refinance' : 'next_home');
    } else if (rng.chance(0.15)) {
      // The landing page has no menu: the logo is the way into the site.
      page(s, 'index.html');
      return browseVisit(s, 1, true);
    }
    end(s);
    return 'browsed';
  }

  // A look around the site. `warmth` > 1 on return visits: more likely to
  // apply this time.
  function browseVisit(s, warmth, arrived) {
    const v = s.v;
    const { rng } = v;
    if (!arrived) page(s, 'index.html');
    if (!arrived && rng.chance(B.bounce.home)) {
      secs(s, 3, 30);
      end(s);
      return 'bounced';
    }
    secs(s, 5, 40);
    let source = null;
    if (rng.chance(B.search)) {
      const hit = useSearch(s);
      if (hit && hit.category === 'home-loans') source = 'product_page';
    }
    if (rng.chance(0.62)) {
      // From the home page: the featured cards, or the menu.
      if (rng.chance(0.3)) {
        const featured = catalog.products.filter((p) => p.featured);
        const position = rng.int(1, featured.length);
        productPage(s, featured[position - 1].handle, { placement: 'home-featured', position });
      } else {
        nav(s, 'Home loans', 'home-loans/');
        const list = listPage(s, 'home-loans');
        const looks = rng.int(1, 3);
        for (let i = 0; i < looks; i++) {
          const handle = i === 0 && list.some((p) => p.handle === v.profile.product) ? v.profile.product : rng.pick(list).handle;
          const position = Math.max(1, list.findIndex((p) => p.handle === handle) + 1);
          const recs = productPage(s, handle, { placement: i === 0 ? 'category-grid' : 'product-recs', position });
          if (i + 1 < looks && rng.chance(0.4)) {
            productPage(s, recs[0].handle, { placement: 'product-recs', position: 1 });
            break;
          }
        }
      }
      source = rng.chance(0.75) ? 'product_page' : 'header';
    }
    if (rng.chance(0.3)) {
      nav(s, 'Calculators', 'calculators/borrowing-power/');
      borrowingCalculator(s);
      source = 'borrowing_power_calculator';
    }
    if (rng.chance(B.repaymentsCalculator)) {
      nav(s, 'Repayments calculator', 'calculators/repayments/', 'mega');
      repaymentsCalculator(s);
      source = source || 'repayments_calculator';
    }
    if (rng.chance(0.03)) nav(s, 'About', 'pages/about/');

    const startP = cfg.funnel.browseStart * v.channel.startFactor * v.intent * warmth * (source ? 1.6 : 0.5);
    if (rng.chance(startP)) {
      return startApplication(s, v, source || 'header', v.channel.utm && s.pageCounter <= 2 ? v.channel.utm : {}, source === 'product_page' ? v.profile.product : null);
    }
    if (rng.chance(B.talkToLender.browser)) talkToLender(s, v.profile.firstHomeBuyer ? 'first_home' : 'next_home');
    wander(s);
    end(s);
    return 'browsed';
  }

  function customerVisit(s) {
    const v = s.v;
    const { rng } = v;
    page(s, 'account/');
    form(s, 'Submitted');
    const who = identity(v, { existing_customer: true, has_home_loan: rng.chance(0.3) });
    track(s, 'Signed In', { email: v.email, method: 'email' }, who);
    wait(s, 1, 5);
    const c = B.customer;
    if (rng.chance(c.unsubscribe)) {
      track(s, 'Email Subscription Stopped', { source: 'internet_banking' }, { marketing_opt_in: false });
    } else if (!v.profile.marketingOptIn && rng.chance(c.subscribe)) {
      track(s, 'Email Subscription Started', { source: 'internet_banking' }, { marketing_opt_in: true });
    }
    if (rng.chance(0.5)) otherProducts(s);
    if (rng.chance(cfg.funnel.browseStart * v.channel.startFactor * 2)) {
      nav(s, 'Apply now', 'apply/');
      return startApplication(s, v, 'header', {}, null, true);
    }
    if (rng.chance(c.signOut)) {
      page(s, 'account/');
      track(s, 'Signed Out', { email: v.email });
    }
    end(s);
    return 'browsed';
  }

  /* --- the application --------------------------------------------------- */

  function figures(v) {
    const pr = v.profile;
    const product = PRODUCTS.get(pr.product);
    const rate = pr.repaymentType === 'interest_only' && product.interestOnlyRate ? product.interestOnlyRate : product.rate;
    const power = finance.borrowingPower({
      applicants: pr.couple ? 2 : 1,
      income: pr.income,
      partnerIncome: pr.partnerIncome,
      otherIncome: pr.otherIncome,
      dependants: pr.dependants,
      expenses: pr.expenses,
      debts: pr.debts,
      cardLimits: pr.cardLimits,
      rate: product.rate,
    });
    return {
      product,
      rate,
      power,
      lvr: finance.lvr(pr.loanAmount, pr.value),
      repayment: finance.repayment(pr.loanAmount, rate, pr.term, pr.frequency, pr.repaymentType),
    };
  }

  function startApplication(s, v, source, campaign, preProduct, onPage, ease) {
    v.app = {
      id: 'LB' + (100000 + (hash(`${cfg.seed}:app:${v.idPrefix ? v.idPrefix + ':' : ''}${v.index}:${v.seq}`) % 900000)),
      startedAt: s.t,
      updatedAt: s.t,
      source,
      campaign: campaign || {},
      step: 0,
      submitted: false,
    };
    const query = Object.assign({ source }, preProduct ? { product: preProduct } : {}, campaign);
    if (!onPage) page(s, 'apply/', query);
    track(
      s,
      'Application Started',
      Object.assign({ application_id: v.app.id, source }, campaign, productProps(preProduct)),
      Object.assign(
        {
          application_status: 'started',
          application_id: v.app.id,
          application_started_at: new Date(s.t).toISOString(),
          application_resume_url: base.origin + sitePath + 'apply/',
        },
        progressProps(0),
        preProduct ? { application_product: PRODUCTS.get(preProduct).title, application_product_id: preProduct } : {}
      )
    );
    form(s, 'Started');
    return steps(s, v, 0, ease || 1);
  }

  // Chance of finishing a step. `ease` < 1 raises it, for people who came
  // back to finish.
  function stepChance(v, key, ease) {
    const f = cfg.funnel;
    let p = f.steps[key] * v.channel.stepFactor;
    if (v.mobile && f.mobile[key]) p *= f.mobile[key];
    if (f.bigLoan && v.profile.loanAmount >= f.bigLoan.over && f.bigLoan[key]) p *= f.bigLoan[key];
    return Math.min(0.995, Math.pow(Math.min(1, p), ease));
  }

  function steps(s, v, from, ease) {
    const { rng } = v;
    const speed = v.speedRunner ? 0.15 : 1;
    for (let i = from; i < STEPS.length; i++) {
      const key = STEPS[i];
      const [a, b] = cfg.funnel.stepMinutes[key].map((m) => m * speed);
      if (!rng.chance(stepChance(v, key, ease))) {
        // Gives up on this step: lingers, then leaves. Some of them ring
        // a lender on the way out.
        const h = cfg.funnel.hesitationFactor;
        wait(s, a * h * 0.5, b * h);
        v.app.step = i;
        v.app.updatedAt = s.t;
        v.app.abandonedAt = s.t;
        if (i >= 2 && rng.chance(B.talkToLender.abandoner)) talkToLender(s, 'my_application');
        end(s);
        return 'abandoned';
      }
      // Wanders off with the tab open: the next click is a new session.
      if (rng.chance(B.idleMidApplication)) {
        const path = s.path;
        const rel = s.rel;
        end(s);
        s = session(v, s.t + rng.between(...B.idleMinutes) * MIN, null);
        s.path = path;
        s.rel = rel;
      }
      wait(s, a, b);
      if (i === STEPS.length - 1) {
        submit(s, v);
        return 'submitted';
      }
      stage(s, v, i);
      v.app.step = i + 1;
      v.app.updatedAt = s.t;
      // Goes back to check the last step, changes something, carries on:
      // both stage events fire again, as they do on the site.
      if (i >= 1 && i < 5 && rng.chance(B.stepBack)) {
        wait(s, 0.3, 2);
        if (i === 1) v.profile.deposit = Math.round(v.profile.deposit * rng.between(0.85, 1.2) / 1000) * 1000;
        stage(s, v, i - 1);
        wait(s, 0.3, 2);
        stage(s, v, i);
      }
    }
    return 'submitted';
  }

  // The stage events, as logStage() in src/assets/js/app.js sends them.
  function stage(s, v, i) {
    const pr = v.profile;
    if (pr.purpose !== 'refinance') pr.loanAmount = pr.value - pr.deposit;
    const fig = figures(v);
    const id = { application_id: v.app.id };
    const progress = progressProps(i + 1);
    if (i === 0) {
      const who = identity(v, { phone_provided: true, first_home_buyer: pr.firstHomeBuyer });
      track(s, 'Applicant Details Entered', Object.assign({}, id, {
        applicant_count: pr.couple ? 2 : 1,
        first_home_buyer: pr.firstHomeBuyer,
        email_provided: true,
        phone_provided: true,
        marketing_opt_in: pr.marketingOptIn,
      }), Object.assign(who, progress));
    } else if (i === 1) {
      track(s, 'Property Details Entered', Object.assign({}, id, {
        loan_purpose: pr.purpose,
        property_stage: pr.purpose === 'refinance' ? null : pr.stage,
        property_value_band: bandOf(pr.value),
        loan_amount: pr.loanAmount,
        lvr: fig.lvr,
        state: v.place.state,
      }), Object.assign({
        loan_purpose: pr.purpose,
        loan_amount: pr.loanAmount,
        loan_amount_band: bandOf(pr.loanAmount),
        lvr: fig.lvr,
      }, progress));
    } else if (i === 2) {
      const band = finance.incomeBand(pr.income + pr.partnerIncome);
      track(s, 'Income Entered', Object.assign({}, id, {
        employment_type: pr.employment,
        income_band: band,
        applicant_count: pr.couple ? 2 : 1,
        other_income: pr.otherIncome > 0,
      }), Object.assign({ income_band: band, employment_type: pr.employment }, progress));
    } else if (i === 3) {
      track(s, 'Expenses Entered', Object.assign({}, id, {
        dependants: pr.dependants,
        has_other_debts: pr.debts > 0,
        borrowing_power: fig.power,
        within_borrowing_power: pr.loanAmount <= fig.power,
      }), Object.assign({ borrowing_power: fig.power }, progress));
    } else if (i === 4) {
      track(s, 'Loan Selected', Object.assign({}, id, productProps(pr.product), {
        interest_rate: fig.rate,
        repayment_type: pr.repaymentType,
        loan_term_years: pr.term,
        repayment_frequency: pr.frequency,
        estimated_repayment: Math.round(fig.repayment),
      }), Object.assign({ application_product: fig.product.title, application_product_id: pr.product }, progress));
    }
  }

  function documentsFor(v) {
    const pr = v.profile;
    const docs = ['photo_id', pr.employment === 'self_employed' ? 'tax_returns' : 'payslips', 'bank_statements'];
    if (pr.purpose === 'refinance') docs.push('loan_statement');
    else if (['found', 'contract_signed'].includes(pr.stage)) docs.push('contract_of_sale');
    return docs;
  }

  function submit(s, v) {
    const pr = v.profile;
    const fig = figures(v);
    const reasons = [];
    if (pr.loanAmount > fig.power) reasons.push('above_borrowing_power');
    if (fig.lvr > fig.product.maxLvr) reasons.push('above_max_lvr');
    const decision = reasons.length ? 'referred_to_lender' : 'conditionally_approved';
    const docs = documentsFor(v);
    v.app.submitted = true;
    v.app.submittedAt = s.t;
    track(s, 'Application Submitted', Object.assign({
      application_id: v.app.id,
      source: v.app.source,
      decision,
      decision_reasons: reasons,
      loan_purpose: pr.purpose,
      first_home_buyer: pr.firstHomeBuyer,
      applicant_count: pr.couple ? 2 : 1,
      loan_amount: pr.loanAmount,
      loan_amount_band: bandOf(pr.loanAmount),
      property_value_band: bandOf(pr.value),
      lvr: fig.lvr,
      borrowing_power: fig.power,
      repayment_type: pr.repaymentType,
      loan_term_years: pr.term,
      repayment_frequency: pr.frequency,
      estimated_repayment: Math.round(fig.repayment),
      minutes_to_submit: Math.round((s.t - v.app.startedAt) / MIN),
    }, v.app.campaign, productProps(pr.product), { interest_rate: fig.rate }), Object.assign(progressProps(STEPS.length), {
      application_status: decision,
      application_id: v.app.id,
      application_submitted_at: new Date(s.t).toISOString(),
      application_product: fig.product.title,
      application_product_id: pr.product,
      documents_outstanding: docs.length,
    }));
    form(s, 'Submitted');
    page(s, 'apply/submitted/', { id: v.app.id });
    v.app.docs = docs;
    v.app.uploaded = [];
    const { rng } = v;
    if (rng.chance(cfg.documents.uploadSameSession)) upload(s, v, rng.int(1, docs.length));
    // Referred applicants often want to talk it through.
    if (decision === 'referred_to_lender' && rng.chance(0.18)) talkToLender(s, 'my_application');
    end(s);
    if (v.app.uploaded.length < docs.length && rng.chance(cfg.documents.uploadLater)) {
      const later = session(v, s.t + rng.skewed(...cfg.documents.laterHours) * HOUR, { utm: null, referrer: null });
      page(later, 'apply/submitted/', { id: v.app.id });
      upload(later, v, docs.length);
      end(later);
    }
  }

  function upload(s, v, n) {
    const left = v.app.docs.filter((d) => !v.app.uploaded.includes(d));
    for (const d of left.slice(0, n)) {
      secs(s, 20, 90);
      v.app.uploaded.push(d);
      const outstanding = v.app.docs.length - v.app.uploaded.length;
      track(s, 'Document Uploaded', { application_id: v.app.id, document_type: d, documents_outstanding: outstanding },
        Object.assign({ documents_outstanding: outstanding }, outstanding ? {} : { application_status: 'documents_received' }));
    }
  }

  /* --- coming back --------------------------------------------------------- */

  function resume(v, at, utm, ease) {
    const s = session(v, at, { utm, referrer: null });
    page(s, 'apply/', utm || undefined);
    track(s, 'Application Resumed', Object.assign({
      application_id: v.app.id,
      step: STEPS[v.app.step],
      step_number: v.app.step + 1,
      minutes_since_saved: Math.round((at - v.app.updatedAt) / MIN),
    }, utm || {}), { application_last_resumed_at: new Date(at).toISOString() });
    return steps(s, v, v.app.step, ease);
  }

  // Back, but on another device: the saved application isn't there, so
  // they start again from step 1 under the same email.
  function restartElsewhere(v, at, utm, ease) {
    switchDevice(v);
    v.userId = null; // anonymous on the new device until step 1
    const s = session(v, at, { utm, referrer: utm ? null : 'https://www.google.com/' });
    if (utm) {
      page(s, 'apply/', utm);
    } else {
      page(s, 'index.html');
      secs(s, 5, 20);
      nav(s, 'Apply now', 'apply/');
    }
    return startApplication(s, v, utm ? 'email_link' : 'header', utm || {}, v.profile.product, true, ease);
  }

  // Braze Currents events: on the user, outside any session.
  function brazeEvent(v, type, at, extra) {
    if (at > endMs) return;
    events.push({
      event_type: type,
      user_id: v.email,
      time: Math.round(at),
      session_id: -1,
      insert_id: eventId(v),
      event_properties: Object.assign({ campaign_name: cfg.braze.campaign, source: 'braze' }, extra),
    });
  }

  // Next send slot at or after `t`: Braze sends 8am–8pm local.
  function sendSlot(t, rng) {
    let slot = Math.max(t, launchMs);
    const h = clock.hourOf(slot);
    if (h < 8 || h >= 20) {
      const date = clock.dateOf(h >= 20 ? slot + 6 * HOUR : slot);
      slot = clock.at(date, 9 + rng.next() * 2);
    }
    return slot;
  }

  const UTM_EMAIL = (n) => ({
    utm_source: 'braze',
    utm_medium: 'email',
    utm_campaign: 'high_value_application_abandoners',
    utm_content: n === 1 ? 'reminder_1' : 'reminder_2',
  });

  // Returns when (if at all) an email brings them back.
  function email(v, at, n) {
    const { rng } = v;
    const b = cfg.braze;
    const e = b.events;
    const props = { message: 'reminder_' + n, step: STEPS[v.app.step], application_product_id: v.profile.product };
    brazeEvent(v, e.sent, at, props);
    if (!rng.chance(b.delivered)) return null;
    brazeEvent(v, e.delivered, at + rng.between(0.2, 2) * MIN, props);
    if (!rng.chance(n === 1 ? b.opened : b.secondOpened)) return null;
    const opened = at + rng.skewed(3, 600) * MIN;
    brazeEvent(v, e.opened, opened, props);
    if (!rng.chance(n === 1 ? b.clicked : b.secondClicked)) return null;
    const clicked = opened + rng.between(0.3, 4) * MIN;
    brazeEvent(v, e.clicked, clicked, Object.assign({ url: base.origin + sitePath + 'apply/' }, props));
    return rng.chance(b.resumeAfterClick) ? clicked + rng.between(0.1, 0.6) * MIN : null;
  }

  function afterAbandoning(v) {
    const { rng } = v;
    const app = v.app;
    const d = cfg.dropouts;
    const b = cfg.braze;
    const natural = rng.chance(d.returnOnOwn) ? app.abandonedAt + rng.skewed(...d.returnHours) * HOUR : null;

    // Once someone has been through the campaign (emailed or held out),
    // abandoning again doesn't put them through it a second time.
    const eligible = !app.inCohort && v.userId && (app.step === 2 || app.step === 3) && v.profile.loanAmount >= b.minLoan;
    const recent = app.abandonedAt >= launchMs - b.lookbackDays * DAY;
    let sendAt = eligible && recent ? sendSlot(app.abandonedAt + rng.between(...b.delayHours) * HOUR, rng) : null;
    if (sendAt && natural && natural < sendAt) sendAt = null; // came back before the email
    if (sendAt && sendAt > endMs) sendAt = null;

    if (sendAt) {
      app.inCohort = true;
      if (rng.chance(b.controlGroup)) {
        app.control = true;
        brazeEvent(v, 'Campaign Control Group Entered', sendAt, { message: 'reminder_1' });
      } else {
        app.emailed = true;
        let back = email(v, sendAt, 1);
        let utm = UTM_EMAIL(1);
        if (!back && b.secondEmailHours) {
          const second = sendSlot(sendAt + b.secondEmailHours * HOUR, rng);
          if (second <= endMs && !(natural && natural < second)) {
            back = email(v, second, 2);
            utm = UTM_EMAIL(2);
          }
        }
        if (back && !(natural && natural < back)) {
          // Opened on the phone, started on the laptop (or the reverse).
          if (rng.chance(B.emailOnOtherDevice)) return restartElsewhere(v, back, utm, b.resumeEase);
          return resume(v, back, utm, b.resumeEase);
        }
      }
    }
    if (natural && natural <= endMs) {
      if (rng.chance(B.deviceSwitch)) return restartElsewhere(v, natural, null, d.resumeEase);
      return resume(v, natural, null, d.resumeEase);
    }
    return 'abandoned';
  }

  /* --- the First Home Loan Canvas (Akshin's Braze journey) -------------- */

  // A layer on top of everything above. It runs after a visitor's own
  // story is finished, on its own random stream and its own event ids, so
  // switching it on adds events without changing any that were already
  // generated (or sent).
  const C = cfg.canvas;
  const canvasLaunch = C && clock.at(C.launch, 0);

  function layer(v, name, fn) {
    const saved = { rng: v.rng, seq: v.seq, prefix: v.idPrefix };
    v.rng = new Rng(hash(`${cfg.seed}:${name}:${v.index}`));
    v.seq = 0;
    v.idPrefix = name;
    try {
      return fn();
    } finally {
      Object.assign(v, { rng: saved.rng, seq: saved.seq, idPrefix: saved.prefix });
    }
  }

  // Braze's own events as its Amplitude export (Currents) sends them: on the
  // user, outside any site session.
  function currents(v, key, at, step, extra) {
    if (at > endMs) return;
    events.push({
      event_type: C.events[key],
      user_id: v.email,
      time: Math.round(at),
      session_id: -1,
      insert_id: eventId(v),
      event_properties: Object.assign(
        {
          canvas_name: C.name,
          canvas_variation_name: v.app.control ? 'Control' : 'Variant 1',
          source: 'braze',
        },
        step ? { canvas_step_name: step } : {},
        extra
      ),
    });
  }

  // Braze sends between 8am and 8pm local.
  function sendWindow(t, rng) {
    const h = clock.hourOf(t);
    if (h >= 8 && h < 20) return t;
    const date = clock.dateOf(h >= 20 ? t + 6 * HOUR : t);
    return clock.at(date, 8 + rng.next() * 2);
  }

  const UTM_CANVAS = (medium, content) => ({
    utm_source: 'braze',
    utm_medium: medium,
    utm_campaign: C.utmCampaign,
    utm_content: content,
  });

  // Back on the site from a message: the application resumes, Braze's
  // welcome-back modal shows (the site logs In-App Message Shown, Braze logs
  // its own view and click), and they carry on.
  function backFromMessage(v, at, utm) {
    if (at > endMs) return 'abandoned';
    if (v.rng.chance(B.emailOnOtherDevice)) return restartElsewhere(v, at, utm, C.resumeEase);
    const s = session(v, at, { utm, referrer: null });
    page(s, 'apply/', utm);
    track(s, 'Application Resumed', Object.assign({
      application_id: v.app.id,
      step: STEPS[v.app.step],
      step_number: v.app.step + 1,
      minutes_since_saved: Math.round((at - v.app.updatedAt) / MIN),
    }, utm), { application_last_resumed_at: new Date(at).toISOString() });
    secs(s, 2, 6);
    track(s, 'In-App Message Shown', { message_id: null, source: 'braze' });
    currents(v, 'inAppViewed', s.t, C.steps.inApp);
    if (v.rng.chance(C.inApp.clicked)) {
      secs(s, 3, 15);
      currents(v, 'inAppClicked', s.t, C.steps.inApp);
    }
    return steps(s, v, v.app.step, C.resumeEase);
  }

  function canvasJourney(v) {
    const { rng } = v;
    const app = v.app;
    const enterAt = app.abandonedAt + rng.between(...C.entryDelayHours) * HOUR;
    if (enterAt > endMs) return;
    app.canvas = true;
    app.control = rng.chance(C.controlGroup);
    currents(v, 'entered', enterAt, null, { in_control_group: app.control });

    // Someone in either arm may still come back by themselves.
    const natural = rng.chance(C.naturalReturn) ? enterAt + rng.skewed(...C.naturalReturnHours) * HOUR : null;
    let back = null;
    let utm = null;

    if (!app.control) {
      const emailAt = sendWindow(enterAt + rng.between(...C.emailDelayHours) * HOUR, rng);
      if (!(natural && natural < emailAt)) {
        currents(v, 'emailSent', emailAt, C.steps.email);
        if (rng.chance(C.email.delivered)) {
          currents(v, 'emailDelivered', emailAt + rng.between(0.2, 2) * MIN, C.steps.email);
          if (rng.chance(C.email.opened)) {
            const opened = emailAt + rng.skewed(3, 480) * MIN;
            currents(v, 'emailOpened', opened, C.steps.email);
            if (rng.chance(C.email.clicked)) {
              const clicked = opened + rng.between(0.3, 4) * MIN;
              currents(v, 'emailClicked', clicked, C.steps.email, { url: base.origin + sitePath + 'apply/' });
              if (rng.chance(C.resumeAfterClick)) {
                back = clicked + rng.between(0.1, 0.6) * MIN;
                utm = UTM_CANVAS('email', 'finish_application');
              }
            }
          }
        }
        // No click on the email: SMS the next day. A few reply, and the
        // conversational agent hands them to a lender.
        if (!back) {
          const smsAt = sendWindow(emailAt + C.smsAfterHours * HOUR, rng);
          if (smsAt <= endMs && !(natural && natural < smsAt)) {
            currents(v, 'smsSent', smsAt, C.steps.sms);
            if (rng.chance(C.sms.delivered)) {
              currents(v, 'smsDelivered', smsAt + rng.between(0.1, 1) * MIN, C.steps.sms);
              if (rng.chance(C.sms.clicked)) {
                const clicked = smsAt + rng.skewed(1, 240) * MIN;
                currents(v, 'smsClicked', clicked, C.steps.sms);
                if (rng.chance(C.resumeAfterClick)) {
                  back = clicked + rng.between(0.1, 0.6) * MIN;
                  utm = UTM_CANVAS('sms', 'finish_application');
                }
              } else if (rng.chance(C.sms.replied)) {
                const replied = smsAt + rng.skewed(2, 180) * MIN;
                currents(v, 'smsInbound', replied, C.steps.sms, { message_category: rng.pick(['question_rates', 'question_application', 'question_documents']) });
                if (rng.chance(C.agent.backAfterHandoff)) {
                  back = replied + rng.between(...C.agent.backHours) * HOUR;
                  utm = UTM_CANVAS('sms', 'agent_handoff');
                }
              }
            }
          }
        }
      }
    }

    let outcome = 'abandoned';
    if (back && !(natural && natural < back)) outcome = backFromMessage(v, back, utm);
    else if (natural && natural <= endMs) outcome = resume(v, natural, null, cfg.dropouts.resumeEase);
    if (outcome === 'submitted' && v.app.submittedAt) currents(v, 'converted', v.app.submittedAt + rng.between(1, 30) * 1000, null);
  }

  function canvasEligible(v) {
    const app = v.app;
    return (
      C && C.enabled && app && !app.submitted && !app.inCohort && v.userId &&
      v.profile.firstHomeBuyer && (app.step === 2 || app.step === 3) &&
      app.abandonedAt >= canvasLaunch
    );
  }

  /* --- Darren Whitlock --------------------------------------------------- */

  // The user Akshin's Braze journey is built around: a first home buyer who
  // stopped at step 4 of a First Home Loan application on his phone, three
  // steps from the end. His timeline is scripted relative to the demo date
  // so that, on the day, his history shows every message and the finished
  // application.
  function darren() {
    const D = cfg.darren;
    const index = 9000001;
    const rng = new Rng(hash(`${cfg.seed}:darren`));
    const v = {
      index,
      rng,
      channel: cfg.channels.find((c) => c.name === 'organic_search'),
      mobile: true,
      device: cfg.devices.mobile[0],
      place: { city: 'Wagga Wagga', region: 'New South Wales', state: 'NSW' },
      persona: cfg.personas.find((p) => p.name === 'first_home_buyer'),
      deviceId: rng.uuid(),
      userId: null,
      intent: 1,
      first: D.firstName,
      last: D.lastName,
      email: D.email,
      seq: 0,
      idPrefix: 'darren',
      app: null,
      viewed: [],
      speedRunner: false,
    };
    v.profile = Object.assign(profile(v), D.profile);
    const day = (n, h) => clock.at(clock.dateOf(clock.at(D.demoDate, 12) + n * DAY), h);

    // 1. Hears an ad on a podcast and visits. Searches the bank's site for
    //    beard oil, then craft beer (nothing, both times), then finally
    //    "first home": reads about the First Home Loan, runs the borrowing
    //    power calculator, leaves.
    const podcast = D.arrival;
    let s = session(v, day(-9, 19.6), { utm: podcast, referrer: null });
    page(s, 'index.html', podcast);
    secs(s, 10, 30);
    track(s, 'Search Opened', {});
    for (const query of D.searches) {
      const hits = search(query);
      secs(s, 3, 9);
      track(s, 'Search Performed', { query, results_count: hits.length, product_ids: hits.map((p) => p.handle) });
      if (hits.some((p) => p.handle === 'first-home-loan')) {
        const position = hits.findIndex((p) => p.handle === 'first-home-loan') + 1;
        track(s, 'Search Result Clicked', Object.assign({ query, position }, productProps('first-home-loan')));
        productPage(s, 'first-home-loan');
        break;
      }
    }
    nav(s, 'Calculators', 'calculators/borrowing-power/');
    borrowingCalculator(s);
    end(s);

    // 2. Comes back on his phone and starts applying. Gets through About
    //    you, the property and his income, then stalls on expenses.
    s = session(v, day(-6, 20.25), { utm: null, referrer: null });
    page(s, 'index.html');
    productPage(s, 'first-home-loan', { placement: 'home-featured', position: 3 });
    v.app = null;
    const enter = { source: 'product_page' };
    v.app = {
      id: D.applicationId,
      startedAt: s.t,
      updatedAt: s.t,
      source: enter.source,
      campaign: {},
      step: 0,
      submitted: false,
    };
    page(s, 'apply/', { source: 'product_page', product: 'first-home-loan' });
    track(s, 'Application Started', Object.assign({ application_id: v.app.id, source: 'product_page' }, productProps('first-home-loan')),
      Object.assign({
        application_status: 'started',
        application_id: v.app.id,
        application_started_at: new Date(s.t).toISOString(),
        application_resume_url: base.origin + sitePath + 'apply/',
        application_product: 'First Home Loan',
        application_product_id: 'first-home-loan',
      }, progressProps(0)));
    form(s, 'Started');
    for (let i = 0; i < 3; i++) {
      wait(s, ...cfg.funnel.stepMinutes[STEPS[i]]);
      stage(s, v, i);
      v.app.step = i + 1;
    }
    wait(s, 9, 14); // stares at the expenses screen, then puts the phone down
    v.app.updatedAt = s.t;
    v.app.abandonedAt = s.t;
    end(s);

    // 3. The Canvas: enters an hour later; the email is opened but not
    //    clicked; the SMS next morning gets a reply, the agent answers his
    //    question about rates and hands him to a lender.
    const C2 = C.steps;
    const at = (n, h) => day(n, h);
    v.app.control = false;
    currents(v, 'entered', at(-6, 21.4), null, { in_control_group: false });
    currents(v, 'emailSent', at(-5, 10.05), C2.email);
    currents(v, 'emailDelivered', at(-5, 10.07), C2.email);
    currents(v, 'emailOpened', at(-5, 12.7), C2.email);
    currents(v, 'smsSent', at(-4, 10.0), C2.sms);
    currents(v, 'smsDelivered', at(-4, 10.01), C2.sms);
    currents(v, 'smsInbound', at(-4, 10.3), C2.sms, { message_category: 'question_application' });
    currents(v, 'smsInbound', at(-4, 10.38), C2.sms, { message_category: 'question_rates' });
    currents(v, 'smsInbound', at(-4, 10.45), C2.sms, { message_category: 'request_human' });
    currents(v, 'smsClicked', at(-3, 19.1), C2.sms);

    // 4. Taps the link in the SMS that evening: the application is where
    //    he left it, the welcome-back modal shows, and he finishes.
    const utm = UTM_CANVAS('sms', 'agent_handoff');
    s = session(v, at(-3, 19.12), { utm, referrer: null });
    page(s, 'apply/', utm);
    track(s, 'Application Resumed', Object.assign({
      application_id: v.app.id,
      step: STEPS[v.app.step],
      step_number: v.app.step + 1,
      minutes_since_saved: Math.round((s.t - v.app.updatedAt) / MIN),
    }, utm), { application_last_resumed_at: new Date(s.t).toISOString() });
    secs(s, 3, 5);
    track(s, 'In-App Message Shown', { message_id: null, source: 'braze' });
    currents(v, 'inAppViewed', s.t, C2.inApp);
    secs(s, 6, 10);
    currents(v, 'inAppClicked', s.t, C2.inApp);
    for (let i = 3; i < 5; i++) {
      wait(s, ...cfg.funnel.stepMinutes[STEPS[i]]);
      stage(s, v, i);
      v.app.step = i + 1;
    }
    wait(s, 1.5, 3);
    v.profile.product = 'first-home-loan';
    const before = v.app.submittedAt;
    submitScripted(s, v);
    if (v.app.submittedAt !== before) currents(v, 'converted', v.app.submittedAt + 12000, null);

    // 5. Uploads the rest of his documents the next day.
    if (v.app.uploaded.length < v.app.docs.length) {
      s = session(v, at(-2, 12.5), { utm: null, referrer: null });
      page(s, 'apply/submitted/', { id: v.app.id });
      upload(s, v, v.app.docs.length);
      end(s);
    }
  }

  // submit() with Darren's documents fixed: some uploaded straight away,
  // the rest the next day (step 5 below).
  function submitScripted(s, v) {
    const saved = cfg.documents.uploadSameSession;
    const savedLater = cfg.documents.uploadLater;
    cfg.documents.uploadSameSession = 1;
    cfg.documents.uploadLater = 0;
    try {
      submit(s, v);
    } finally {
      cfg.documents.uploadSameSession = saved;
      cfg.documents.uploadLater = savedLater;
    }
  }

  /* --- every day ----------------------------------------------------------- */

  let index = 0;
  for (const date of days(cfg.start, cfg.end)) {
    const t = cfg.traffic;
    const d = new Date(date + 'T00:00:00Z');
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const weeks = (d - startDay) / (7 * DAY);
    const burst = t.bursts.filter((x) => date >= x.from && date <= x.to).reduce((f, x) => f * x.factor, 1);
    const dayRng = new Rng(hash(`${cfg.seed}:day:${date}`));
    const count = Math.round(
      t.visitorsPerDay * (weekend ? t.weekendFactor : 1) * Math.pow(1 + t.weeklyGrowth, weeks) * burst * dayRng.between(0.9, 1.1)
    );
    for (let i = 0; i < count; i++) {
      const v = visitor(index++);
      stats.visitors += 1;
      const hourOf = () => v.rng.weighted(t.hourWeights.map((w, h) => ({ h, weight: w }))).h;
      let outcome = firstVisit(v, clock.at(date, hourOf() + v.rng.next()));

      // Browsers who didn't apply coming back to look again, warmer each
      // time. A bounce sometimes comes back too.
      let visits = 1;
      while ((outcome === 'browsed' || outcome === 'bounced') && visits < 4 && v.rng.chance(B.returnToBrowse / visits)) {
        const later = clock.dateOf(clock.at(date, 12) + v.rng.skewed(...B.returnDays) * DAY);
        const at = clock.at(later, hourOf() + v.rng.next());
        if (at > endMs) break;
        visits += 1;
        const back = v.rng.chance(0.6) ? cfg.channels.find((c) => c.name === 'direct') : cfg.channels.find((c) => c.name === 'organic_search');
        const s = session(v, at, { utm: null, referrer: back.referrer });
        outcome = browseVisit(s, Math.pow(B.returnWarmth, visits - 1));
      }

      // Abandoners: maybe back on their own, maybe brought back by Braze.
      let tries = 0;
      while (outcome === 'abandoned' && v.app && !v.app.submitted && tries++ < 2) {
        const before = v.app.abandonedAt;
        outcome = afterAbandoning(v);
        if (v.app.abandonedAt === before && outcome === 'abandoned') break;
      }

      if (canvasEligible(v)) layer(v, 'cv', () => canvasJourney(v));
    }
  }

  if (C && C.enabled && cfg.darren && cfg.darren.demoDate) darren();

  events.sort((a, b) => a.time - b.time || (a.insert_id < b.insert_id ? -1 : 1));
  return { events, stats };
}
