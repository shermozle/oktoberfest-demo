/* ==========================================================================
   Laneway Bank demo — event stream drawer

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
  // Phone numbers are from ACMA's range reserved for fiction, so nothing
  // Braze sends them reaches a real person.
  const PERSONAS = [
    {
      key: 'first-home',
      label: 'Priya — first home buyer',
      customer: {
        email: 'priya.raman@example.com',
        phone: '+61491570006',
        firstName: 'Priya',
        lastName: 'Raman',
        persona: 'first_home_buyer',
        marketingOptIn: false,
        existingCustomer: false,
        hasHomeLoan: false,
        accounts: [],
      },
    },
    {
      key: 'refinancer',
      label: 'Dan — refinancing from another bank',
      customer: {
        email: 'dan.whitfield@example.com',
        phone: '+61491570157',
        firstName: 'Dan',
        lastName: 'Whitfield',
        persona: 'refinancer',
        marketingOptIn: true,
        existingCustomer: true,
        hasHomeLoan: false,
        accounts: [
          { name: 'Everyday Account', number: 'BSB 063-114 · 1042 7789', balance: 4210.55 },
          { name: 'Bonus Saver', number: 'BSB 063-114 · 1042 7790', balance: 18350.0 },
        ],
      },
    },
    {
      key: 'investor',
      label: 'Mei — investor, existing home loan',
      customer: {
        email: 'mei.tanaka@example.com',
        phone: '+61491570158',
        firstName: 'Mei',
        lastName: 'Tanaka',
        persona: 'investor',
        marketingOptIn: true,
        existingCustomer: true,
        hasHomeLoan: true,
        accounts: [
          { name: 'Package Home Loan', number: 'Loan 7710 2284', balance: -612400.0 },
          { name: 'Offset Account', number: 'BSB 063-114 · 2281 0045', balance: 48912.3 },
          { name: 'Rewards Card', number: 'Card ending 4417', balance: -1284.6 },
        ],
      },
    },
  ];

  // Darren Whitlock, the hipster in Akshin's Braze demo, as the presenter
  // shows him on the site. Presentation-only (demoOnly): nothing done as
  // him here is tied to his real user in Amplitude or Braze, whose history
  // (from datagen, and Akshin's live Braze profile) is the reveal at the
  // end of the demo. Every business in his transactions is invented.
  const DARREN = {
    demoOnly: true,
    email: 'darren.whitlock@example.com',
    phone: '+61491570156',
    firstName: 'Darren',
    lastName: 'Whitlock',
    persona: 'first_home_buyer',
    avatar: 'darren',
    marketingOptIn: true,
    existingCustomer: true,
    hasHomeLoan: false,
    accounts: [
      {
        name: 'Everyday Account',
        number: 'BSB 063-114 · 2650 4800',
        balance: 1284.2,
        transactions: [
          ['Hop Theory Brewing Co, Collingwood', -36.5],
          ['Wax & Whisker beard oil, cedar and bergamot', -42.0],
          ['Oat & Ember, oat flat white', -6.2],
          ['Dead Wax Records, Fitzroy', -54.99],
          ['Sourdough Society, monthly starter subscription', -18.0],
          ['Fixed Gear Co, chain tune-up', -45.0],
          ['Kombucha on Tap, Brunswick', -9.5],
        ],
      },
      {
        name: 'Bonus Saver',
        nickname: 'House deposit (do not touch)',
        number: 'BSB 063-114 · 2650 4801',
        balance: 82450.0,
        transactions: [['Monthly deposit (fewer IPAs this month)', 1200.0]],
      },
    ],
  };

  // Darren as the presenter shows him: signed in, with his First Home Loan
  // application three steps from the end. Presentation only, so nothing is
  // sent: his real history in Amplitude comes from datagen.
  function becomeDarren() {
    const customer = store.signIn(Object.assign({ source: 'demo_control' }, DARREN));
    track.identify(customer); // not sent: presentation-only
    const draft = store.startDraft({
      id: 'app_lwb_0001',
      source: 'product_page',
      step: 3,
      fields: {
        email: customer.email,
        phone: '0491 570 156',
        firstName: 'Darren',
        lastName: 'Whitlock',
        applicants: '1',
        firstHomeBuyer: 'yes',
        marketingOptIn: true,
        loanPurpose: 'buy_home',
        propertyStage: 'found',
        propertyValue: '560000',
        deposit: '80000',
        state: 'NSW',
        postcode: '2650',
        employment: 'full_time',
        income: '98000',
        otherIncome: '0',
        product: 'first-home-loan',
      },
    });
    // Saved three minutes ago, so it already reads as abandoned.
    draft.updatedAt = new Date(Date.now() - 180000).toISOString();
    store.saveDraft(draft, true);
    if (window.LanewayApp) window.LanewayApp.reboot();
  }

  // As if this browser had never visited: new device id in both tools, and
  // everything the site saved gone.
  function startFresh() {
    track.freshStart();
    store.resetAll();
  }

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
      '<button class="dev-btn" data-dev-signout>reset identity (new anonymous visitor)</button>' +
      '</div>' +
      // Only offered while simulation is on; with it off they'd do nothing.
      (cfg.SIMULATE_IAM
        ? '<div class="dev-section"><h4>Braze campaigns (simulated)</h4>' +
          '<button class="dev-btn" data-dev-iam="abandoned">abandoned application</button>' +
          '<button class="dev-btn" data-dev-iam="ratecut">rate cut</button>' +
          '<button class="dev-btn" data-dev-iam="refinance">refinance offer</button>' +
          '<p class="dev-note">These fire locally so the campaign half of the demo works before anything is built in Braze. Each one logs <code>In-App Message Shown</code> to Amplitude, which is how you measure campaign lift. Set <code>SIMULATE_IAM: false</code> once real Braze campaigns are live.</p>' +
          '</div>'
        : '') +
      '<div class="dev-section"><h4>Application</h4>' +
      '<button class="dev-btn dev-btn--primary" data-dev-seed-application>be Darren: First Home Loan, $480k, stopped at step 4</button>' +
      '<button class="dev-btn" data-dev-clear-application>discard the application in progress</button>' +
      '<p class="dev-note">Shows the site as Darren Whitlock, the hipster in Akshin\'s Braze demo, sees it: his First Home Loan application stopped at step 4, Your expenses, and internet banking that shows where the money goes. Presentation only: nothing is sent to Darren\'s real user in Amplitude or Braze. Use <em>start fresh</em> afterwards.</p>' +
      '</div>' +
      '<div class="dev-section"><h4>Reset</h4>' +
      '<button class="dev-btn dev-btn--primary" data-dev-reset>start fresh: new device id, nothing saved</button>' +
      '<p class="dev-note">As if this browser had never visited: a new device id in Amplitude and Braze, a new session, and the application, customer, submitted applications, history and this event log all gone. Reloads the home page. Browser permissions such as web push stay as they are.</p>' +
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
      : '<p class="dev-note">Nothing yet. Click around the site.</p>';
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
    const draft = store.getDraft();
    const apps = store.getApplications();
    const id = track.ids();
    const show = (v, loaded) => (loaded ? v || '(none: anonymous)' : '(SDK not loaded)');
    const same = (a, b) =>
      !id.ready.amplitude || !id.ready.braze ? '—' : a === b ? 'yes' : 'NO';
    const rows = [
      ['amplitude user_id', show(id.amplitudeUserId, id.ready.amplitude)],
      ['braze external_id', show(id.brazeExternalId, id.ready.braze)],
      ['user ids match', same(id.amplitudeUserId, id.brazeExternalId)],
      ['amplitude device_id', show(id.amplitudeDeviceId, id.ready.amplitude)],
      ['braze device_id', show(id.brazeDeviceId, id.ready.braze)],
      ['device ids match', same(id.amplitudeDeviceId, id.brazeDeviceId)],
      ['session_id', store.sessionId()],
      ['persona', (customer && customer.persona) || '—'],
      ['existing_customer', customer ? String(!!customer.existingCustomer) : '—'],
      ['has_home_loan', customer ? String(!!customer.hasHomeLoan) : '—'],
      ['marketing_opt_in', customer ? String(!!customer.marketingOptIn) : '—'],
      ['application_in_progress', draft ? draft.id + ' (step ' + (draft.step + 1) + ' of 6)' : '—'],
      ['applications_submitted', apps.length],
      ['last_decision', apps[0] ? apps[0].status : '—'],
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
      '<p class="dev-note" style="margin-top:16px">Braze Currents sends Braze events to Amplitude with the Braze external id as <code>user_id</code>, and matches anonymous visitors by device id. Both pairs have to match for content card and push interactions to land on the right Amplitude user. Signing out of internet banking keeps the Braze user, as Braze recommends; <em>reset identity</em> starts both tools afresh.</p>';
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
      campaign: 'Abandoned application',
      trigger: 'manual (demo control)',
      title: 'Your application is saved',
      body: 'Pick up where you left off. It takes about ten more minutes.',
      cta: 'Continue application',
      link: 'apply/',
    },
    ratecut: {
      id: 'demo-ratecut',
      campaign: 'Rate cut announcement',
      trigger: 'manual (demo control)',
      title: 'Variable rates are down 0.25%',
      body: 'The Variable Home Loan is now 5.84% p.a. (5.87% p.a. comparison rate*).',
      cta: 'See the new rates',
      link: 'home-loans/',
    },
    refinance: {
      id: 'demo-refinance',
      campaign: 'Refinance: existing customers without a home loan',
      trigger: 'manual (demo control)',
      title: 'Paying too much on your home loan?',
      body: 'Switch to Laneway Bank in about 20 minutes. We handle the paperwork with your old bank.',
      cta: 'Compare home loans',
      link: 'home-loans/',
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
      track.wipeIdentity();
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

    $('[data-dev-seed-application]', drawer).addEventListener('click', function () {
      becomeDarren();
      renderState();
      if (window.LanewayApp) window.LanewayApp.toast('Now applying as Darren. Three steps to go.');
      if (document.body.dataset.page === 'apply' || document.body.dataset.page === 'account') location.reload();
    });

    $('[data-dev-clear-application]', drawer).addEventListener('click', function () {
      store.clearDraft();
      track.setUserProperties({ application_status: 'none', application_step: 'none' });
      renderState();
      if (window.LanewayApp) window.LanewayApp.reboot();
      if (document.body.dataset.page === 'apply') location.reload();
    });

    $('[data-dev-reset]', drawer).addEventListener('click', function () {
      startFresh();
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

    store.on('application:changed', function () {
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

  window.LanewayDevtools = { mount, open, close, toggle, PERSONAS, becomeDarren, startFresh };
})();
