/* ==========================================================================
   Laneway Bank demo — site behaviour
   Everything is client-side. Each generated page sets document.body.dataset
   .page and window.LANEWAY_PAGE, and this file wires up whatever that page
   needs.
   ========================================================================== */

(function () {
  'use strict';

  const store = window.LanewayStore;
  const track = window.LanewayTrack;
  const finance = window.LanewayFinance;
  const cfg = window.LANEWAY_CONFIG || {};
  const PAGE = window.LANEWAY_PAGE || {};
  const INDEX = window.LANEWAY_INDEX || { products: [], categories: [] };
  const BASE = window.LANEWAY_BASE || '';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) =>
    Array.from((root || document).querySelectorAll(sel));

  const url = (path) => BASE + path;
  const query = new URLSearchParams(location.search);

  // UTM parameters from a paid campaign. The landing page passes them on to
  // its apply links, so the application can say which campaign produced it.
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  function campaignFrom(params) {
    const out = {};
    UTM_KEYS.forEach((k) => {
      if (params.get(k)) out[k] = params.get(k);
    });
    return out;
  }

  const productByHandle = (handle) =>
    INDEX.products.find((p) => p.handle === handle);
  const homeLoans = () => INDEX.products.filter((p) => p.category === 'home-loans');

  const escapeHtml = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);

  const num = (v) => Number(v) || 0;

  // Reads a form into a plain object: radios as their checked value,
  // checkboxes as booleans, everything else as the raw string.
  function formValues(form) {
    const out = {};
    Array.from(form.elements).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value;
      } else if (el.type === 'checkbox') {
        out[el.name] = el.checked;
      } else {
        out[el.name] = el.value;
      }
    });
    return out;
  }

  function fillForm(form, values) {
    Object.entries(values || {}).forEach(function (pair) {
      const els = $$('[name="' + pair[0] + '"]', form);
      els.forEach(function (el) {
        if (el.type === 'radio') el.checked = el.value === pair[1];
        else if (el.type === 'checkbox') el.checked = !!pair[1];
        else el.value = pair[1];
      });
    });
  }

  // Email is required on every form that takes one: it's the Braze
  // external id and the address Braze sends to. The application also
  // requires a mobile, for Braze SMS. Everything else stays optional.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const validEmail = (s) => EMAIL.test(String(s || '').trim());

  // An Australian mobile in any common format (0412 345 678, +61 412 345
  // 678), returned as E.164 (+61412345678), the format Braze stores; null
  // if it isn't one.
  function normalisePhone(s) {
    const digits = String(s || '').replace(/[\s()-]/g, '');
    const m = /^(?:\+?61|0)(4\d{8})$/.exec(digits);
    return m ? '+61' + m[1] : null;
  }

  // Flags an input and shows `message` beside it, or clears both. `msgEl`
  // is where the message goes; by default a line added inside the field's
  // label. Returns whether the value passed.
  function checkField(input, valid, message, msgEl) {
    const ok = valid(input.value);
    input.setAttribute('aria-invalid', String(!ok));
    let msg = msgEl;
    if (!msg) {
      msg = input.closest('label').querySelector('.field-error');
      if (!msg && !ok) {
        msg = document.createElement('small');
        msg.className = 'field-error';
        msg.setAttribute('role', 'alert');
        input.closest('label').appendChild(msg);
      }
    }
    if (msg) msg.textContent = ok ? '' : message;
    if (!ok) {
      input.focus();
      // Clear the message as soon as they fix it.
      input.addEventListener('input', function clear() {
        if (!valid(input.value)) return;
        input.setAttribute('aria-invalid', 'false');
        if (msg) msg.textContent = '';
        input.removeEventListener('input', clear);
      });
    }
    return ok;
  }

  const checkEmail = (input, msgEl) =>
    checkField(input, validEmail, 'Enter your email address, like name@example.com.', msgEl);
  const checkPhone = (input) =>
    checkField(input, (v) => !!normalisePhone(v), 'Enter an Australian mobile number, like 0412 345 678.');

  // Runs fn once the visitor stops changing things for `ms`.
  function debounce(fn, ms) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  /* ======================================================================
     Toasts
     ====================================================================== */

  function toast(message) {
    let stack = $('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  /* ======================================================================
     Header
     ====================================================================== */

  function renderDraftIndicator() {
    const draft = store.getDraft();
    $$('[data-draft-link]').forEach((el) => (el.hidden = !draft));
  }

  function initHeader() {
    renderDraftIndicator();
    store.on('application:changed', renderDraftIndicator);

    const header = $('.site-header');
    if (header) {
      const onScroll = () =>
        header.classList.toggle('site-header--stuck', window.scrollY > 4);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    const toggle = $('[data-nav-toggle]');
    const nav = $('#site-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        const open = nav.classList.toggle('site-nav--open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }

    $$('[data-nav-link]').forEach(function (a) {
      a.addEventListener('click', function () {
        track.trackAnalyticsOnly('Navigation Clicked', {
          label: a.textContent.trim(),
          destination: a.getAttribute('href'),
          location: a.dataset.navLink,
        });
      });
    });

    // Every "Apply" button carries where it was clicked, so Application
    // Started can say which part of the site produced the application.
    const campaign = campaignFrom(query);
    $$('[data-apply-link]').forEach(function (a) {
      if (!a.dataset.applySource) return;
      const target = new URL(a.getAttribute('href'), location.href);
      target.searchParams.set('source', a.dataset.applySource);
      Object.entries(campaign).forEach((pair) => target.searchParams.set(pair[0], pair[1]));
      a.href = target.href;
    });
  }

  /* ======================================================================
     Search overlay
     ====================================================================== */

  function initSearch() {
    const overlay = $('#search-overlay');
    if (!overlay) return;
    const input = $('input', overlay);
    const results = $('.search-results', overlay);
    let lastQuery = '';
    let logTimer = null;

    function open() {
      overlay.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      input.focus();
      track.trackAnalyticsOnly('Search Opened', {});
    }

    function close() {
      overlay.hidden = true;
      document.documentElement.style.overflow = '';
    }

    function search(q) {
      const needle = q.trim().toLowerCase();
      if (!needle) return [];
      return INDEX.products
        .map(function (p) {
          const haystack = [p.title, p.kicker, p.categoryTitle, p.tagline]
            .join(' ')
            .toLowerCase();
          let score = 0;
          if (p.title.toLowerCase().startsWith(needle)) score += 5;
          if (p.title.toLowerCase().includes(needle)) score += 3;
          if (haystack.includes(needle)) score += 1;
          return { product: p, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((r) => r.product);
    }

    function render(q) {
      const hits = search(q);
      if (!q.trim()) {
        results.innerHTML =
          '<p class="muted" style="text-align:center">Search ' +
          INDEX.products.length +
          ' products: home loans, accounts, savings and cards.</p>';
        return;
      }
      if (!hits.length) {
        results.innerHTML =
          '<p class="muted" style="text-align:center">Nothing matches &ldquo;' +
          escapeHtml(q) +
          '&rdquo;.</p>';
        return;
      }
      results.innerHTML = hits
        .map(
          (p, i) =>
            '<a class="search-hit" href="' +
            url(p.path) +
            '" data-hit="' +
            escapeHtml(p.handle) +
            '" data-position="' +
            (i + 1) +
            '">' +
            '<span><span style="display:block">' +
            escapeHtml(p.title) +
            '</span><span class="muted" style="font-size:12px">' +
            escapeHtml(p.kicker) +
            '</span></span>' +
            '<span>' +
            escapeHtml(p.figures[0].value + p.figures[0].unit) +
            '</span></a>'
        )
        .join('');

      clearTimeout(logTimer);
      logTimer = setTimeout(function () {
        if (q.trim() === lastQuery) return;
        lastQuery = q.trim();
        track.track('Search Performed', {
          query: lastQuery,
          results_count: hits.length,
          product_ids: track.productIds(hits),
        });
      }, 700);
    }

    $$('[data-search-open]').forEach((b) => b.addEventListener('click', open));
    $$('[data-search-close]').forEach((b) =>
      b.addEventListener('click', close)
    );
    input.addEventListener('input', () => render(input.value));
    overlay.addEventListener('click', function (e) {
      const hit = e.target.closest('[data-hit]');
      const p = hit && productByHandle(hit.dataset.hit);
      if (p) {
        track.trackAnalyticsOnly(
          'Search Result Clicked',
          Object.assign(
            { query: input.value.trim(), position: Number(hit.dataset.position) },
            track.productProps(p)
          )
        );
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
    render('');
  }

  /* ======================================================================
     Product page
     ====================================================================== */

  function initProduct() {
    const product = PAGE.product;
    if (!product) return;

    store.recordView(product.handle);
    const props = track.productProps(product);

    track.track('Product Viewed', props);
    track.setUserProperties({
      last_product_viewed: product.title,
      last_category_viewed: product.categoryTitle,
    });

    // Sticky apply bar once the main apply button scrolls away.
    const quickBar = $('.quick-bar');
    const mainCta = $('.product__info .btn');
    if (quickBar && mainCta) {
      const io = new IntersectionObserver(
        function (entries) {
          quickBar.classList.toggle('quick-bar--visible', !entries[0].isIntersecting);
        },
        { rootMargin: '-80px 0px 0px 0px' }
      );
      io.observe(mainCta);
    }

    // Everyday, savings and card products can't be opened in this demo.
    // Registering interest is the cross-sell signal a bank would act on.
    const interest = $('[data-register-interest]');
    if (interest)
      interest.addEventListener('click', function () {
        track.track('Product Interest Registered', props);
        track.setUserProperties({ interested_product: product.title });
        interest.disabled = true;
        interest.textContent = 'Interest registered';
        const msg = $('[data-interest-msg]');
        if (msg)
          msg.textContent =
            'Thanks. Braze now has interested_product on this profile, ready for a cross-sell campaign.';
      });

    // How far down the page they read: the signal a Braze browse
    // abandonment campaign triggers on.
    let deepSeen = false;
    window.addEventListener(
      'scroll',
      function () {
        if (deepSeen) return;
        const seen =
          (window.scrollY + window.innerHeight) / document.body.scrollHeight;
        if (seen > 0.7) {
          deepSeen = true;
          track.track('Product Detail Read', props);
        }
      },
      { passive: true }
    );
  }

  /* ======================================================================
     Category page: filter and sort, client-side
     ====================================================================== */

  function initCollection() {
    const collection = PAGE.collection;
    if (!collection) return;

    const gridEl = $('[data-collection-grid]');
    const countEl = $('[data-collection-count]');
    const sortEl = $('[data-sort]');
    const boxes = $$('[data-filter]');
    const clearEl = $('[data-filter-clear]');

    const items = collection.products.map(productByHandle).filter(Boolean);

    // Checked values per filter, e.g. { purpose: ['investor'], offset: ['true'] }.
    function selected() {
      const out = {};
      boxes
        .filter((b) => b.checked)
        .forEach((b) => (out[b.dataset.filter] = (out[b.dataset.filter] || []).concat(b.value)));
      return out;
    }

    function apply() {
      const sel = selected();
      let list = items.filter((p) =>
        Object.entries(sel).every((pair) => pair[1].includes(String(p[pair[0]])))
      );

      const sorters = {
        featured: null,
        'rate-asc': (a, b) => (a.rate ?? 99) - (b.rate ?? 99),
        'comparison-asc': (a, b) => (a.comparisonRate ?? 99) - (b.comparisonRate ?? 99),
        'fee-asc': (a, b) => a.annualFee - b.annualFee,
        'title-asc': (a, b) => a.title.localeCompare(b.title),
      };
      const sort = sortEl ? sortEl.value : 'featured';
      if (sorters[sort]) list = list.slice().sort(sorters[sort]);

      if (countEl)
        countEl.textContent = list.length + (list.length === 1 ? ' product' : ' products');
      gridEl.innerHTML = list.length
        ? list.map(cardHtml).join('')
        : '<p class="empty-state" style="grid-column:1/-1">No products match these filters.</p>';
      return list;
    }

    if (sortEl)
      sortEl.addEventListener('change', function () {
        const list = apply();
        track.trackAnalyticsOnly('Product List Sorted', {
          category: collection.title,
          sort_by: sortEl.value,
          results_count: list.length,
          product_ids: track.productIds(list),
        });
      });

    boxes.forEach(function (el) {
      el.addEventListener('change', function () {
        const list = apply();
        const sel = selected();
        track.trackAnalyticsOnly('Product List Filtered', {
          category: collection.title,
          purpose: sel.purpose || [],
          rate_type: sel.rateType || [],
          features: []
            .concat(sel.offset ? ['offset'] : [])
            .concat(sel.firstHomeBuyer ? ['first_home_buyer'] : []),
          results_count: list.length,
          product_ids: track.productIds(list),
        });
      });
    });

    if (clearEl)
      clearEl.addEventListener('click', function () {
        boxes.forEach((c) => (c.checked = false));
        apply();
      });

    $$('[data-pop-toggle]').forEach(function (btn) {
      const panel = $('#' + btn.dataset.popToggle);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const open = panel.hidden;
        $$('.filter-pop__panel').forEach((p) => (p.hidden = true));
        panel.hidden = !open;
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.filter-pop'))
        $$('.filter-pop__panel').forEach((p) => (p.hidden = true));
    });

    const shown = apply();

    track.track('Product List Viewed', {
      category: collection.title,
      category_handle: collection.handle,
      product_count: items.length,
      product_ids: track.productIds(shown),
    });
  }

  /* ======================================================================
     Rate cards + recommendations
     ====================================================================== */

  // Mirrors photo() in build.mjs.
  function photoHtml(img, sizes, cls) {
    const src = (n) => url('assets/img/homes/' + img.name + '-' + n + '.webp');
    return (
      '<img class="' +
      (cls || 'photo') +
      '" src="' +
      src(1600) +
      '" srcset="' +
      src(800) +
      ' 800w, ' +
      src(1600) +
      ' 1600w" sizes="' +
      (sizes || '100vw') +
      '" alt="' +
      escapeHtml(img.alt) +
      '" loading="lazy" decoding="async" style="object-position:' +
      (img.position || '50% 50%') +
      '">'
    );
  }

  // Mirrors productCard() in build.mjs.
  function cardHtml(p) {
    return (
      '<article class="rate-card' +
      (p.image ? ' rate-card--photo' : '') +
      '" data-product-card="' +
      escapeHtml(p.handle) +
      '">' +
      (p.image
        ? '<a class="rate-card__media" href="' +
          url(p.path) +
          '" tabindex="-1" aria-hidden="true">' +
          photoHtml(p.image, '(max-width: 760px) 100vw, 33vw') +
          '</a>'
        : '') +
      '<p class="rate-card__kicker">' +
      escapeHtml(p.kicker) +
      '</p>' +
      '<a class="rate-card__title" href="' +
      url(p.path) +
      '">' +
      escapeHtml(p.title) +
      '</a>' +
      '<p class="rate-card__tagline">' +
      escapeHtml(p.tagline) +
      '</p>' +
      '<div class="rate-card__figures">' +
      p.figures
        .map(
          (f) =>
            '<div class="figure"><span class="figure__value">' +
            escapeHtml(f.value) +
            '<small>' +
            escapeHtml(f.unit) +
            '</small></span><span class="figure__label">' +
            escapeHtml(f.label) +
            '</span></div>'
        )
        .join('') +
      '</div>' +
      '<a class="btn btn--sm btn--outline rate-card__cta" href="' +
      url(p.path) +
      '">View details</a>' +
      '</article>'
    );
  }

  /**
   * Stand-in for a recommendation service. Ranks the catalogue against the
   * current product or the visitor's browsing history: the same category
   * and purpose score highest, then a close rate, and an offset loan pulls
   * in the offset account.
   */
  function recommend(seedHandle, limit) {
    const viewed = store.recentlyViewed();
    const seed = productByHandle(seedHandle) || productByHandle(viewed[0]);
    const pool = INDEX.products.filter((p) => p.handle !== (seed && seed.handle));
    const n = limit || 3;
    if (!seed) return pool.filter((p) => p.featured).slice(0, n);

    return pool
      .map(function (p) {
        let score = 0;
        if (p.category === seed.category) score += 3;
        if (p.purpose && p.purpose === seed.purpose) score += 2;
        if (p.rateType && p.rateType === seed.rateType) score += 1;
        if (seed.offset && p.handle === 'offset-account') score += 4;
        if (seed.firstHomeBuyer && p.handle === 'bonus-saver') score += 3;
        if (p.rate != null && seed.rate != null && p.category === seed.category)
          score -= Math.min(2, Math.abs(p.rate - seed.rate) * 2);
        if (viewed.includes(p.handle)) score -= 2; // already seen it
        return { p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((r) => r.p);
  }

  function initRecommendations() {
    $$('[data-recommend]').forEach(function (holder) {
      const seed = holder.dataset.recommend || null;
      const limit = Number(holder.dataset.recommendLimit) || 3;
      const items = recommend(seed, limit);
      holder.innerHTML = items.map(cardHtml).join('');
      track.trackAnalyticsOnly('Recommendations Shown', {
        // The product the list was computed from, not one of those shown.
        seed_product_id: seed,
        placement: holder.dataset.placement || 'you-might-also-consider',
        product_ids: track.productIds(items),
      });
    });

    const recent = $('[data-recently-viewed]');
    if (recent) {
      const items = store
        .recentlyViewed()
        .filter((h) => h !== (PAGE.product && PAGE.product.handle))
        .slice(0, 3)
        .map(productByHandle)
        .filter(Boolean);
      if (items.length) {
        recent.closest('section').hidden = false;
        recent.innerHTML = items.map(cardHtml).join('');
      }
    }

    document.addEventListener('click', function (e) {
      const card = e.target.closest('[data-product-card]');
      if (!card || !e.target.closest('a')) return;
      const p = productByHandle(card.dataset.productCard);
      if (!p) return;
      const siblings = $$('[data-product-card]', card.parentElement);
      const holder = card.closest('[data-placement]');
      track.trackAnalyticsOnly(
        'Product Card Clicked',
        Object.assign(
          {
            placement: holder ? holder.dataset.placement : 'grid',
            position: siblings.indexOf(card) + 1,
          },
          track.productProps(p)
        )
      );
    });
  }

  /* ======================================================================
     Calculators
     ====================================================================== */

  // Shows the partner-income field only when two people are applying.
  function syncPartner(form) {
    const two = String(formValues(form).applicants) === '2';
    $$('[data-partner-only]', form.closest('main') || document).forEach(
      (el) => (el.hidden = !two)
    );
  }

  // Interest-only is offered only on loans that allow it.
  function syncRepaymentType(form, product) {
    const allowed = product && (product.repaymentTypes || []).includes('interest_only');
    const io = $('[name="repaymentType"][value="interest_only"]', form);
    if (!io) return;
    io.disabled = !allowed;
    io.closest('label').classList.toggle('is-disabled', !allowed);
    if (!allowed && io.checked)
      $('[name="repaymentType"][value="principal_and_interest"]', form).checked = true;
  }

  function rateFor(product, repaymentType) {
    if (!product) return 6;
    if (repaymentType === 'interest_only' && product.interestOnlyRate)
      return product.interestOnlyRate;
    return product.rate;
  }

  function setApplyHref(el, params) {
    const target = new URL(el.getAttribute('href'), location.href);
    Object.entries(params).forEach((pair) => target.searchParams.set(pair[0], pair[1]));
    el.href = target.href;
  }

  function initBorrowingCalc() {
    const form = $('[data-calc="borrowing_power"]');
    if (!form) return;
    const out = (k) => $('[data-result="' + k + '"]');
    const apply = $('[data-calc-apply]');
    if (query.get('product')) form.elements.product.value = query.get('product');

    function compute() {
      const v = formValues(form);
      const product = productByHandle(v.product);
      const amount = finance.borrowingPower({
        applicants: v.applicants,
        income: v.income,
        partnerIncome: v.partnerIncome,
        otherIncome: v.otherIncome,
        dependants: v.dependants,
        expenses: v.expenses,
        debts: v.debts,
        cardLimits: v.cardLimits,
        rate: product.rate,
      });
      const monthly = finance.repayment(amount, product.rate, cfg.LOAN_TERM_YEARS || 30, 'monthly');
      return { v, product, amount, monthly };
    }

    function render() {
      syncPartner(form);
      const r = compute();
      out('amount').textContent = r.amount ? store.money0(r.amount) : '$0';
      out('assessed').textContent =
        'Assessed at ' +
        store.pct(finance.assessmentRate(r.product.rate)) +
        ': the ' +
        r.product.title +
        ' rate plus a ' +
        (cfg.ASSESSMENT_BUFFER ?? 3) +
        '% buffer.';
      out('repayment').textContent = r.amount ? store.money0(r.monthly) + ' a month' : '—';
      setApplyHref(apply, {
        amount: r.amount,
        product: r.product.handle,
        source: 'borrowing_power_calculator',
      });
      return r;
    }

    // Sent once the visitor stops typing, so one calculation is one event
    // rather than one per keystroke.
    const log = debounce(function () {
      const r = compute();
      track.track(
        'Borrowing Power Calculated',
        Object.assign(
          {
            applicant_count: Number(r.v.applicants) || 1,
            dependants: num(r.v.dependants),
            income_band: finance.incomeBand(num(r.v.income) + num(r.v.partnerIncome)),
            borrowing_power: r.amount,
            estimated_repayment: Math.round(r.monthly),
          },
          track.productProps(r.product)
        )
      );
      track.setUserProperties({
        borrowing_power: r.amount,
        income_band: finance.incomeBand(num(r.v.income) + num(r.v.partnerIncome)),
      });
      maybeShowBorrowingNudge(r.amount);
    }, 1200);

    form.addEventListener('input', function () {
      render();
      log();
    });
    form.addEventListener('change', function () {
      render();
      log();
    });
    render();
  }

  function initRepaymentsCalc() {
    const form = $('[data-calc="repayments"]');
    if (!form) return;
    const out = (k) => $('[data-result="' + k + '"]');
    const apply = $('[data-calc-apply]');
    if (query.get('product')) form.elements.product.value = query.get('product');
    if (query.get('amount')) form.elements.amount.value = query.get('amount');

    function compute() {
      const v = formValues(form);
      const product = productByHandle(v.product);
      syncRepaymentType(form, product);
      const type = formValues(form).repaymentType;
      const rate = rateFor(product, type);
      const years = num(v.term) || 30;
      const amount = num(v.amount);
      const each = finance.repayment(amount, rate, years, v.frequency, type);
      const interest = finance.totalInterest(amount, rate, years, v.frequency, type);
      return { v, product, type, rate, years, amount, each, interest };
    }

    function render() {
      const r = compute();
      const label = { monthly: 'Monthly', fortnightly: 'Fortnightly', weekly: 'Weekly' };
      out('label').textContent = label[r.v.frequency] + ' repayment';
      out('repayment').textContent = store.money0(r.each);
      out('rate').textContent =
        'At ' +
        store.pct(r.rate) +
        (r.type === 'interest_only' ? ', interest only' : '') +
        ' over ' +
        r.years +
        ' years.';
      out('interest').textContent = store.money0(r.interest);
      out('total').textContent = store.money0(
        r.interest + (r.type === 'interest_only' ? 0 : r.amount)
      );
      setApplyHref(apply, {
        amount: r.amount,
        product: r.product.handle,
        source: 'repayments_calculator',
      });
      return r;
    }

    const log = debounce(function () {
      const r = compute();
      track.track(
        'Repayments Calculated',
        Object.assign(
          {
            loan_amount: r.amount,
            loan_amount_band: finance.loanBand(r.amount),
            loan_term_years: r.years,
            repayment_frequency: r.v.frequency,
            repayment_type: r.type,
            repayment: Math.round(r.each),
          },
          track.productProps(r.product),
          { interest_rate: r.rate }
        )
      );
    }, 1200);

    form.addEventListener('input', function () {
      render();
      log();
    });
    form.addEventListener('change', function () {
      render();
      log();
    });
    render();
  }

  /* ======================================================================
     Home loan application
     ====================================================================== */

  const STEPS = ['about_you', 'property', 'income', 'expenses', 'loan', 'review'];
  const STEP_LABEL = {
    about_you: 'About you',
    property: 'The property',
    income: 'Your income',
    expenses: 'Your expenses',
    loan: 'Your loan',
    review: 'Review',
  };
  // What each step asks for, in words a reminder email can list.
  const STEP_NEEDS = {
    about_you: 'Your contact details',
    property: 'The property and your deposit',
    income: 'Your income and employment',
    expenses: 'Your monthly expenses and any other debts',
    loan: 'Your choice of loan and repayments',
    review: 'A final check, and your OK for a credit check',
  };

  // How far an application has got, as user properties. `next` is the
  // index of the next step to do. Braze gets these as custom attributes, so
  // an abandoned application email can list exactly what's left
  // (application_info_needed) and how far through they are.
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

  // Where a reminder links to. The draft lives in this browser, so the link
  // resumes it on the same device; elsewhere it starts afresh.
  const resumeUrl = () => new URL(url('apply/'), location.href).href;
  const PURPOSE_LABEL = {
    buy_home: 'Buying a home to live in',
    buy_investment: 'Buying an investment',
    refinance: 'Refinancing',
  };

  // Everything the application works out from what's been typed so far.
  // The same function drives the side panel, the review and the event
  // properties, so all three always agree.
  function applicationFigures(fields) {
    const f = fields || {};
    const purpose = f.loanPurpose || 'buy_home';
    const refinance = purpose === 'refinance';
    const value = num(f.propertyValue);
    const loanAmount = Math.max(
      0,
      refinance ? num(f.currentBalance) : value - num(f.deposit)
    );
    const product = productByHandle(f.product) || eligibleLoans(f)[0];
    const type = f.repaymentType || 'principal_and_interest';
    const rate = rateFor(product, type);
    const years = num(f.term) || cfg.LOAN_TERM_YEARS || 30;
    const frequency = f.frequency || 'monthly';
    const income = num(f.income) + (String(f.applicants) === '2' ? num(f.partnerIncome) : 0);
    const power = finance.borrowingPower({
      applicants: f.applicants,
      income: f.income,
      partnerIncome: f.partnerIncome,
      otherIncome: f.otherIncome,
      dependants: f.dependants,
      expenses: f.expenses,
      debts: f.debts,
      cardLimits: f.cardLimits,
      rate: product ? product.rate : 6,
    });
    return {
      purpose,
      refinance,
      value,
      loanAmount,
      lvr: finance.lvr(loanAmount, value),
      product,
      type,
      rate,
      years,
      frequency,
      income,
      power,
      repayment: finance.repayment(loanAmount, rate, years, frequency, type),
    };
  }

  // Investors see investor loans; owner occupiers see owner-occupier loans,
  // and the First Home Loan only if this is their first home.
  function eligibleLoans(fields) {
    const f = fields || {};
    const investor = f.loanPurpose === 'buy_investment';
    return homeLoans().filter(function (p) {
      if (investor) return p.purpose === 'investor';
      if (p.purpose !== 'owner_occupier') return false;
      if (p.firstHomeBuyer)
        return f.firstHomeBuyer === 'yes' && (f.loanPurpose || 'buy_home') === 'buy_home';
      return true;
    });
  }

  // Arithmetic, not a credit model: within borrowing power and within the
  // loan's maximum LVR is a conditional approval; anything else goes to a
  // lender.
  function decide(fig) {
    const reasons = [];
    if (!fig.loanAmount) reasons.push('no_loan_amount');
    if (fig.loanAmount > fig.power) reasons.push('above_borrowing_power');
    if (fig.product && fig.lvr > fig.product.maxLvr) reasons.push('above_max_lvr');
    return {
      decision: reasons.length ? 'referred_to_lender' : 'conditionally_approved',
      reasons: reasons,
    };
  }

  function requiredDocuments(app) {
    const docs = [
      ['photo_id', 'Photo ID for each applicant'],
      ['payslips', 'Your two most recent payslips'],
      ['bank_statements', 'Three months of bank statements'],
    ];
    if (app.fields.employment === 'self_employed')
      docs[1] = ['tax_returns', 'Two years of tax returns'];
    if (app.fields.loanPurpose === 'refinance')
      docs.push(['loan_statement', 'Six months of statements for your current loan']);
    else if (['found', 'contract_signed'].includes(app.fields.propertyStage))
      docs.push(['contract_of_sale', 'The contract of sale']);
    return docs;
  }

  function initApply() {
    const form = $('[data-apply-form]');
    if (!form) return;

    const steps = $$('[data-step]');
    const stepNav = $$('[data-step-nav]');
    const summaryEl = $('[data-apply-summary]');
    const choicesEl = $('[data-loan-choices]');
    const lvrNote = $('[data-lvr-note]');
    const reviewEl = $('[data-review]');

    const wanted = productByHandle(query.get('product'));
    const amount = num(query.get('amount'));
    let draft = store.getDraft();

    if (!draft) {
      const fields = {};
      if (wanted) fields.product = wanted.handle;
      if (wanted && wanted.purpose === 'investor') fields.loanPurpose = 'buy_investment';
      if (wanted && wanted.firstHomeBuyer) fields.firstHomeBuyer = 'yes';
      // Arriving from a calculator: back the amount out into a property
      // value with a 20% deposit.
      if (amount) {
        const value = Math.round(amount / 0.8 / 1000) * 1000;
        fields.propertyValue = String(value);
        fields.deposit = String(value - amount);
      }
      const customer = store.getCustomer();
      if (customer) {
        fields.email = customer.email || '';
        fields.firstName = customer.firstName || '';
        fields.lastName = customer.lastName || '';
      }
      draft = store.startDraft({
        source: query.get('source') || 'direct',
        campaign: campaignFrom(query),
        fields: fields,
      });
      fillForm(form, draft.fields);
      track.track(
        'Application Started',
        Object.assign(
          { application_id: draft.id, source: draft.source },
          draft.campaign,
          track.productProps(wanted)
        )
      );
      track.setUserProperties(
        Object.assign(
          {
            application_status: 'started',
            application_id: draft.id,
            application_started_at: draft.startedAt,
            application_resume_url: resumeUrl(),
          },
          progressProps(0),
          wanted
            ? { application_product: wanted.title, application_product_id: wanted.handle }
            : {}
        )
      );
    } else {
      if (wanted) draft.fields.product = wanted.handle;
      fillForm(form, draft.fields);
      $('[data-resume-note]').hidden = draft.step === 0;
      // Arriving from a reminder email, the link carries utm_source=braze,
      // so this event is what measures how many the email brought back.
      track.track(
        'Application Resumed',
        Object.assign(
          {
            application_id: draft.id,
            step: STEPS[draft.step],
            step_number: draft.step + 1,
            minutes_since_saved: Math.round(
              (Date.now() - new Date(draft.updatedAt).getTime()) / 60000
            ),
          },
          campaignFrom(query)
        )
      );
      track.setUserProperties({ application_last_resumed_at: new Date().toISOString() });
    }

    let current = draft.step || 0;

    // A demo persona with a portrait (Darren) sees himself beside his
    // application rather than the stock couple.
    const who = store.getCustomer();
    const photo = $('.apply-summary__photo img');
    if (who && who.avatar && photo) {
      photo.removeAttribute('srcset');
      photo.src = url('assets/img/homes/' + who.avatar + '-portrait.webp');
      photo.alt = who.firstName || '';
      photo.style.objectPosition = '50% 30%';
    }

    // The loan radios are drawn by renderChoices, so a product chosen before
    // they exist (from ?product= or a restored draft) is held here.
    let chosenProduct = draft.fields.product || null;
    const readFields = () =>
      Object.assign({ product: chosenProduct }, formValues(form));

    function save() {
      draft.fields = readFields();
      draft.step = current;
      store.saveDraft(draft);
    }

    function renderChoices() {
      const f = readFields();
      const loans = eligibleLoans(f);
      const selected = loans.find((p) => p.handle === f.product) || loans[0];
      chosenProduct = selected ? selected.handle : null;
      choicesEl.innerHTML = loans
        .map(
          (p) =>
            '<label class="loan-choice"><input type="radio" name="product" value="' +
            escapeHtml(p.handle) +
            '"' +
            (p === selected ? ' checked' : '') +
            '><span><strong>' +
            escapeHtml(p.title) +
            '</strong><span class="muted">' +
            escapeHtml(p.kicker) +
            '</span></span><span class="loan-choice__rate">' +
            store.pct(p.rate) +
            '<small>' +
            store.pct(p.comparisonRate) +
            ' comparison*</small></span></label>'
        )
        .join('');
      syncRepaymentType(form, selected);
    }

    function syncVisibility() {
      const f = formValues(form);
      const refinance = f.loanPurpose === 'refinance';
      $$('[data-buy-only]', form).forEach((el) => (el.hidden = refinance));
      $$('[data-refi-only]', form).forEach((el) => (el.hidden = !refinance));
      syncPartner(form);
    }

    function renderSummary() {
      const fig = applicationFigures(readFields());
      const rows = [
        ['Loan', fig.product ? fig.product.title : '—'],
        ['Loan amount', fig.loanAmount ? store.money0(fig.loanAmount) : '—'],
        ['LVR', fig.lvr != null ? fig.lvr + '%' : '—'],
        ['Borrowing power', current >= 3 || draft.step >= 3 ? store.money0(fig.power) : 'after step 4'],
        [
          'Repayments',
          fig.loanAmount ? store.money0(fig.repayment) + ' ' + fig.frequency : '—',
        ],
      ];
      summaryEl.innerHTML = rows
        .map(
          (r) =>
            '<div class="summary__row"><span>' +
            r[0] +
            '</span><strong>' +
            escapeHtml(r[1]) +
            '</strong></div>'
        )
        .join('');

      if (lvrNote) {
        const max = fig.product ? fig.product.maxLvr : 80;
        lvrNote.textContent = !fig.loanAmount
          ? ''
          : fig.lvr > max
          ? 'An LVR of ' + fig.lvr + '% is above the ' + max + '% this loan allows. A lender will review it.'
          : fig.lvr > 80
          ? 'An LVR of ' + fig.lvr + '% is above 80%, so lenders mortgage insurance usually applies.'
          : 'An LVR of ' + fig.lvr + '%. No lenders mortgage insurance.';
      }
    }

    function renderReview() {
      const f = readFields();
      const fig = applicationFigures(f);
      const rows = [
        ['Applicant', [f.firstName, f.lastName].filter(Boolean).join(' ') || '—'],
        ['Email', f.email || '—'],
        ['Applying', String(f.applicants) === '2' ? 'Two of us' : 'Just me'],
        ['First home', f.firstHomeBuyer === 'yes' ? 'Yes' : 'No'],
        ['Purpose', PURPOSE_LABEL[fig.purpose]],
        ['Property value', store.money0(fig.value)],
        ['Loan amount', store.money0(fig.loanAmount)],
        ['LVR', fig.lvr != null ? fig.lvr + '%' : '—'],
        ['Borrowing power', store.money0(fig.power)],
        ['Loan', fig.product ? fig.product.title : '—'],
        ['Rate', store.pct(fig.rate)],
        ['Repayments', store.money0(fig.repayment) + ' ' + fig.frequency + ' over ' + fig.years + ' years'],
      ];
      reviewEl.innerHTML = rows
        .map((r) => '<div><dt>' + r[0] + '</dt><dd>' + escapeHtml(r[1]) + '</dd></div>')
        .join('');
    }

    function refresh() {
      syncVisibility();
      renderChoices();
      renderSummary();
    }

    function showStep(index) {
      current = index;
      steps.forEach((s, i) => (s.hidden = i !== index));
      stepNav.forEach((s, i) =>
        i === index ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current')
      );
      if (STEPS[index] === 'review') renderReview();
      renderSummary();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // One event per completed stage, to both tools, so a Braze abandoned
    // application campaign knows how far someone got and a funnel of these
    // shows where applications stall. Money goes as bands except the loan
    // amount and borrowing power, which a campaign would quote back.
    function logStage(index) {
      const f = readFields();
      const fig = applicationFigures(f);
      const id = { application_id: draft.id };
      const progress = progressProps(index + 1);
      if (index === 0) {
        track.track('Applicant Details Entered', Object.assign({}, id, {
          applicant_count: Number(f.applicants) || 1,
          first_home_buyer: f.firstHomeBuyer === 'yes',
          email_provided: validEmail(f.email),
          phone_provided: !!normalisePhone(f.phone),
          marketing_opt_in: !!f.marketingOptIn,
        }));
        track.setUserProperties(Object.assign({ first_home_buyer: f.firstHomeBuyer === 'yes' }, progress));
      } else if (index === 1) {
        track.track('Property Details Entered', Object.assign({}, id, {
          loan_purpose: fig.purpose,
          property_stage: fig.refinance ? null : f.propertyStage,
          property_value_band: finance.loanBand(fig.value),
          loan_amount: fig.loanAmount,
          lvr: fig.lvr,
          state: f.state,
        }));
        track.setUserProperties(
          Object.assign(
            {
              loan_purpose: fig.purpose,
              loan_amount: fig.loanAmount,
              loan_amount_band: finance.loanBand(fig.loanAmount),
              lvr: fig.lvr,
            },
            progress
          )
        );
      } else if (index === 2) {
        track.track('Income Entered', Object.assign({}, id, {
          employment_type: f.employment,
          income_band: finance.incomeBand(fig.income),
          applicant_count: Number(f.applicants) || 1,
          other_income: num(f.otherIncome) > 0,
        }));
        track.setUserProperties(
          Object.assign({ income_band: finance.incomeBand(fig.income), employment_type: f.employment }, progress)
        );
      } else if (index === 3) {
        track.track('Expenses Entered', Object.assign({}, id, {
          dependants: num(f.dependants),
          has_other_debts: num(f.debts) > 0,
          borrowing_power: fig.power,
          within_borrowing_power: fig.loanAmount <= fig.power,
        }));
        track.setUserProperties(Object.assign({ borrowing_power: fig.power }, progress));
      } else if (index === 4) {
        track.track('Loan Selected', Object.assign({}, id, track.productProps(fig.product), {
          interest_rate: fig.rate,
          repayment_type: fig.type,
          loan_term_years: fig.years,
          repayment_frequency: fig.frequency,
          estimated_repayment: Math.round(fig.repayment),
        }));
        track.setUserProperties(
          Object.assign(
            {
              application_product: fig.product ? fig.product.title : null,
              application_product_id: fig.product ? fig.product.handle : null,
            },
            progress
          )
        );
      }
    }

    // Only the email and mobile are checked. Every other field is optional,
    // and every later step advances whatever is filled in.
    $$('[data-step-next]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // Email and mobile are what let Braze chase an abandoned
        // application, so step 1 won't advance without both, and they go
        // to Braze the moment they're given.
        const f = formValues(form);
        const email = (f.email || '').trim();
        if (current === 0) {
          // Phone first, so if both are wrong the email (the top field)
          // ends up with focus.
          const phoneOk = checkPhone(form.elements.phone);
          const emailOk = checkEmail(form.elements.email);
          if (!phoneOk || !emailOk) return;
          const person = store.signIn({
            email: email,
            phone: normalisePhone(f.phone),
            firstName: (f.firstName || '').trim(),
            lastName: (f.lastName || '').trim(),
            marketingOptIn: !!f.marketingOptIn,
            source: 'application',
          });
          track.identify(person);
        }
        // After identify, so the stage event lands on the identified user.
        logStage(current);
        current = Math.min(current + 1, steps.length - 1);
        save();
        showStep(current);
      });
    });

    $$('[data-step-back]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        current = Math.max(0, current - 1);
        save();
        showStep(current);
      });
    });

    // Typing saves the draft without an event: the stage events already
    // say how far someone got.
    form.addEventListener('input', function () {
      draft.fields = readFields();
      store.saveDraft(draft);
      refresh();
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'product') chosenProduct = e.target.value;
      refresh();
      draft.fields = readFields();
      store.saveDraft(draft);
    });

    $('[data-submit-application]').addEventListener('click', function () {
      const f = readFields();
      // A draft seeded from the demo controls can reach review without an
      // email or mobile. Send it back to step 1 rather than submit it.
      if (!validEmail(f.email) || !normalisePhone(f.phone)) {
        current = 0;
        save();
        showStep(0);
        checkPhone(form.elements.phone);
        checkEmail(form.elements.email);
        return;
      }
      const fig = applicationFigures(f);
      const outcome = decide(fig);
      const record = store.submitApplication({
        id: draft.id,
        startedAt: draft.startedAt,
        source: draft.source,
        campaign: draft.campaign || {},
        fields: f,
        product: fig.product ? fig.product.handle : null,
        productTitle: fig.product ? fig.product.title : null,
        loanAmount: fig.loanAmount,
        propertyValue: fig.value,
        lvr: fig.lvr,
        borrowingPower: fig.power,
        rate: fig.rate,
        repayment: Math.round(fig.repayment),
        frequency: fig.frequency,
        years: fig.years,
        decision: outcome.decision,
        reasons: outcome.reasons,
        status: outcome.decision,
      });

      track.track(
        'Application Submitted',
        Object.assign(
          {
            application_id: record.id,
            source: record.source,
            decision: outcome.decision,
            decision_reasons: outcome.reasons,
            loan_purpose: fig.purpose,
            first_home_buyer: f.firstHomeBuyer === 'yes',
            applicant_count: Number(f.applicants) || 1,
            loan_amount: fig.loanAmount,
            loan_amount_band: finance.loanBand(fig.loanAmount),
            property_value_band: finance.loanBand(fig.value),
            lvr: fig.lvr,
            borrowing_power: fig.power,
            repayment_type: fig.type,
            loan_term_years: fig.years,
            repayment_frequency: fig.frequency,
            estimated_repayment: Math.round(fig.repayment),
            minutes_to_submit: Math.round(
              (Date.now() - new Date(record.startedAt).getTime()) / 60000
            ),
          },
          record.campaign,
          track.productProps(fig.product),
          { interest_rate: fig.rate }
        )
      );

      track.setUserProperties(
        Object.assign(progressProps(STEPS.length), {
          application_status: outcome.decision,
          application_id: record.id,
          application_submitted_at: record.submittedAt,
          application_product: fig.product ? fig.product.title : null,
          application_product_id: fig.product ? fig.product.handle : null,
          documents_outstanding: requiredDocuments(record).length,
        })
      );

      const person = store.getCustomer();
      if (person) {
        person.applicationStatus = outcome.decision;
        store.saveCustomer(person);
      }

      store.setPref('lastApplicationId', record.id);
      location.href = url('apply/submitted/?id=' + encodeURIComponent(record.id));
    });

    refresh();
    showStep(Math.min(current, steps.length - 1));
  }

  /* ======================================================================
     Application submitted
     ====================================================================== */

  function initSubmitted() {
    const root = $('[data-application]');
    if (!root) return;
    const list = store.getApplications();
    const wanted = query.get('id') || store.getPrefs().lastApplicationId;
    let app = list.find((a) => a.id === wanted) || list[0];

    if (!app) {
      root.innerHTML =
        '<p class="muted">No application to show. <a class="link-underline" href="' +
        url('apply/') +
        '">Start one</a>.</p>';
      return;
    }

    function render() {
      const docs = requiredDocuments(app);
      const approved = app.decision === 'conditionally_approved';
      const outstanding = docs.filter((d) => !app.documents.includes(d[0])).length;
      const pic = approved
        ? { name: 'home-sweet-home', alt: 'A couple holding a Home Sweet Home sign outside their front door', position: '50% 40%' }
        : { name: 'brick-kitchen', alt: 'Friends talking in a kitchen with an exposed brick wall', position: '50% 45%' };
      root.innerHTML =
        '<div class="outcome-photo">' +
        photoHtml(pic, '(max-width: 820px) 100vw, 820px') +
        '</div>' +
        '<p class="eyebrow">Application ' +
        escapeHtml(app.id) +
        '</p>' +
        '<h1 style="margin:8px 0 14px">' +
        (approved ? 'Conditionally approved' : 'With a lender for review') +
        (app.fields.firstName ? ', ' + escapeHtml(app.fields.firstName) : '') +
        '.</h1>' +
        '<p>' +
        (approved
          ? 'Based on what you told us, we can lend you ' +
            store.money0(app.loanAmount) +
            ' on the ' +
            escapeHtml(app.productTitle) +
            '. Send your documents and a lender will confirm it.'
          : 'Your application is outside what we can approve on screen' +
            (app.reasons.includes('above_borrowing_power')
              ? ': the loan amount is above your estimated borrowing power of ' +
                store.money0(app.borrowingPower)
              : app.reasons.includes('above_max_lvr')
              ? ': the LVR is above what this loan allows'
              : '') +
            '. A lender will call you within one business day.') +
        '</p>' +
        '<p class="muted">Nothing here is a real credit decision. It&rsquo;s arithmetic on what you typed.</p>' +
        '<div class="panel-card" style="margin-top:28px">' +
        '<div class="panel-card__head"><strong>' +
        escapeHtml(app.productTitle || 'Home loan') +
        '</strong><span>' +
        store.money0(app.loanAmount) +
        '</span></div>' +
        '<div class="panel-card__items">' +
        '<div>' + store.pct(app.rate) + ', ' + app.years + ' years</div>' +
        '<div>About ' + store.money0(app.repayment) + ' ' + escapeHtml(app.frequency) + '</div>' +
        '<div>LVR ' + (app.lvr != null ? app.lvr + '%' : '—') + '</div>' +
        '</div></div>' +
        '<h2 style="margin:36px 0 6px;font-size:20px">Next: your documents</h2>' +
        '<p class="muted" style="margin-bottom:14px">' +
        (outstanding
          ? outstanding + ' of ' + docs.length + ' still to send. Nothing is really uploaded.'
          : 'All received. A lender will be in touch to take it to settlement.') +
        '</p>' +
        '<div class="doc-list">' +
        docs
          .map(function (d) {
            const done = app.documents.includes(d[0]);
            return (
              '<div class="doc"><span>' +
              escapeHtml(d[1]) +
              '</span>' +
              (done
                ? '<span class="doc__done">Received</span>'
                : '<button class="btn btn--sm btn--outline" type="button" data-upload="' +
                  d[0] +
                  '">Upload</button>') +
              '</div>'
            );
          })
          .join('') +
        '</div>';
    }

    root.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-upload]');
      if (!btn) return;
      const docs = requiredDocuments(app);
      const documents = app.documents.concat(btn.dataset.upload);
      const outstanding = docs.filter((d) => !documents.includes(d[0])).length;
      app = store.updateApplication(app.id, {
        documents: documents,
        status: outstanding ? app.status : 'documents_received',
      });
      track.track('Document Uploaded', {
        application_id: app.id,
        document_type: btn.dataset.upload,
        documents_outstanding: outstanding,
      });
      track.setUserProperties(
        Object.assign(
          { documents_outstanding: outstanding },
          outstanding ? {} : { application_status: 'documents_received' }
        )
      );
      render();
    });

    render();
    // No event on arrival: Application Submitted, sent as it was submitted,
    // carries the same application, and the page view is autocaptured.
  }

  /* ======================================================================
     Internet banking
     ====================================================================== */

  const STATUS_LABEL = {
    conditionally_approved: 'Conditionally approved',
    referred_to_lender: 'With a lender',
    documents_received: 'Documents received',
  };

  function initAccount() {
    const root = $('[data-account]');
    if (!root) return;

    function renderSignedIn(customer) {
      const draft = store.getDraft();
      const apps = store.getApplications();
      const accounts = customer.accounts || [];
      // Demo personas can carry a portrait and recent transactions.
      const portrait = customer.avatar
        ? '<img class="account-portrait" src="' +
          url('assets/img/homes/' + customer.avatar + '-portrait.webp') +
          '" alt="' +
          escapeHtml(customer.firstName || '') +
          '" width="64" height="64">'
        : '';
      const transactions = (list) =>
        list && list.length
          ? '<ul class="transactions">' +
            list
              .map(
                (t) =>
                  '<li><span>' +
                  escapeHtml(t[0]) +
                  '</span><span class="' +
                  (t[1] < 0 ? 'muted' : 'credit') +
                  '">' +
                  (t[1] < 0 ? '−' : '+') +
                  store.money(Math.abs(t[1])) +
                  '</span></li>'
              )
              .join('') +
            '</ul>'
          : '';
      root.innerHTML =
        '<div class="account-head">' +
        portrait +
        '<div><h1 style="margin-bottom:6px">' +
        escapeHtml(customer.firstName ? 'Hi, ' + customer.firstName : 'Internet banking') +
        '</h1>' +
        '<p class="muted" style="margin:0">' +
        escapeHtml(customer.email) +
        '</p></div></div>' +
        '<h2 style="margin:0 0 12px;font-size:18px">Your accounts</h2>' +
        (accounts.length
          ? accounts
              .map(
                (a) =>
                  '<div class="panel-card"><div class="panel-card__head"><strong>' +
                  escapeHtml(a.name) +
                  (a.nickname ? '<span class="account-nickname">' + escapeHtml(a.nickname) + '</span>' : '') +
                  '</strong><span' +
                  (a.balance < 0 ? ' class="muted"' : '') +
                  '>' +
                  store.money(a.balance) +
                  '</span></div><div class="panel-card__items"><div>' +
                  escapeHtml(a.number) +
                  '</div></div>' +
                  transactions(a.transactions) +
                  '</div>'
              )
              .join('')
          : '<p class="muted">No accounts yet. <a class="link-underline" href="' +
            url('everyday/everyday-account/') +
            '">Open an Everyday Account</a>.</p>') +
        '<h2 style="margin:32px 0 12px;font-size:18px">Home loan applications</h2>' +
        (draft
          ? '<div class="panel-card"><div class="panel-card__head"><strong>' +
            escapeHtml(draft.id) +
            '</strong><span>In progress: ' +
            escapeHtml(STEP_LABEL[STEPS[draft.step]]) +
            '</span></div><a class="btn btn--sm" href="' +
            url('apply/') +
            '">Continue application</a></div>'
          : '') +
        apps
          .map(
            (a) =>
              '<div class="panel-card"><div class="panel-card__head"><strong>' +
              escapeHtml(a.id) +
              '</strong><span>' +
              escapeHtml(STATUS_LABEL[a.status] || a.status) +
              '</span></div><div class="panel-card__items"><div>' +
              escapeHtml(a.productTitle || 'Home loan') +
              ' · ' +
              store.money0(a.loanAmount) +
              ' · submitted ' +
              new Date(a.submittedAt).toLocaleDateString('en-AU') +
              '</div><div><a class="link-underline" href="' +
              url('apply/submitted/?id=' + encodeURIComponent(a.id)) +
              '">View</a></div></div></div>'
          )
          .join('') +
        (!draft && !apps.length
          ? '<p class="muted">None yet. <a class="link-underline" href="' +
            url('apply/') +
            '">Start an application</a>.</p>'
          : '') +
        '<dl class="summary" style="display:grid;gap:8px;margin:32px 0 16px">' +
        '<div class="summary__row"><span>Rate updates by email</span><span>' +
        (customer.marketingOptIn ? 'Subscribed' : 'Not subscribed') +
        '</span></div>' +
        '</dl>' +
        '<button class="btn btn--outline btn--sm" data-optin-toggle>' +
        (customer.marketingOptIn ? 'Unsubscribe' : 'Subscribe to rate updates') +
        '</button> ' +
        '<button class="btn btn--outline btn--sm" data-signout>Sign out</button>';

      $('[data-signout]').addEventListener('click', function () {
        track.track('Signed Out', { email: customer.email });
        store.signOut();
        track.signOut();
        renderAuth();
      });

      $('[data-optin-toggle]').addEventListener('click', function () {
        customer.marketingOptIn = !customer.marketingOptIn;
        // An explicit unsubscribe here is the only thing that stops Braze
        // emailing; leaving the sign-up box unticked doesn't.
        customer.emailUnsubscribed = !customer.marketingOptIn;
        store.saveCustomer(customer);
        track.track(
          customer.marketingOptIn ? 'Email Subscription Started' : 'Email Subscription Stopped',
          { source: 'internet_banking' }
        );
        track.identify(customer);
        renderSignedIn(customer);
        toast(customer.marketingOptIn ? 'Subscribed to rate updates' : 'Unsubscribed');
      });
    }

    function renderAuth() {
      root.innerHTML =
        '<h1 style="margin-bottom:18px;font-size:28px">Internet banking</h1>' +
        '<div class="auth__tabs" role="tablist">' +
        '<button role="tab" aria-selected="true" data-auth-tab="signin">Log in</button>' +
        '<button role="tab" aria-selected="false" data-auth-tab="register">Register</button>' +
        '</div>' +
        '<form data-auth-form novalidate>' +
        '<div data-register-only hidden>' +
        '<label class="field"><span>First name</span><input name="firstName" autocomplete="given-name"></label>' +
        '</div>' +
        '<label class="field"><span>Email</span><input name="email" type="email" autocomplete="email"></label>' +
        '<label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password"></label>' +
        '<label class="check" data-register-only hidden><input type="checkbox" name="marketingOptIn"><span>Email me rate updates</span></label>' +
        '<button class="btn btn--block" type="submit" style="margin-top:10px" data-auth-submit>Log in</button>' +
        '</form>' +
        '<p class="muted" style="margin-top:18px;font-size:12px">No account is really created and no password is stored or checked. Any email address works: what matters is what Amplitude and Braze do with the identity.</p>';

      let mode = 'signin';
      const form = $('[data-auth-form]', root);

      $$('[data-auth-tab]', root).forEach(function (tab) {
        tab.addEventListener('click', function () {
          mode = tab.dataset.authTab;
          $$('[data-auth-tab]', root).forEach((t) =>
            t.setAttribute('aria-selected', String(t === tab))
          );
          $$('[data-register-only]', root).forEach((el) => (el.hidden = mode !== 'register'));
          $('[data-auth-submit]', root).textContent = mode === 'register' ? 'Register' : 'Log in';
        });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!checkEmail(form.elements.email)) return;
        const email = form.elements.email.value.trim();
        const customer = store.signIn({
          email: email,
          firstName: form.elements.firstName ? form.elements.firstName.value.trim() : '',
          marketingOptIn: form.elements.marketingOptIn
            ? form.elements.marketingOptIn.checked
            : false,
          source: mode === 'register' ? 'registration' : 'sign_in',
        });
        track.track(mode === 'register' ? 'Account Created' : 'Signed In', {
          email: email,
          method: 'email',
        });
        track.identify(customer);
        toast(mode === 'register' ? 'Registered' : 'Logged in');
        renderSignedIn(customer);
      });
    }

    const existing = store.getCustomer();
    if (existing) renderSignedIn(existing);
    else renderAuth();
  }

  /* ======================================================================
     Rate updates + lender callback forms
     ====================================================================== */

  function initForms() {
    $$('[data-newsletter]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const input = $('input[type=email]', form);
        const msg = $('.newsletter__msg', form.parentElement) || null;
        const email = input.value.trim();
        if (!checkEmail(input, msg)) return;
        // First, while this still counts as the visitor's own action: the
        // browser only shows the push prompt from a user gesture. Someone
        // asking to hear when rates move is the natural moment to offer it.
        if (cfg.WEB_PUSH_ON_RATE_UPDATES) track.requestWebPush('rate_updates');
        const customer = store.signIn({
          email: email,
          marketingOptIn: true,
          source: 'rate_updates',
        });
        track.track('Rate Updates Subscribed', {
          email: email,
          source: form.dataset.newsletter || 'footer',
        });
        track.identify(customer);
        if (msg) msg.textContent = "You're on the list.";
        input.value = '';
      });
    });

    $$('[data-enquiry]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const data = new FormData(form);
        // A lender can't get in touch without it.
        if (!checkEmail(form.elements.email)) return;
        const email = String(data.get('email') || '').trim();
        const customer = store.signIn({
          email: email,
          firstName: String(data.get('name') || '').split(' ')[0],
          marketingOptIn: true,
          source: 'lender_callback',
        });
        track.identify(customer);
        track.track('Lender Callback Requested', {
          topic: data.get('topic'),
          contact_method: data.get('method'),
          preferred_time: data.get('time'),
          message_length: String(data.get('message') || '').length,
        });
        track.setUserProperties({
          lead_type: 'home_loan_enquiry',
          enquiry_topic: data.get('topic'),
        });
        form.hidden = true;
        const done = $('[data-enquiry-done]', form.parentElement);
        if (done) done.hidden = false;
      });
    });

    $$('[data-contact-cta]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        track.track('Contact Method Chosen', { contact_method: btn.dataset.contactCta });
        const select = $('[data-enquiry] [name=method]');
        if (select) select.value = btn.dataset.contactCta;
      });
    });
  }

  /* ======================================================================
     Braze surfaces: content cards + in-app messages
     ====================================================================== */

  // Local stand-ins so the campaign half of the demo works before anything
  // is built in Braze. Each is clearly labelled as simulated in the UI.
  const SIMULATED_CARDS = [
    {
      id: 'sim-green',
      title: 'Our lowest variable rate: 5.59% p.a.',
      body: 'The Green Home Loan, for homes rated 7 stars or more. 5.62% p.a. comparison rate*.',
      link: 'home-loans/green-home-loan/',
      simulated: true,
    },
    {
      id: 'sim-first-home',
      title: 'Buying your first home?',
      body: 'Buy with a 5% deposit and no lenders mortgage insurance.',
      link: 'home-loans/first-home-loan/',
      simulated: true,
    },
  ];

  function initContentCards() {
    const panel = $('#cards-panel');
    if (!panel) return;
    const listEl = $('[data-cards-list]', panel);
    const badge = $('[data-cards-count]');
    let cards = [];

    function render() {
      const html = cards.length
        ? cards
            .map(
              (c) =>
                '<div class="cc" data-card="' +
                escapeHtml(c.id) +
                '"><span class="cc__title">' +
                escapeHtml(c.title) +
                '</span><span class="cc__body">' +
                escapeHtml(c.body) +
                '</span>' +
                (c.simulated
                  ? '<span class="cc__tag">Simulated — no Braze key</span>'
                  : '<span class="cc__tag">Braze content card</span>') +
                '</div>'
            )
            .join('')
        : '<p class="muted" style="margin:0">Nothing here right now.</p>';
      listEl.innerHTML = html;
      if (badge) {
        badge.textContent = String(cards.length);
        badge.hidden = cards.length === 0;
      }
    }

    function adoptBrazeCards(brazeCards) {
      cards = brazeCards.map((c) => ({
        id: c.id,
        title: c.title || c.extras?.title || 'Update',
        body: c.description || c.extras?.body || '',
        link: c.url || null,
        brazeCard: c,
        simulated: false,
      }));
      render();
    }

    document.addEventListener('laneway:contentcards', (e) => adoptBrazeCards(e.detail));

    const live = track.cachedContentCards();
    if (live.length) adoptBrazeCards(live);
    else if (cfg.SIMULATE_IAM) {
      cards = SIMULATED_CARDS.slice();
      render();
    } else {
      render();
    }

    $$('[data-cards-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.hidden = !panel.hidden;
        // Opening the panel is when the cards are actually seen.
        if (!panel.hidden) track.logContentCardImpressions(cards);
      });
    });

    document.addEventListener('click', function (e) {
      if (
        !panel.hidden &&
        !e.target.closest('#cards-panel') &&
        !e.target.closest('[data-cards-toggle]')
      )
        panel.hidden = true;
    });

    listEl.addEventListener('click', function (e) {
      const el = e.target.closest('[data-card]');
      if (!el) return;
      const card = cards.find((c) => c.id === el.dataset.card);
      if (!card) return;
      track.logContentCardClick(card);
      if (card.link) location.href = /^https?:/.test(card.link) ? card.link : url(card.link);
    });

    render();
  }

  /* --- simulated in-app messages ----------------------------------------- */

  let iamShownThisPage = false;

  // `force` is for the demo controls, which need to fire a message even if
  // one has already appeared on this page or was dismissed earlier.
  function showIam(message, force) {
    if (!cfg.SIMULATE_IAM) return;
    if (!force) {
      if (iamShownThisPage) return;
      if (store.getPrefs()['iam_dismissed_' + message.id]) return;
    }
    $$('.iam').forEach((el) => el.remove());
    iamShownThisPage = true;

    const el = document.createElement('div');
    el.className = 'iam';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', message.title);
    el.innerHTML =
      '<button class="iam__close" data-iam-close aria-label="Close">&times;</button>' +
      '<p class="iam__tag">' +
      (message.simulated === false ? 'Braze' : 'Simulated Braze in-app message') +
      '</p>' +
      '<p class="iam__title">' +
      escapeHtml(message.title) +
      '</p>' +
      '<p class="iam__body">' +
      escapeHtml(message.body) +
      '</p>' +
      '<div class="iam__actions">' +
      '<button class="btn btn--sm" data-iam-click>' +
      escapeHtml(message.cta) +
      '</button>' +
      '<button class="btn btn--sm btn--outline" data-iam-close>Not now</button>' +
      '</div>';
    document.body.appendChild(el);

    track.logInAppMessageInteraction('Shown', {
      message_id: message.id,
      campaign: message.campaign,
      trigger: message.trigger,
      simulated: true,
    });

    $('[data-iam-click]', el).addEventListener('click', function () {
      track.logInAppMessageInteraction('Clicked', {
        message_id: message.id,
        campaign: message.campaign,
        trigger: message.trigger,
        simulated: true,
      });
      el.remove();
      if (message.link) location.href = url(message.link);
    });

    $$('[data-iam-close]', el).forEach((b) =>
      b.addEventListener('click', function () {
        track.logInAppMessageInteraction('Dismissed', {
          message_id: message.id,
          campaign: message.campaign,
          simulated: true,
        });
        store.setPref('iam_dismissed_' + message.id, true);
        el.remove();
      })
    );
  }

  function maybeShowBorrowingNudge(amount) {
    if (!amount || store.getDraft()) return;
    showIam({
      id: 'borrowing-power',
      campaign: 'Calculator to application',
      trigger: 'Borrowing Power Calculated, no application started',
      title: 'You could borrow around ' + store.money0(amount),
      body: 'Take that number into an application. It takes about 20 minutes, and you can save as you go.',
      cta: 'Start an application',
      link: 'apply/?amount=' + amount + '&source=in_app_message',
    });
  }

  function maybeShowReturningNudge() {
    const draft = store.getDraft();
    if (!draft || document.body.dataset.page === 'apply') return;
    const age = Date.now() - new Date(draft.updatedAt || Date.now()).getTime();
    // A real Braze abandoned application campaign waits a day. Two minutes
    // keeps the demo watchable.
    if (age < 120000) return;
    showIam({
      id: 'abandoned-application',
      campaign: 'Abandoned application',
      trigger: 'application untouched for 2 minutes (a day, in a real campaign)',
      title: 'Your application is saved',
      body:
        "You're up to step " +
        (draft.step + 1) +
        ' of ' +
        STEPS.length +
        ': ' +
        STEP_LABEL[STEPS[draft.step]].toLowerCase() +
        '. Pick up where you left off.',
      cta: 'Continue application',
      link: 'apply/',
    });
  }

  /* ======================================================================
     Package Home Loan landing page
     ====================================================================== */

  function initLanding() {
    const product = PAGE.product;
    if (!product) return;
    const props = track.productProps(product);
    const campaign = campaignFrom(query);

    store.recordView(product.handle);
    track.track('Product Viewed', Object.assign({ page_type: 'landing' }, campaign, props));
    track.setUserProperties({
      last_product_viewed: product.title,
      last_category_viewed: product.categoryTitle,
    });

    // The sticky apply bar appears once the hero's buttons scroll away.
    const sticky = $('.lp-sticky');
    const heroActions = $('.lp-hero__actions');
    if (sticky && heroActions) {
      new IntersectionObserver(
        (entries) => sticky.classList.toggle('lp-sticky--visible', !entries[0].isIntersecting),
        { rootMargin: '-60px 0px 0px 0px' }
      ).observe(heroActions);
    }

    $$('[data-lp-cta]').forEach(function (a) {
      a.addEventListener('click', function () {
        track.trackAnalyticsOnly('Landing CTA Clicked', Object.assign({ cta: a.dataset.lpCta }, campaign));
      });
    });

    $$('[data-faq]').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        track.trackAnalyticsOnly('FAQ Opened', {
          question: $('summary', d).textContent.trim(),
          position: Number(d.dataset.faq),
          page_type: 'landing',
        });
      });
    });

    let deepSeen = false;
    window.addEventListener(
      'scroll',
      function () {
        if (deepSeen) return;
        if ((window.scrollY + window.innerHeight) / document.body.scrollHeight > 0.7) {
          deepSeen = true;
          track.track('Product Detail Read', Object.assign({ page_type: 'landing' }, props));
        }
      },
      { passive: true }
    );

    initOffsetCalc(product, campaign);
  }

  function initOffsetCalc(product, campaign) {
    const form = $('[data-offset-calc]');
    if (!form) return;
    const out = (k) => $('[data-out="' + k + '"]');
    const years = cfg.LOAN_TERM_YEARS || 30;

    const duration = (months) => {
      const y = Math.floor(months / 12);
      const m = months % 12;
      if (!y && !m) return 'on schedule';
      return (
        [y ? y + (y === 1 ? ' year' : ' years') : '', m ? m + (m === 1 ? ' month' : ' months') : '']
          .filter(Boolean)
          .join(' ') + ' sooner'
      );
    };

    function compute() {
      const loan = num(form.elements.loan.value);
      const offset = num(form.elements.offset.value);
      const s = finance.offsetSavings(loan, offset, product.rate, years);
      // What the Package costs each year over the no-fee Variable Home Loan.
      const extraCost = (loan * (product.rate - PAGE.variableRate)) / 100 + PAGE.annualFee;
      const breakeven = extraCost / (product.rate / 100);
      return { loan, offset, s, extraCost, breakeven, net: s.firstYear - extraCost };
    }

    function render() {
      const r = compute();
      out('loan').textContent = store.money0(r.loan);
      out('offset').textContent = store.money0(r.offset);
      out('total').textContent = store.money0(r.s.interestSaved);
      out('year').textContent = store.money0(r.s.firstYear);
      out('sooner').textContent = duration(r.s.monthsSooner);
      const share = r.s.interestWithout
        ? (r.s.interestWithout - r.s.interestSaved) / r.s.interestWithout
        : 1;
      $('[data-bar="with"]').style.width = Math.max(2, Math.round(share * 100)) + '%';
      out('verdict').textContent =
        r.net >= 0
          ? 'After the ' +
            store.money0(PAGE.annualFee) +
            ' fee and the rate difference, that works out about ' +
            store.money0(r.net) +
            ' a year ahead of our no-fee Variable Home Loan, before counting the free Rewards Card.'
          : 'With less than about ' +
            store.money0(Math.ceil(r.breakeven / 100) * 100) +
            ' in offset on this loan, our no-fee Variable Home Loan would cost less. The Package pays off as your savings grow.';
      return r;
    }

    // One event per settled calculation, not one per slider tick.
    const log = debounce(function () {
      const r = compute();
      track.track(
        'Offset Savings Calculated',
        Object.assign(
          {
            loan_amount: r.loan,
            loan_amount_band: finance.loanBand(r.loan),
            offset_balance: r.offset,
            interest_saved_first_year: Math.round(r.s.firstYear),
            interest_saved_total: Math.round(r.s.interestSaved),
            months_sooner: r.s.monthsSooner,
            package_beats_variable: r.net >= 0,
            page_type: 'landing',
          },
          campaign,
          track.productProps(product)
        )
      );
      // A campaign can quote this straight back: "your $40,000 would save
      // you $2,376 this year".
      track.setUserProperties({
        estimated_offset_saving: Math.round(r.s.firstYear),
        offset_balance: r.offset,
      });
    }, 1200);

    form.addEventListener('input', function () {
      render();
      log();
    });
    render();
  }

  /* ======================================================================
     Boot
     ====================================================================== */

  let booted = false;

  function boot() {
    if (booted) return;
    booted = true;

    initHeader();
    initSearch();
    initForms();
    initContentCards();
    initRecommendations();

    const page = document.body.dataset.page;
    if (page === 'product') initProduct();
    if (page === 'collection') initCollection();
    if (page === 'calc-borrowing') initBorrowingCalc();
    if (page === 'calc-repayments') initRepaymentsCalc();
    if (page === 'apply') initApply();
    if (page === 'submitted') initSubmitted();
    if (page === 'account') initAccount();
    if (page === 'landing') initLanding();

    // Page views come from Amplitude autocapture (AMPLITUDE_AUTOCAPTURE).
    setTimeout(maybeShowReturningNudge, 2500);

    if (window.LanewayDevtools) window.LanewayDevtools.mount();
  }

  function start() {
    // Links for the presenter, so nobody has to open the event stream on
    // stage: ?demo=darren becomes Darren (presentation only) and
    // ?demo=reset wipes the browser clean. Either way the address is
    // cleaned up afterwards, so a reload doesn't do it again.
    const demo = query.get('demo');
    const tools = window.LanewayDevtools;
    if (demo && tools) {
      const clean = location.pathname + location.hash;
      if (demo === 'darren') tools.becomeDarren();
      if (demo === 'reset') tools.startFresh();
      location.replace(clean);
      return;
    }
    track.init();
    boot();
  }

  // Exposed so the dev panel can drive the site during a demo.
  window.LanewayApp = {
    toast,
    showIam,
    recommend,
    cardHtml,
    STEPS,
    progressProps,
    requiredDocuments,
    reboot: renderDraftIndicator,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
