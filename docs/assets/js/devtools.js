/* ==========================================================================
   Laneway demo — event stream drawer

   The narration device. Shows every Amplitude and Braze call as it happens,
   which sink it went to, and whether it was actually sent or held back
   because a key is still a placeholder. Also carries the demo controls:
   switch persona, fire a simulated campaign, wipe state.

   Toggle with the ` key (configurable) or the button bottom-right.
   ========================================================================== */

(function () {
  'use strict';

  const store = window.LanewayStore;
  const track = window.LanewayTrack;
  const cfg = window.LANEWAY_CONFIG || {};

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const SINK_LABEL = { amplitude: 'AMP', braze: 'BRAZE', store: 'STORE' };

  /* --- demo personas ------------------------------------------------------ */

  // Three profiles that land in different Braze segments and different
  // Amplitude cohorts, so you can show the same page behaving differently.
  const PERSONAS = [
    {
      key: 'new',
      label: 'Priya — first visit',
      customer: {
        email: 'priya.raman@example.com',
        firstName: 'Priya',
        lastName: 'Raman',
        persona: 'first_visit',
        marketingOptIn: false,
        lifetimeOrders: 0,
        lifetimeValue: 0,
        favouriteBrand: null,
      },
    },
    {
      key: 'repeat',
      label: 'Dan — repeat buyer',
      customer: {
        email: 'dan.whitfield@example.com',
        firstName: 'Dan',
        lastName: 'Whitfield',
        persona: 'repeat_buyer',
        marketingOptIn: true,
        lifetimeOrders: 4,
        lifetimeValue: 412.8,
        favouriteBrand: 'Southbank',
      },
    },
    {
      key: 'vip',
      label: 'Mei — high value',
      customer: {
        email: 'mei.tanaka@example.com',
        firstName: 'Mei',
        lastName: 'Tanaka',
        persona: 'high_value',
        marketingOptIn: true,
        lifetimeOrders: 11,
        lifetimeValue: 1864.5,
        favouriteBrand: 'Laneway',
      },
    },
  ];

  /* --- markup ------------------------------------------------------------- */

  function drawerHtml() {
    return (
      '<div class="dev-drawer__head">' +
      '<strong>Event stream</strong>' +
      '<span class="dev-spacer"></span>' +
      '<button type="button" data-dev-clear>clear</button>' +
      '<button type="button" data-dev-close aria-label="Close">close</button>' +
      '</div>' +
      '<div class="dev-tabs" role="tablist">' +
      '<button role="tab" aria-selected="true" data-dev-tab="stream">Stream</button>' +
      '<button role="tab" aria-selected="false" data-dev-tab="controls">Controls</button>' +
      '<button role="tab" aria-selected="false" data-dev-tab="state">State</button>' +
      '</div>' +
      '<div class="dev-body">' +
      '<div class="dev-pane" data-dev-pane="stream">' +
      '<div class="dev-status" data-dev-status></div>' +
      '<div data-dev-filters style="margin-bottom:10px">' +
      '<button class="dev-btn" data-dev-filter="all" aria-pressed="true">all</button>' +
      '<button class="dev-btn" data-dev-filter="amplitude">amplitude</button>' +
      '<button class="dev-btn" data-dev-filter="braze">braze</button>' +
      '</div>' +
      '<div data-dev-list></div>' +
      '</div>' +
      '<div class="dev-pane" data-dev-pane="controls" hidden>' +
      '<div class="dev-section"><h4>Identity</h4>' +
      '<div data-dev-personas></div>' +
      '<button class="dev-btn" data-dev-signout>sign out + reset identity</button>' +
      '</div>' +
      // Only offered while simulation is on; with it off they'd do nothing.
      (cfg.SIMULATE_IAM
        ? '<div class="dev-section"><h4>Braze campaigns (simulated)</h4>' +
          '<button class="dev-btn" data-dev-iam="abandoned">cart abandonment</button>' +
          '<button class="dev-btn" data-dev-iam="winback">win-back offer</button>' +
          '<button class="dev-btn" data-dev-iam="restock">back in stock</button>' +
          '<p class="dev-note">These fire locally so the campaign half of the demo works before anything is built in Braze. Each one logs <code>In-App Message Shown</code> to Amplitude, which is how you measure campaign lift. Set <code>SIMULATE_IAM: false</code> once real Braze campaigns are live.</p>' +
          '</div>'
        : '') +
      '<div class="dev-section"><h4>Cart</h4>' +
      '<button class="dev-btn" data-dev-seed-cart>add 3 random items</button>' +
      '<button class="dev-btn" data-dev-clear-cart>empty cart</button>' +
      '</div>' +
      '<div class="dev-section"><h4>Reset</h4>' +
      '<button class="dev-btn" data-dev-reset>wipe all local state</button>' +
      '<p class="dev-note">Clears cart, customer, orders, history and the storefront password cookie, then reloads.</p>' +
      '</div>' +
      '</div>' +
      '<div class="dev-pane" data-dev-pane="state" hidden>' +
      '<div data-dev-state></div>' +
      '</div>' +
      '</div>'
    );
  }

  /* --- rendering ---------------------------------------------------------- */

  let drawer = null;
  let fab = null;
  let filter = 'all';
  let mounted = false;

  const time = (t) =>
    new Date(t).toLocaleTimeString('en-AU', { hour12: false });

  function eventHtml(entry) {
    const payload =
      entry.payload && Object.keys(entry.payload).length
        ? '<pre>' +
          escapeHtml(JSON.stringify(entry.payload, null, 1)) +
          '</pre>'
        : '';
    return (
      '<div class="dev-event dev-event--' +
      entry.sink +
      '" data-sink="' +
      entry.sink +
      '">' +
      '<div class="dev-event__head">' +
      '<span class="dev-event__time">' +
      time(entry.t) +
      '</span>' +
      '<span class="dev-event__sink">' +
      (SINK_LABEL[entry.sink] || entry.sink) +
      '</span>' +
      '<span class="dev-event__name">' +
      escapeHtml(entry.name) +
      '</span>' +
      '</div>' +
      payload +
      (entry.note
        ? '<div class="dev-event__stub">' + escapeHtml(entry.note) + '</div>'
        : '') +
      '</div>'
    );
  }

  const escapeHtml = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);

  function renderList() {
    const list = $('[data-dev-list]', drawer);
    if (!list) return;
    const entries = store
      .logRead()
      .filter((e) => filter === 'all' || e.sink === filter)
      .slice(-80)
      .reverse();
    list.innerHTML = entries.length
      ? entries.map(eventHtml).join('')
      : '<p class="dev-note">Nothing yet. Click around the store.</p>';
  }

  function renderStatus() {
    const el = $('[data-dev-status]', drawer);
    if (!el) return;
    const rows = [
      ['Amplitude', track.state.amplitude],
      ['Braze', track.state.braze],
    ].map(function (pair) {
      const s = pair[1];
      const cls = s.ready
        ? 'dev-status__dot--live'
        : s.configured
        ? 'dev-status__dot--stub'
        : 'dev-status__dot--stub';
      const label = s.ready
        ? 'live'
        : s.configured
        ? 'configured, not loaded'
        : 'placeholder key — dry run';
      return (
        '<div class="dev-status__row"><span class="dev-status__dot ' +
        cls +
        '"></span><span class="dev-status__label">' +
        pair[0] +
        '</span><span>' +
        label +
        '</span></div>'
      );
    });
    el.innerHTML = rows.join('');
  }

  function renderState() {
    const el = $('[data-dev-state]', drawer);
    if (!el) return;
    const customer = store.getCustomer();
    const cart = store.getCart();
    const totals = store.cartTotals(cart);
    const rows = [
      ['device_id', store.anonId()],
      ['session_id', store.sessionId()],
      ['user_id', customer ? customer.email : '(anonymous)'],
      ['braze_external_id', customer ? customer.id : '(anonymous)'],
      ['persona', (customer && customer.persona) || '—'],
      ['lifetime_orders', customer ? customer.lifetimeOrders || 0 : 0],
      ['lifetime_value', customer ? store.money(customer.lifetimeValue || 0) : '—'],
      ['marketing_opt_in', customer ? String(!!customer.marketingOptIn) : '—'],
      ['cart_size', totals.count],
      ['cart_value', store.money(totals.subtotal)],
      ['orders_placed', store.getOrders().length],
      ['recently_viewed', store.recentlyViewed().slice(0, 4).join(', ') || '—'],
      ['storage', store.storageAvailable() ? 'localStorage' : 'in-memory'],
    ];
    el.innerHTML =
      '<dl class="dev-kv">' +
      rows
        .map(
          (r) =>
            '<dt>' + escapeHtml(r[0]) + '</dt><dd>' + escapeHtml(r[1]) + '</dd>'
        )
        .join('') +
      '</dl>' +
      '<p class="dev-note" style="margin-top:16px">Amplitude sees <code>user_id</code> and a <code>braze_external_id</code> user property. Braze sees <code>external_id</code> and an <code>amplitude_device_id</code> custom attribute. That pair is what lets you take an Amplitude cohort and find the same people in Braze.</p>';
  }

  function updateFabCount() {
    if (!fab) return;
    const count = store.logRead().length;
    $('.dev-fab__count', fab).textContent = count ? String(count) : '';
  }

  /* --- controls ----------------------------------------------------------- */

  const SIM_CAMPAIGNS = {
    abandoned: {
      id: 'demo-abandoned',
      campaign: 'Cart abandonment',
      trigger: 'manual (demo control)',
      title: 'Your cart is waiting',
      body: 'Come back and finish up — we held everything for you.',
      cta: 'View cart',
      link: 'cart/',
    },
    winback: {
      id: 'demo-winback',
      campaign: 'Win-back — 60 days inactive',
      trigger: 'manual (demo control)',
      title: "It's been a while",
      body: 'The Signature Range dropped since you were last here.',
      cta: 'See what&rsquo;s new',
      link: 'collections/signature/',
    },
    restock: {
      id: 'demo-restock',
      campaign: 'Back in stock',
      trigger: 'manual (demo control)',
      title: 'The Studio Jacket is back',
      body: 'Limited run, restocked this morning.',
      cta: 'Shop the jacket',
      link: 'products/heavyweight-studio-jacket/',
    },
  };

  function wireControls() {
    // Personas
    const holder = $('[data-dev-personas]', drawer);
    holder.innerHTML = PERSONAS.map(
      (p) =>
        '<button class="dev-btn" data-dev-persona="' +
        p.key +
        '">' +
        escapeHtml(p.label) +
        '</button>'
    ).join('');

    holder.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-dev-persona]');
      if (!btn) return;
      const persona = PERSONAS.find((p) => p.key === btn.dataset.devPersona);
      const customer = store.signIn(
        Object.assign({ source: 'demo_persona' }, persona.customer)
      );
      track.track('Signed In', { email: customer.email, method: 'demo_persona' });
      track.identify(customer);
      renderState();
      if (window.LanewayApp) window.LanewayApp.toast('Now browsing as ' + persona.customer.firstName);
    });

    $('[data-dev-signout]', drawer).addEventListener('click', function () {
      store.signOut();
      track.resetIdentity();
      renderState();
    });

    $$('[data-dev-iam]', drawer).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const message = SIM_CAMPAIGNS[btn.dataset.devIam];
        // force: ignore the once-per-page guard and any earlier dismissal, so
        // the same button works repeatedly while presenting.
        if (window.LanewayApp) window.LanewayApp.showIam(message, true);
      });
    });

    $('[data-dev-seed-cart]', drawer).addEventListener('click', function () {
      const pool = (window.LANEWAY_INDEX || { products: [] }).products;
      const added = [];
      for (let i = 0; i < 3; i++) {
        const p = pool[Math.floor(Math.random() * pool.length)];
        if (!p) break;
        const line = {
          handle: p.handle,
          variantId: p.firstVariantId,
          variantTitle: p.firstVariantTitle,
          title: p.title,
          price: p.priceMin,
          quantity: 1,
          image: p.image,
          brand: p.brand,
          category: p.category,
          tier: p.tier,
          selectedOptions: p.firstVariantOptions,
        };
        store.addToCart(line);
        added.push(line);
      }
      track.track('Cart Seeded', {
        source: 'demo_control',
        products: track.cartProducts(added),
      });
      renderState();
      if (window.LanewayApp) window.LanewayApp.reboot();
      if (document.body.dataset.page === 'cart') location.reload();
    });

    $('[data-dev-clear-cart]', drawer).addEventListener('click', function () {
      store.clearCart();
      track.setUserProperties({ cart_value: 0, cart_size: 0 });
      renderState();
      if (window.LanewayApp) window.LanewayApp.reboot();
      if (document.body.dataset.page === 'cart') location.reload();
    });

    $('[data-dev-reset]', drawer).addEventListener('click', function () {
      store.resetAll();
      location.href = (window.LANEWAY_BASE || '') + 'index.html';
    });

    $('[data-dev-clear]', drawer).addEventListener('click', function () {
      store.logClear();
      renderList();
      updateFabCount();
    });

    $$('[data-dev-filter]', drawer).forEach(function (btn) {
      btn.addEventListener('click', function () {
        filter = btn.dataset.devFilter;
        $$('[data-dev-filter]', drawer).forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        renderList();
      });
    });

    $$('[data-dev-tab]', drawer).forEach(function (tab) {
      tab.addEventListener('click', function () {
        const name = tab.dataset.devTab;
        $$('[data-dev-tab]', drawer).forEach((t) =>
          t.setAttribute('aria-selected', String(t === tab))
        );
        $$('[data-dev-pane]', drawer).forEach(
          (p) => (p.hidden = p.dataset.devPane !== name)
        );
        if (name === 'state') renderState();
      });
    });

    $('[data-dev-close]', drawer).addEventListener('click', close);
  }

  /* --- open / close ------------------------------------------------------- */

  function open() {
    drawer.classList.add('dev-drawer--open');
    renderList();
    renderStatus();
    renderState();
    store.setPref('devDrawerOpen', true);
  }

  function close() {
    drawer.classList.remove('dev-drawer--open');
    store.setPref('devDrawerOpen', false);
  }

  function toggle() {
    if (drawer.classList.contains('dev-drawer--open')) close();
    else open();
  }

  /* --- mount -------------------------------------------------------------- */

  function mount() {
    if (mounted || !cfg.SHOW_DEV_DRAWER) return;
    mounted = true;

    drawer = document.createElement('aside');
    drawer.className = 'dev dev-drawer';
    drawer.setAttribute('aria-label', 'Amplitude and Braze event stream');
    drawer.innerHTML = drawerHtml();
    document.body.appendChild(drawer);

    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'dev dev-fab';
    fab.innerHTML =
      '<span class="dev-fab__dot"></span><span>Event stream</span><span class="dev-fab__count"></span>';
    fab.addEventListener('click', toggle);
    document.body.appendChild(fab);

    wireControls();
    renderList();
    renderStatus();
    updateFabCount();

    track.onRecord(function () {
      if (drawer.classList.contains('dev-drawer--open')) {
        renderList();
        renderStatus();
      }
      updateFabCount();
    });

    store.on('cart:changed', function () {
      if (drawer.classList.contains('dev-drawer--open')) renderState();
    });

    document.addEventListener('keydown', function (e) {
      const key = cfg.DEV_DRAWER_KEY || '`';
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(
        document.activeElement.tagName
      );
      if (e.key === key && !typing) {
        e.preventDefault();
        toggle();
      }
    });

    if (store.getPrefs().devDrawerOpen) open();
  }

  window.LanewayDevtools = { mount, open, close, toggle, PERSONAS };
})();
