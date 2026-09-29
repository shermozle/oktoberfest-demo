/* ==========================================================================
   Laneway Bank demo — client-side state
   Everything a real banking backend would own lives here instead: the
   application in progress, submitted applications, the customer and their
   browsing history. localStorage for data, and a cookie for the one thing a
   server would normally set (the session id).
   ========================================================================== */

(function () {
  'use strict';

  const NS = 'laneway';
  const KEY = {
    draft: NS + '.applicationDraft',
    applications: NS + '.applications',
    customer: NS + '.customer',
    viewed: NS + '.recentlyViewed',
    events: NS + '.eventLog',
    prefs: NS + '.prefs',
    anon: NS + '.anonId',
  };

  /* --- storage primitives ------------------------------------------------ */

  // Private windows and blocked site data both throw here, so every read and
  // write is guarded and the site falls back to in-memory state.
  const memory = new Map();
  let usable = null;

  function canUseLocalStorage() {
    if (usable !== null) return usable;
    try {
      const probe = NS + '.probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      usable = true;
    } catch (e) {
      usable = false;
    }
    return usable;
  }

  function read(key, fallback) {
    try {
      const raw = canUseLocalStorage()
        ? localStorage.getItem(key)
        : memory.get(key);
      if (raw == null) return structuredClone(fallback);
      return JSON.parse(raw);
    } catch (e) {
      return structuredClone(fallback);
    }
  }

  function write(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (canUseLocalStorage()) localStorage.setItem(key, raw);
      else memory.set(key, raw);
    } catch (e) {
      memory.set(key, raw);
    }
    return value;
  }

  /* --- cookies ----------------------------------------------------------- */

  function setCookie(name, value, days) {
    const parts = [
      name + '=' + encodeURIComponent(value),
      'path=/',
      'SameSite=Lax',
    ];
    if (days) {
      const d = new Date();
      d.setTime(d.getTime() + days * 864e5);
      parts.push('expires=' + d.toUTCString());
    }
    document.cookie = parts.join('; ');
  }

  function getCookie(name) {
    const hit = document.cookie
      .split('; ')
      .find((row) => row.startsWith(name + '='));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
  }

  function deleteCookie(name) {
    document.cookie = name + '=; path=/; max-age=0; SameSite=Lax';
  }

  /* --- ids --------------------------------------------------------------- */

  const uid = (prefix) =>
    prefix +
    '_' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);

  // Device id, persisted. Amplitude and Braze both get told about this so the
  // same anonymous visitor lines up across the two tools.
  function anonId() {
    let id = read(KEY.anon, null);
    if (!id) {
      id = uid('anon');
      write(KEY.anon, id);
    }
    return id;
  }

  // Session id in a session cookie, the way a server-side session would work.
  function sessionId() {
    let id = getCookie(NS + '_session');
    if (!id) {
      id = uid('sess');
      setCookie(NS + '_session', id); // no expiry: dies with the browser session
    }
    return id;
  }

  /* --- events (pub/sub) -------------------------------------------------- */

  const listeners = new Map();

  function on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn);
  }

  function emit(evt, detail) {
    (listeners.get(evt) || []).forEach((fn) => {
      try {
        fn(detail);
      } catch (e) {
        console.error('[laneway] listener failed for ' + evt, e);
      }
    });
  }

  /* --- application in progress ---------------------------------------- */

  // One draft at a time, saved after every step, so a visitor who leaves
  // halfway can pick up where they stopped. The draft is what an abandoned
  // application campaign keys off, the way a cart is on a shop.

  function getDraft() {
    return read(KEY.draft, null);
  }

  // `keepTime` leaves updatedAt alone, for the demo control that seeds an
  // application which already looks abandoned.
  function saveDraft(draft, keepTime) {
    if (!keepTime || !draft.updatedAt) draft.updatedAt = new Date().toISOString();
    write(KEY.draft, draft);
    emit('application:changed', draft);
    return draft;
  }

  function startDraft(seed) {
    const now = new Date().toISOString();
    return saveDraft(
      Object.assign(
        {
          id: 'LB' + String(Math.floor(100000 + Math.random() * 900000)),
          startedAt: now,
          step: 0,
          fields: {},
        },
        seed
      )
    );
  }

  function clearDraft() {
    write(KEY.draft, null);
    emit('application:changed', null);
  }

  /* --- customer ---------------------------------------------------------- */

  function getCustomer() {
    return read(KEY.customer, null);
  }

  function saveCustomer(customer) {
    write(KEY.customer, customer);
    emit('customer:changed', customer);
    return customer;
  }

  function signIn(details) {
    const existing = getCustomer();
    const customer = Object.assign(
      {
        id: uid('cust'),
        createdAt: new Date().toISOString(),
        marketingOptIn: false,
      },
      existing && existing.email === details.email ? existing : {},
      details,
      { lastSeenAt: new Date().toISOString() }
    );
    saveCustomer(customer);
    return customer;
  }

  function signOut() {
    write(KEY.customer, null);
    emit('customer:signedout', null);
  }

  /* --- submitted applications ------------------------------------------ */

  function getApplications() {
    return read(KEY.applications, []);
  }

  function submitApplication(application) {
    const list = getApplications();
    const record = Object.assign(
      { submittedAt: new Date().toISOString(), documents: [] },
      application
    );
    list.unshift(record);
    write(KEY.applications, list);
    clearDraft();
    emit('application:submitted', record);
    return record;
  }

  function updateApplication(id, patch) {
    const list = getApplications();
    const found = list.find((a) => a.id === id);
    if (!found) return null;
    Object.assign(found, patch);
    write(KEY.applications, list);
    return found;
  }

  /* --- browsing history -------------------------------------------------- */

  function recordView(handle) {
    const list = read(KEY.viewed, []).filter((h) => h !== handle);
    list.unshift(handle);
    return write(KEY.viewed, list.slice(0, 12));
  }

  const recentlyViewed = () => read(KEY.viewed, []);

  /* --- preferences ------------------------------------------------------- */

  const getPrefs = () => read(KEY.prefs, {});

  function setPref(key, value) {
    const prefs = getPrefs();
    prefs[key] = value;
    write(KEY.prefs, prefs);
    return prefs;
  }

  /* --- event log (mirrors the dev drawer across page loads) -------------- */

  const MAX_LOG = 120;

  function logRead() {
    return read(KEY.events, []);
  }

  function logPush(entry) {
    const log = logRead();
    log.push(entry);
    write(KEY.events, log.slice(-MAX_LOG));
    return entry;
  }

  const logClear = () => write(KEY.events, []);

  /* --- reset ------------------------------------------------------------- */

  function resetAll() {
    Object.values(KEY).forEach((k) => {
      try {
        if (canUseLocalStorage()) localStorage.removeItem(k);
      } catch (e) {
        /* ignore */
      }
      memory.delete(k);
    });
    deleteCookie(NS + '_session');
    emit('store:reset', null);
  }

  /* --- formatting ------------------------------------------------------- */

  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    currencyDisplay: 'narrowSymbol',
  });

  const wholeDollars = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  });

  const money = (n) => formatter.format(Number(n) || 0);
  const money0 = (n) => wholeDollars.format(Math.round(Number(n) || 0));
  const pct = (n) => Number(n).toFixed(2) + '% p.a.';

  window.LanewayStore = {
    KEY,
    NS,
    on,
    emit,
    uid,
    anonId,
    sessionId,
    setCookie,
    getCookie,
    deleteCookie,
    getDraft,
    saveDraft,
    startDraft,
    clearDraft,
    getCustomer,
    saveCustomer,
    signIn,
    signOut,
    getApplications,
    submitApplication,
    updateApplication,
    recordView,
    recentlyViewed,
    getPrefs,
    setPref,
    logRead,
    logPush,
    logClear,
    resetAll,
    money,
    money0,
    pct,
    storageAvailable: canUseLocalStorage,
  };
})();
