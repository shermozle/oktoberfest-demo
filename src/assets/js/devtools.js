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
        phone: '+61491570156',
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
      '<button class="dev-btn" data-dev-seed-application>high-value abandoner: Package, $840k, stopped at step 3</button>' +
      '<button class="dev-btn" data-dev-clear-application>discard the application in progress</button>' +
      '<p class="dev-note">Identifies the visitor (as Alex Nguyen if nobody is signed in) and saves an application that stopped at step 3, Your income, three minutes ago. Braze gets the same attributes a real abandoner would, including <code>application_info_needed</code>, so the reminder campaign can be shown on it straight away.</p>' +
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
      // The demo's high-value abandoner: a Package Home Loan application,
      // identified by email and mobile, that stopped at step 3 (income).
      let customer = store.getCustomer();
      if (!customer || !customer.email) {
        customer = store.signIn({
          email: 'alex.nguyen@example.com',
          phone: '+61491570159',
          firstName: 'Alex',
          lastName: 'Nguyen',
          persona: 'high_value_abandoner',
          marketingOptIn: true,
          source: 'demo_control',
        });
      } else if (!customer.phone) {
        customer = store.signIn(Object.assign({}, customer, { phone: '+61491570159' }));
      }
      track.identify(customer);

      const loanAmount = 840000;
      const draft = store.startDraft({
        source: 'landing_hero',
        campaign: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'package_offset' },
        step: 2,
        fields: {
          email: customer.email,
          phone: customer.phone,
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          applicants: '2',
          firstHomeBuyer: 'no',
          marketingOptIn: true,
          loanPurpose: 'buy_home',
          propertyStage: 'found',
          propertyValue: '1050000',
          deposit: '210000',
          state: 'VIC',
          postcode: '3068',
          product: 'package-home-loan',
        },
      });
      // Saved three minutes ago, so it already reads as abandoned.
      draft.updatedAt = new Date(Date.now() - 180000).toISOString();
      store.saveDraft(draft, true);

      track.track('Application Seeded', {
        source: 'demo_control',
        application_id: draft.id,
        step: 'income',
        loan_amount: loanAmount,
        product_id: 'package-home-loan',
      });
      const app = window.LanewayApp;
      track.setUserProperties(
        Object.assign(
          {
            application_status: 'started',
            application_id: draft.id,
            application_started_at: draft.startedAt,
            application_product: 'Package Home Loan',
            application_product_id: 'package-home-loan',
            application_resume_url: new URL((window.LANEWAY_BASE || '') + 'apply/', location.href).href,
            loan_purpose: 'buy_home',
            loan_amount: loanAmount,
            loan_amount_band: '$750k–$1m',
            lvr: 80,
          },
          app ? app.progressProps(2) : { application_step: 'income' }
        )
      );
      renderState();
      if (app) app.reboot();
      if (window.LanewayApp) window.LanewayApp.toast('Seeded: ' + (customer.firstName || customer.email) + ', stopped at step 3');
      if (document.body.dataset.page === 'apply') location.reload();
    });

    $('[data-dev-clear-application]', drawer).addEventListener('click', function () {
      store.clearDraft();
      track.setUserProperties({ application_status: 'none', application_step: 'none' });
      renderState();
      if (window.LanewayApp) window.LanewayApp.reboot();
      if (document.body.dataset.page === 'apply') location.reload();
    });

    $('[data-dev-reset]', drawer).addEventListener('click', function () {
      track.freshStart();
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

  window.LanewayDevtools = { mount, open, close, toggle, PERSONAS };
})();
