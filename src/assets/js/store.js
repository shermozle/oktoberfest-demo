/* ==========================================================================
   Laneway demo — client-side state
   Everything a real Shopify backend would own lives here instead: cart,
   customer, orders, browsing history. localStorage for data, cookies for the
   two things a server would normally set (storefront gate, session id).
   ========================================================================== */

(function () {
  'use strict';

  const NS = 'laneway';
  const KEY = {
    cart: NS + '.cart',
    customer: NS + '.customer',
    orders: NS + '.orders',
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

  /* --- cart -------------------------------------------------------------- */

  const emptyCart = { lines: [], updatedAt: null, createdAt: null };

  function getCart() {
    const cart = read(KEY.cart, emptyCart);
    cart.lines = Array.isArray(cart.lines) ? cart.lines : [];
    return cart;
  }

  function saveCart(cart) {
    cart.updatedAt = new Date().toISOString();
    if (!cart.createdAt) cart.createdAt = cart.updatedAt;
    write(KEY.cart, cart);
    emit('cart:changed', cart);
    return cart;
  }

  const lineKey = (l) => l.handle + '::' + l.variantId;

  function cartCount(cart) {
    return (cart || getCart()).lines.reduce((n, l) => n + l.quantity, 0);
  }

  function cartSubtotal(cart) {
    return (cart || getCart()).lines.reduce(
      (sum, l) => sum + l.price * l.quantity,
      0
    );
  }

  function cartTotals(cart) {
    const c = cart || getCart();
    const cfg = window.LANEWAY_CONFIG || {};
    const subtotal = cartSubtotal(c);
    const empty = c.lines.length === 0;
    const freeOver = cfg.SHIPPING_FREE_OVER ?? 100;
    const shipping =
      empty || subtotal >= freeOver ? 0 : cfg.SHIPPING_FLAT ?? 9.95;
    const rate = cfg.TAX_RATE ?? 0.1;
    // Displayed prices include GST, so tax is shown as the included portion.
    const taxIncluded = (subtotal + shipping) - (subtotal + shipping) / (1 + rate);
    return {
      subtotal,
      shipping,
      taxIncluded,
      total: subtotal + shipping,
      count: cartCount(c),
      freeShippingGap: Math.max(0, freeOver - subtotal),
    };
  }

  function addToCart(line) {
    const cart = getCart();
    const existing = cart.lines.find((l) => lineKey(l) === lineKey(line));
    if (existing) existing.quantity += line.quantity;
    else cart.lines.push(Object.assign({ addedAt: new Date().toISOString() }, line));
    saveCart(cart);
    emit('cart:added', { line, cart });
    return cart;
  }

  function setLineQuantity(handle, variantId, quantity) {
    const cart = getCart();
    const idx = cart.lines.findIndex(
      (l) => l.handle === handle && l.variantId === variantId
    );
    if (idx === -1) return cart;
    const line = cart.lines[idx];
    const previous = line.quantity;
    if (quantity <= 0) {
      cart.lines.splice(idx, 1);
      saveCart(cart);
      emit('cart:removed', { line, cart });
    } else {
      line.quantity = quantity;
      saveCart(cart);
      emit('cart:quantity', { line, previous, cart });
    }
    return cart;
  }

  function clearCart() {
    const cart = saveCart(structuredClone(emptyCart));
    emit('cart:cleared', cart);
    return cart;
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

  /* --- orders ------------------------------------------------------------ */

  function getOrders() {
    return read(KEY.orders, []);
  }

  function placeOrder(order) {
    const orders = getOrders();
    const record = Object.assign(
      {
        id: 'LW' + String(1000 + orders.length + 1),
        placedAt: new Date().toISOString(),
      },
      order
    );
    orders.unshift(record);
    write(KEY.orders, orders);

    // Roll the customer's lifetime stats forward so segmentation in Amplitude
    // and Braze has something to work with.
    const customer = getCustomer();
    if (customer) {
      customer.lifetimeOrders = (customer.lifetimeOrders || 0) + 1;
      customer.lifetimeValue =
        Math.round(((customer.lifetimeValue || 0) + record.total) * 100) / 100;
      customer.lastOrderAt = record.placedAt;
      saveCustomer(customer);
    }

    emit('order:placed', record);
    return record;
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

  function resetAll(options) {
    const opts = options || {};
    const keys = Object.values(KEY).filter(
      (k) => opts.keepGate !== true || k !== KEY.prefs
    );
    keys.forEach((k) => {
      try {
        if (canUseLocalStorage()) localStorage.removeItem(k);
      } catch (e) {
        /* ignore */
      }
      memory.delete(k);
    });
    deleteCookie(NS + '_session');
    if (!opts.keepGate) deleteCookie(NS + '_gate');
    emit('store:reset', null);
  }

  /* --- money ------------------------------------------------------------- */

  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    currencyDisplay: 'narrowSymbol',
  });

  const money = (n) => formatter.format(Number(n) || 0);

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
    getCart,
    addToCart,
    setLineQuantity,
    clearCart,
    cartCount,
    cartSubtotal,
    cartTotals,
    lineKey,
    getCustomer,
    saveCustomer,
    signIn,
    signOut,
    getOrders,
    placeOrder,
    recordView,
    recentlyViewed,
    getPrefs,
    setPref,
    logRead,
    logPush,
    logClear,
    resetAll,
    money,
    storageAvailable: canUseLocalStorage,
  };
})();
