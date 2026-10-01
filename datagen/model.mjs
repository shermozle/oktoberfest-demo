/* ==========================================================================
   Laneway Bank synthetic data: the behaviour model.

   Turns config.mjs into Amplitude events, shaped exactly as the site sends
   them (see TRACKING.md): the same event names, properties, user properties
   and context, plus the [Amplitude] Page Viewed and session events the
   Browser SDK autocaptures, and the Braze email events Currents would add.

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
  'calculators/borrowing-power/': 'Borrowing power calculator – Laneway Bank',
  'apply/': 'Apply for a home loan – Laneway Bank',
  'apply/submitted/': 'Application submitted – Laneway Bank',
  'account/': 'Internet banking – Laneway Bank',
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
  const events = [];
  const stats = { visitors: 0, sessions: 0 };

  const startDay = new Date(cfg.start + 'T00:00:00Z');
  const bandOf = (n) => finance.loanBand(n);

  /* --- one visitor ------------------------------------------------------ */

  function visitor(index) {
    const rng = new Rng(hash(`${cfg.seed}:${index}`));
    const channel = rng.weighted(cfg.channels);
    const mobile = rng.chance(channel.mobileShare);
    const device = rng.weighted(cfg.devices[mobile ? 'mobile' : 'desktop']);
    const place = rng.weighted(cfg.locations);
    const persona = rng.weighted(cfg.personas);
    const first = rng.pick(FIRST);
    const last = rng.pick(LAST);
    const slug = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
    const v = {
      index,
      rng,
      channel,
      mobile,
      device,
      place,
      persona,
      deviceId: rng.uuid(),
      userId: null,
      intent: Math.exp(rng.between(-0.5, 0.4)),
      first,
      last,
      email: `${slug(first)}.${slug(last)}${index}@${rng.pick(DOMAINS)}`,
      seq: 0,
      app: null,
    };
    v.profile = profile(v);
    return v;
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
      dependants: rng.weightedKey({ 0: 50, 1: 22, 2: 20, 3: 8 }),
      expenses: Math.round(rng.between(...p.expenses) / 50) * 50,
      debts: rng.chance(0.35) ? rng.int(2, 12) * 50 : 0,
      cardLimits: rng.weightedKey({ 0: 20, 5000: 35, 10000: 25, 20000: 15, 30000: 5 }) * 1,
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
    const s = {
      v,
      t: start,
      id: start,
      key: 'sess_' + start.toString(36) + v.rng.hex(6),
      pageCounter: 0,
      path: '',
      ended: false,
    };
    const attribution = {};
    if (entry && entry.utm) {
      attribution.$set = Object.assign({}, entry.utm);
      attribution.$setOnce = Object.fromEntries(Object.entries(entry.utm).map(([k, val]) => ['initial_' + k, val]));
    }
    if (entry && entry.referrer) {
      attribution.$set = Object.assign(attribution.$set || {}, {
        referrer: entry.referrer,
        referring_domain: new URL(entry.referrer).hostname,
      });
      attribution.$setOnce = Object.assign(attribution.$setOnce || {}, {
        initial_referrer: entry.referrer,
        initial_referring_domain: new URL(entry.referrer).hostname,
      });
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
      insert_id: `ldg-${cfg.seed}-${v.index}-${v.seq++}`,
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

  const wait = (s, a, b) => (s.t += s.v.rng.between(a, b) * MIN);
  const secs = (s, a, b) => (s.t += s.v.rng.between(a, b) * 1000);

  function page(s, path, query) {
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
    const handle = path.split('/').filter(Boolean).pop();
    const p = PRODUCTS.get(handle);
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

  function end(s) {
    if (s.ended) return;
    s.ended = true;
    emit(s, 'session_end', {});
  }

  function identify(v) {
    v.userId = v.email;
    return {
      email: v.email,
      first_name: v.first,
      last_name: v.last,
      marketing_opt_in: v.profile.marketingOptIn,
      phone_provided: true,
      existing_customer: v.channel.name === 'existing_customer',
      has_home_loan: false,
    };
  }

  /* --- the first visit --------------------------------------------------- */

  function firstVisit(v, start) {
    const entry = { utm: v.channel.utm, referrer: v.channel.referrer };
    const s = session(v, start, entry);
    if (v.channel.landing === 'landing/') return landingVisit(s, v);
    if (v.channel.landing === 'account/') return customerVisit(s, v);
    return browseVisit(s, v);
  }

  function landingVisit(s, v) {
    const { rng } = v;
    const utm = v.channel.utm || {};
    page(s, 'landing/', utm);
    track(s, 'Product Viewed', Object.assign({ page_type: 'landing' }, utm, productProps('package-home-loan')), {
      last_product_viewed: 'Package Home Loan',
      last_category_viewed: 'Home loans',
    });
    secs(s, 15, 70);
    if (rng.chance(0.5)) {
      const loan = Math.round(v.profile.loanAmount / 10000) * 10000;
      const offset = rng.int(0, 30) * 5000;
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
      secs(s, 20, 90);
    }
    if (rng.chance(0.2)) {
      const faq = rng.weighted([
        { weight: 30, q: 'What is an offset account?', n: 1 },
        { weight: 35, q: 'Is the $395 annual fee worth it?', n: 2 },
        { weight: 15, q: 'Can I switch from another bank?', n: 3 },
        { weight: 10, q: 'What is the comparison rate?', n: 4 },
        { weight: 10, q: 'How long does applying take?', n: 5 },
      ]);
      track(s, 'FAQ Opened', { question: faq.q, position: faq.n, page_type: 'landing' });
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
    if (rng.chance(0.15)) {
      page(s, 'home-loans/');
      productList(s);
    }
    end(s);
  }

  function productList(s) {
    track(s, 'Product List Viewed', {
      category: 'Home loans',
      category_handle: 'home-loans',
      product_count: HOME_LOANS.length,
      product_ids: HOME_LOANS.map((p) => p.handle),
    });
    secs(s, 10, 60);
  }

  function browseVisit(s, v) {
    const { rng } = v;
    page(s, 'index.html');
    secs(s, 5, 40);
    let source = null;
    if (rng.chance(0.65)) {
      page(s, 'home-loans/');
      productList(s);
      const looks = rng.int(1, 2);
      for (let i = 0; i < looks; i++) {
        const handle = i === 0 ? v.profile.product : rng.pick(HOME_LOANS).handle;
        page(s, 'home-loans/' + handle + '/');
        track(s, 'Product Viewed', productProps(handle), {
          last_product_viewed: PRODUCTS.get(handle).title,
          last_category_viewed: 'Home loans',
        });
        secs(s, 20, 120);
        if (rng.chance(0.4)) track(s, 'Product Detail Read', productProps(handle));
      }
      source = rng.chance(0.7) ? 'product_page' : 'header';
    }
    if (rng.chance(0.3)) {
      page(s, 'calculators/borrowing-power/');
      wait(s, 1, 4);
      const pr = v.profile;
      const power = finance.borrowingPower({
        applicants: pr.couple ? 2 : 1,
        income: pr.income,
        partnerIncome: pr.partnerIncome,
        otherIncome: pr.otherIncome,
        dependants: pr.dependants,
        expenses: pr.expenses,
        debts: pr.debts,
        cardLimits: pr.cardLimits,
        rate: 5.84,
      });
      const band = finance.incomeBand(pr.income + pr.partnerIncome);
      track(
        s,
        'Borrowing Power Calculated',
        Object.assign(
          {
            applicant_count: pr.couple ? 2 : 1,
            dependants: Number(pr.dependants),
            income_band: band,
            borrowing_power: power,
            estimated_repayment: Math.round(finance.repayment(power, 5.84, 30, 'monthly')),
          },
          productProps('variable-home-loan')
        ),
        { borrowing_power: power, income_band: band }
      );
      source = 'borrowing_power_calculator';
    }
    const startP = cfg.funnel.browseStart * v.channel.startFactor * v.intent * (source ? 1.6 : 0.5);
    if (rng.chance(startP)) return startApplication(s, v, source || 'header', {}, source === 'product_page' ? v.profile.product : null);
    end(s);
  }

  function customerVisit(s, v) {
    const { rng } = v;
    page(s, 'account/');
    const props = identify(v);
    props.existing_customer = true;
    track(s, 'Signed In', { email: v.email, method: 'email' }, props);
    wait(s, 1, 5);
    if (rng.chance(0.5)) {
      const p = rng.pick(catalog.products.filter((x) => x.category !== 'home-loans'));
      page(s, p.category + '/' + p.handle + '/');
      track(s, 'Product Viewed', productProps(p.handle), { last_product_viewed: p.title, last_category_viewed: p.category });
      if (rng.chance(0.15)) track(s, 'Product Interest Registered', productProps(p.handle), { interested_product: p.title });
    }
    if (rng.chance(cfg.funnel.browseStart * v.channel.startFactor * 2)) return startApplication(s, v, 'header', {}, null);
    end(s);
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

  function startApplication(s, v, source, campaign, preProduct) {
    v.app = {
      id: 'LB' + (100000 + (hash(`${cfg.seed}:app:${v.index}`) % 900000)),
      startedAt: s.t,
      updatedAt: s.t,
      source,
      campaign: campaign || {},
      step: 0,
      submitted: false,
    };
    const query = Object.assign({ source }, preProduct ? { product: preProduct } : {}, campaign);
    page(s, 'apply/', query);
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
        preProduct
          ? { application_product: PRODUCTS.get(preProduct).title, application_product_id: preProduct }
          : {}
      )
    );
    return steps(s, v, 0, 1);
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
    for (let i = from; i < STEPS.length; i++) {
      const key = STEPS[i];
      const [a, b] = cfg.funnel.stepMinutes[key];
      if (!rng.chance(stepChance(v, key, ease))) {
        // Gives up on this step: lingers, then leaves.
        const h = cfg.funnel.hesitationFactor;
        wait(s, a * h * 0.5, b * h);
        v.app.step = i;
        v.app.updatedAt = s.t;
        v.app.abandonedAt = s.t;
        end(s);
        return 'abandoned';
      }
      wait(s, a, b);
      if (i === STEPS.length - 1) {
        submit(s, v);
        return 'submitted';
      }
      stage(s, v, i);
      v.app.step = i + 1;
      v.app.updatedAt = s.t;
    }
    return 'submitted';
  }

  // The stage events, as logStage() in src/assets/js/app.js sends them.
  function stage(s, v, i) {
    const pr = v.profile;
    const fig = figures(v);
    const id = { application_id: v.app.id };
    const progress = progressProps(i + 1);
    if (i === 0) {
      const who = identify(v);
      track(s, 'Applicant Details Entered', Object.assign({}, id, {
        applicant_count: pr.couple ? 2 : 1,
        first_home_buyer: pr.firstHomeBuyer,
        email_provided: true,
        phone_provided: true,
        marketing_opt_in: pr.marketingOptIn,
      }), Object.assign(who, { first_home_buyer: pr.firstHomeBuyer }, progress));
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
        dependants: Number(pr.dependants),
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
      }), Object.assign({
        application_product: fig.product.title,
        application_product_id: pr.product,
      }, progress));
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
    page(s, 'apply/submitted/', { id: v.app.id });
    v.app.docs = docs;
    v.app.uploaded = [];
    const { rng } = v;
    if (rng.chance(cfg.documents.uploadSameSession)) upload(s, v, rng.int(1, docs.length));
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

  // Braze Currents events: on the user, outside any session.
  function brazeEvent(v, type, at, extra) {
    if (at > endMs) return;
    events.push({
      event_type: type,
      user_id: v.userId,
      time: Math.round(at),
      session_id: -1,
      insert_id: `ldg-${cfg.seed}-${v.index}-${v.seq++}`,
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
    const eligible =
      !app.inCohort && v.userId && (app.step === 2 || app.step === 3) && v.profile.loanAmount >= b.minLoan;
    const recent = app.abandonedAt >= launchMs - b.lookbackDays * 24 * HOUR;
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
          return resume(v, back, utm, b.resumeEase);
        }
      }
    }
    if (natural && natural <= endMs) return resume(v, natural, null, d.resumeEase);
    return 'abandoned';
  }

  /* --- every day ----------------------------------------------------------- */

  let index = 0;
  for (const date of days(cfg.start, cfg.end)) {
    const t = cfg.traffic;
    const d = new Date(date + 'T00:00:00Z');
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const weeks = (d - startDay) / (7 * 24 * HOUR);
    const burst = t.bursts.filter((x) => date >= x.from && date <= x.to).reduce((f, x) => f * x.factor, 1);
    const dayRng = new Rng(hash(`${cfg.seed}:day:${date}`));
    const count = Math.round(
      t.visitorsPerDay * (weekend ? t.weekendFactor : 1) * Math.pow(1 + t.weeklyGrowth, weeks) * burst * dayRng.between(0.9, 1.1)
    );
    for (let i = 0; i < count; i++) {
      const v = visitor(index++);
      stats.visitors += 1;
      const hourIdx = v.rng.weighted(t.hourWeights.map((w, h) => ({ h, weight: w }))).h;
      const start = clock.at(date, hourIdx + v.rng.next());
      let outcome = firstVisit(v, start);
      // One more chance to come back after abandoning again on a return.
      let tries = 0;
      while (outcome === 'abandoned' && v.app && !v.app.submitted && tries++ < 2) {
        const before = v.app.abandonedAt;
        outcome = afterAbandoning(v);
        if (v.app.abandonedAt === before) break;
      }
    }
  }

  events.sort((a, b) => a.time - b.time || (a.insert_id < b.insert_id ? -1 : 1));
  return { events, stats };
}
