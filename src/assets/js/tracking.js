/* ==========================================================================
   Laneway demo — Amplitude + Braze

   One call site, two destinations. Every storefront action goes through
   Laneway.track(), which fans out to Amplitude (analytics, session replay)
   and Braze (engagement), and records what it did in the event stream so the
   integration is visible while you demo it.

   The two directions worth pointing at during a demo:

     Amplitude → Braze   Behaviour observed on site becomes Braze custom
                         attributes and custom events, so Braze can segment
                         and message on it (last_brand_viewed, cart_value,
                         abandoned_cart, lifetime_value).

     Braze → Amplitude   Braze in-app messages and content cards emit
                         Amplitude events when they are shown, clicked and
                         dismissed, so campaign exposure sits in the same
                         funnels as everything else and you can measure lift.

   Identity is bridged both ways: Amplitude's device id is written to Braze as
   a custom attribute and Braze's external id is written to Amplitude as a
   user property, so the same person can be found in either tool.
   ========================================================================== */

(function () {
  'use strict';

  const store = window.LanewayStore;
  const cfg = window.LANEWAY_CONFIG || {};

  // Amplitude's unified script is served per-API-key, and the EU data centre
  // has its own CDN host.
  const AMPLITUDE_SCRIPT = (key, zone) =>
    'https://cdn' +
    (String(zone).toUpperCase() === 'EU' ? '.eu' : '') +
    '.amplitude.com/script/' +
    encodeURIComponent(key) +
    '.js';
  const BRAZE_SCRIPT = 'https://js.appboycdn.com/web-sdk/5.9/braze.min.js';

  // Amplitude rejects user ids shorter than 5 characters. The forms accept
  // anything, so a short or blank email leaves the visitor on their device id
  // instead of setting an id Amplitude would refuse.
  const AMPLITUDE_MIN_ID_LENGTH = 5;

  const userIdFor = (customer) =>
    customer && customer.email && customer.email.length >= AMPLITUDE_MIN_ID_LENGTH
      ? customer.email
      : null;

  const PLACEHOLDER = /^(YOUR_|TODO|REPLACE|<)/i;
  const isReal = (v) => typeof v === 'string' && v.length > 8 && !PLACEHOLDER.test(v);

  const state = {
    amplitude: {
      configured: isReal(cfg.AMPLITUDE_API_KEY),
      ready: false,
      failed: false,
      queue: [],
    },
    braze: {
      configured: isReal(cfg.BRAZE_API_KEY) && isReal(cfg.BRAZE_SDK_ENDPOINT),
      ready: false,
      failed: false,
      queue: [],
    },
  };

  /* ======================================================================
     Event stream
     ====================================================================== */

  const stream = [];
  const streamListeners = new Set();

  function record(sink, name, payload, note) {
    const entry = {
      id: store.uid('ev'),
      t: Date.now(),
      sink: sink,
      name: name,
      payload: payload === undefined ? null : payload,
      sent: note ? false : true,
      note: note || null,
    };
    stream.push(entry);
    if (stream.length > 200) stream.shift();
    store.logPush(entry);
    streamListeners.forEach((fn) => {
      try {
        fn(entry);
      } catch (e) {
        /* a broken listener must not break tracking */
      }
    });
    return entry;
  }

  function notSent(sink) {
    if (state[sink].failed)
      return 'NOT SENT: the ' + (sink === 'amplitude' ? 'Amplitude' : 'Braze') + ' SDK failed to load';
    return sink === 'amplitude'
      ? 'NOT SENT: AMPLITUDE_API_KEY is still a placeholder'
      : 'NOT SENT: BRAZE_API_KEY / BRAZE_SDK_ENDPOINT are still placeholders';
  }

  /* ======================================================================
     Delivery

     Both SDKs load asynchronously, and the page fires its view events
     (Product Viewed, Collection Viewed, Cart Viewed) the moment it boots,
     before either has arrived. Calls made in that window are queued and
     replayed in order once the SDK is ready. Before this queue existed they
     were silently dropped, so no page-load event ever reached either tool.
     ====================================================================== */

  // Runs fn against the SDK now, or queues it until the SDK finishes loading.
  // Returns false only when it will never run (placeholder key, failed load),
  // which is when the event stream should say NOT SENT.
  function send(sink, fn) {
    const s = state[sink];
    if (s.ready) {
      fn();
      return true;
    }
    if (s.configured && !s.failed) {
      s.queue.push(fn);
      return true;
    }
    return false;
  }

  const outcome = (sink, ok) => (ok ? null : notSent(sink));

  function flush(sink) {
    const queued = state[sink].queue.splice(0);
    queued.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        console.error('[laneway] queued ' + sink + ' call failed', e);
      }
    });
    if (queued.length)
      record(sink, 'Sent ' + queued.length + ' call(s) queued while the SDK loaded', null);
  }

  function fail(sink, err) {
    state[sink].failed = true;
    const dropped = state[sink].queue.splice(0).length;
    record(
      sink,
      'SDK failed to load',
      { error: String(err), dropped_calls: dropped },
      String(err)
    );
  }

  /* ======================================================================
     SDK loading
     ====================================================================== */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function initAmplitude() {
    if (!state.amplitude.configured) {
      record(
        'amplitude',
        'SDK not loaded',
        { reason: 'placeholder API key' },
        'Set AMPLITUDE_API_KEY in assets/js/config.js'
      );
      return;
    }
    try {
      const zone = cfg.AMPLITUDE_SERVER_ZONE || 'US';
      await loadScript(AMPLITUDE_SCRIPT(cfg.AMPLITUDE_API_KEY, zone));
      const amp = window.amplitude;
      if (!amp) throw new Error('window.amplitude missing after load');

      amp.init(cfg.AMPLITUDE_API_KEY, {
        serverZone: zone,
        autocapture: cfg.AMPLITUDE_AUTOCAPTURE,
        fetchRemoteConfig: true,
        // Share the mock's own device id so Amplitude, Braze and the event
        // stream all agree on who this anonymous visitor is.
        deviceId: store.anonId(),
      });

      // Session Replay ships inside the per-key script bundle.
      const rate = cfg.AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE;
      if (rate > 0 && window.sessionReplay && amp.add) {
        amp.add(window.sessionReplay.plugin({ sampleRate: rate }));
        record('amplitude', 'Session Replay enabled', { sampleRate: rate });
      }

      state.amplitude.ready = true;
      record('amplitude', 'SDK initialised', {
        serverZone: zone,
        deviceId: store.anonId(),
      });
      flush('amplitude');
    } catch (err) {
      fail('amplitude', err);
    }
  }

  async function initBraze() {
    if (!state.braze.configured) {
      record(
        'braze',
        'SDK not loaded',
        { reason: 'placeholder API key or endpoint' },
        'Set BRAZE_API_KEY and BRAZE_SDK_ENDPOINT in assets/js/config.js'
      );
      return;
    }
    try {
      await loadScript(BRAZE_SCRIPT);
      const braze = window.braze;
      if (!braze) throw new Error('window.braze missing after load');

      braze.initialize(
        cfg.BRAZE_API_KEY,
        Object.assign(
          {
            baseUrl: cfg.BRAZE_SDK_ENDPOINT,
            // Braze looks for /service-worker.js at the domain root by
            // default. On a GitHub Pages project site the root belongs to
            // the account, not this repo, so point it at the copy build.mjs
            // writes beside index.html. Its scope is that directory, which
            // is the whole site.
            serviceWorkerLocation: serviceWorkerPath(),
          },
          cfg.BRAZE_OPTIONS
        )
      );

      // Braze → Amplitude. Campaign exposure becomes analytics events, which
      // is what makes lift measurable in Amplitude.
      braze.subscribeToInAppMessage(function (message) {
        const meta = {
          message_id: message.messageId || null,
          campaign: message.extras && message.extras.campaign,
          source: 'braze',
        };
        // Amplitude only: Braze records its own impressions when it shows the
        // message, so echoing this back to Braze would count it twice.
        api.trackAnalyticsOnly('In-App Message Shown', meta);
        braze.showInAppMessage(message);
      });

      // A card sync is SDK housekeeping, not something the visitor did, so it
      // goes in the event stream only. Sending it as an event put several
      // per page load into Amplitude and cost Braze a data point each time.
      // What the visitor saw and clicked is logged by logContentCardImpressions
      // and logContentCardClick.
      braze.subscribeToContentCardsUpdates(function (updates) {
        record(
          'braze',
          'content cards synced',
          { card_count: updates.cards.length },
          'Stream only: SDK housekeeping, not sent as an event'
        );
        document.dispatchEvent(
          new CustomEvent('laneway:contentcards', { detail: updates.cards })
        );
      });

      braze.openSession();
      braze.requestContentCardsRefresh();

      state.braze.ready = true;
      record('braze', 'SDK initialised', { baseUrl: cfg.BRAZE_SDK_ENDPOINT });
      // Identify before replaying the queue, so queued events land on the
      // right Braze profile rather than an anonymous one.
      applyIdentityToBraze();
      flush('braze');
    } catch (err) {
      fail('braze', err);
    }
  }

  /* ======================================================================
     Web push
     ====================================================================== */

  // Absolute path of the service worker, e.g. /oktoberfest-demo/service-worker.js,
  // worked out from this page's relative path to the site root.
  const serviceWorkerPath = () =>
    new URL((window.LANEWAY_BASE || '') + 'service-worker.js', location.href).pathname;

  function onPushGranted(source) {
    trackAnalyticsOnly('Push Permission Granted', { source: source });
  }

  function onPushDenied(source, permission) {
    trackAnalyticsOnly('Push Permission Denied', {
      source: source,
      // 'denied' is a block; 'default' means the prompt was dismissed.
      permission: permission,
    });
  }

  // Only called once permission is already granted, so Braze subscribes
  // without prompting. The Granted event is logged by requestWebPush when the
  // visitor actually grants it, not here.
  function brazeSubscribe(source) {
    window.braze.requestPushPermission();
    record('braze', 'requestPushPermission (subscribe)', { source: source });
  }

  // MUST be called synchronously inside a click or submit handler. Safari and
  // Firefox only show the permission prompt from a user gesture, and a
  // prompt started after an await or a queued callback no longer counts.
  //
  // The browser's own prompt is used rather than Braze's: Braze won't prompt
  // until its server config (with the VAPID key) has loaded, which on a first
  // visit can land after the gesture has expired. Once permission is granted,
  // Braze subscribes on its own schedule, and that part needs no gesture.
  function requestWebPush(source) {
    const supported =
      'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    if (!supported || !state.braze.configured || state.braze.failed) return;

    const permission = Notification.permission;
    // Blocked: the browser won't prompt again, so there's nothing to ask.
    if (permission === 'denied') return;

    // Already allowed (e.g. a returning visitor): no prompt, just make sure
    // Braze holds a subscription.
    if (permission === 'granted') {
      send('braze', () => brazeSubscribe(source));
      return;
    }

    trackAnalyticsOnly('Push Permission Requested', { source: source });
    Notification.requestPermission().then(function (result) {
      if (result === 'granted') {
        onPushGranted(source);
        send('braze', () => brazeSubscribe(source));
      } else {
        onPushDenied(source, result);
      }
    });
  }

  /* ======================================================================
     Identity
     ====================================================================== */

  function customerAttributes(customer) {
    return {
      email: customer.email,
      first_name: customer.firstName || null,
      last_name: customer.lastName || null,
      marketing_opt_in: !!customer.marketingOptIn,
      lifetime_orders: customer.lifetimeOrders || 0,
      lifetime_value: customer.lifetimeValue || 0,
      favourite_brand: customer.favouriteBrand || null,
      persona: customer.persona || null,
    };
  }

  function applyIdentityToBraze() {
    const customer = store.getCustomer();
    if (!customer) return;
    const attrs = customerAttributes(customer);

    const ok = send('braze', function () {
      const braze = window.braze;
      braze.changeUser(customer.id);
      const user = braze.getUser();
      if (customer.email) user.setEmail(customer.email);
      if (customer.firstName) user.setFirstName(customer.firstName);
      if (customer.lastName) user.setLastName(customer.lastName);
      user.setEmailNotificationSubscriptionType(
        customer.marketingOptIn
          ? braze.User.NotificationSubscriptionTypes.OPTED_IN
          : braze.User.NotificationSubscriptionTypes.UNSUBSCRIBED
      );
      Object.entries(attrs).forEach(function (pair) {
        if (pair[1] !== null && pair[1] !== undefined)
          user.setCustomUserAttribute(pair[0], pair[1]);
      });
      // Identity bridge: find this Braze profile from Amplitude and back.
      user.setCustomUserAttribute('amplitude_device_id', store.anonId());
      user.setCustomUserAttribute('amplitude_user_id', userIdFor(customer));
      braze.requestImmediateDataFlush();
    });

    record(
      'braze',
      'changeUser + setCustomUserAttribute',
      Object.assign({ external_id: customer.id }, attrs, {
        amplitude_device_id: store.anonId(),
      }),
      outcome('braze', ok)
    );
  }

  function identify(customer) {
    const attrs = customerAttributes(customer);
    const userId = userIdFor(customer);

    const ok = send('amplitude', function () {
      const amp = window.amplitude;
      if (userId) amp.setUserId(userId);
      const id = new amp.Identify();
      Object.entries(attrs).forEach(function (pair) {
        if (pair[1] !== null && pair[1] !== undefined) id.set(pair[0], pair[1]);
      });
      // Identity bridge in the other direction.
      id.set('braze_external_id', customer.id);
      amp.identify(id);
    });
    record(
      'amplitude',
      userId ? 'setUserId + identify' : 'identify (no user id: email too short)',
      Object.assign({ user_id: userId }, attrs, {
        braze_external_id: customer.id,
      }),
      outcome('amplitude', ok)
    );

    applyIdentityToBraze();
  }

  function resetIdentity() {
    const ampOk = send('amplitude', function () {
      window.amplitude.reset();
      window.amplitude.setDeviceId(store.anonId());
    });
    record('amplitude', 'reset', { deviceId: store.anonId() }, outcome('amplitude', ampOk));

    const brazeOk = send('braze', () => window.braze.changeUser(store.anonId()));
    record(
      'braze',
      'changeUser (anonymous)',
      { external_id: store.anonId() },
      outcome('braze', brazeOk)
    );
  }

  /* ======================================================================
     User properties / Braze attributes
     ====================================================================== */

  function setUserProperties(props) {
    const ampOk = send('amplitude', function () {
      const amp = window.amplitude;
      const id = new amp.Identify();
      Object.entries(props).forEach(function (pair) {
        if (pair[1] !== null && pair[1] !== undefined) id.set(pair[0], pair[1]);
      });
      amp.identify(id);
    });
    record('amplitude', 'identify', props, outcome('amplitude', ampOk));

    const brazeOk = send('braze', function () {
      const user = window.braze.getUser();
      Object.entries(props).forEach(function (pair) {
        if (pair[1] !== null && pair[1] !== undefined)
          user.setCustomUserAttribute(pair[0], pair[1]);
      });
    });
    record('braze', 'setCustomUserAttribute', props, outcome('braze', brazeOk));
  }

  /* ======================================================================
     Events
     ====================================================================== */

  // Context every event carries, so anything can be broken down by it later.
  function context() {
    const cart = store.getCart();
    const customer = store.getCustomer();
    return {
      session_id: store.sessionId(),
      signed_in: !!customer,
      cart_size: store.cartCount(cart),
      cart_value: Math.round(store.cartSubtotal(cart) * 100) / 100,
      page_path: location.pathname,
      currency: cfg.CURRENCY || 'AUD',
    };
  }

  /* --- products array ---------------------------------------------------- */

  // Every event that carries product detail carries it here, as a `products`
  // object array in the shape Amplitude's Cart Analysis expects: one element
  // per product or line item, with `revenue` as the line total. Turn on
  // property splitting for `products` in Amplitude Data (Property Is Array)
  // to unlock Cart Analysis. Braze receives the same array as a nested event
  // property, which its Liquid templating can iterate over.

  const round2 = (n) => Math.round(Number(n) * 100) / 100;

  function pickOption(options, names) {
    if (!options) return null;
    for (const n of names) if (options[n]) return options[n];
    return null;
  }

  // Accepts a catalogue product, a slim index entry or a cart line; `extra`
  // overrides or adds fields (the selected variant, quantity, list position).
  function productItem(source, extra) {
    const s = Object.assign({}, source, extra);
    const price = round2(s.price != null ? s.price : s.priceMin);
    const item = {
      product_id: s.handle,
      product_name: s.title,
      brand: s.brand || null,
      category: s.category || null,
      price: price,
    };
    if (s.tier) item.tier = s.tier;
    if (s.variantId) item.variant_id = String(s.variantId);
    if (s.variantTitle) item.variant = s.variantTitle;
    const color = pickOption(s.selectedOptions, ['Color', 'Colour']);
    const size = pickOption(s.selectedOptions, ['Size']);
    if (color) item.color = color;
    if (size) item.size = size;
    if (s.quantity != null) {
      item.quantity = s.quantity;
      item.revenue = round2(price * s.quantity);
    }
    if (s.position != null) item.position = s.position;
    return item;
  }

  // A list the visitor was shown (collection grid, search results,
  // recommendations), with a 1-based position for merchandising analysis.
  const listProducts = (list) =>
    list.map((p, i) => productItem(p, { position: i + 1 }));

  // Cart or order line items. Defaults to the current cart.
  const cartProducts = (lines) =>
    (lines || store.getCart().lines).map((l) => productItem(l));

  // Amplitude call with the time it happened, so an event queued while the
  // SDK loads keeps its real timestamp rather than the moment it was replayed.
  // `fields` are Amplitude event-level fields such as revenue, sent beside
  // the event properties rather than inside them.
  function ampTrack(name, payload, fields) {
    const time = Date.now();
    return send('amplitude', () =>
      window.amplitude.track(name, payload, Object.assign({ time }, fields))
    );
  }

  function track(name, props, ampFields) {
    const payload = Object.assign({}, context(), props || {});

    // The stream shows event-level fields alongside the properties so the
    // revenue on Order Completed is visible; they aren't sent as properties.
    record(
      'amplitude',
      name,
      ampFields ? Object.assign({}, payload, { '(event fields)': ampFields }) : payload,
      outcome('amplitude', ampTrack(name, payload, ampFields))
    );

    // Braze custom event names conventionally use snake_case.
    const brazeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const brazeOk = send('braze', () => window.braze.logCustomEvent(brazeName, payload));
    record('braze', 'logCustomEvent(' + brazeName + ')', payload, outcome('braze', brazeOk));

    return payload;
  }

  // Amplitude-only. For events that would be noise in Braze: high-frequency
  // UI interactions that no campaign would ever trigger on.
  function trackAnalyticsOnly(name, props) {
    const payload = Object.assign({}, context(), props || {});
    record('amplitude', name, payload, outcome('amplitude', ampTrack(name, payload)));
    return payload;
  }

  /* --- revenue ----------------------------------------------------------- */

  function trackPurchase(order) {
    // Braze: logPurchase per line drives revenue-based segmentation and
    // triggers post-purchase campaigns.
    order.lines.forEach(function (line) {
      const ok = send('braze', function () {
        window.braze.logPurchase(
          line.handle,
          line.price,
          cfg.CURRENCY || 'AUD',
          line.quantity,
          {
            order_id: order.id,
            product_name: line.title,
            variant: line.variantTitle || null,
            brand: line.brand,
            category: line.category,
          }
        );
      });
      record(
        'braze',
        'logPurchase(' + line.handle + ')',
        {
          product_id: line.handle,
          price: line.price,
          currency: cfg.CURRENCY || 'AUD',
          quantity: line.quantity,
          order_id: order.id,
        },
        outcome('braze', ok)
      );
    });

    track('Order Completed', {
      order_id: order.id,
      revenue: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      tax_included: order.taxIncluded,
      item_count: order.lines.reduce((n, l) => n + l.quantity, 0),
      products: cartProducts(order.lines),
      shipping_method: order.shippingMethod || null,
      payment_method: order.paymentMethod || null,
    }, {
      // Revenue carried by Order Completed itself, so Amplitude's revenue
      // metrics and LTV count it without a separate revenue() call. That call
      // created a second event, shown as "Revenue (Unverified)", repeating the
      // same total. Product-level revenue is `products.revenue` in the array.
      revenue: order.total,
      revenueType: 'purchase',
    });

    send('braze', () => window.braze.requestImmediateDataFlush());
  }

  /* --- Braze surface interactions ---------------------------------------- */

  function logInAppMessageInteraction(action, meta) {
    // Recorded in Amplitude so campaign exposure joins the funnel.
    trackAnalyticsOnly('In-App Message ' + action, Object.assign({ source: 'braze' }, meta));
  }

  function logContentCardClick(card) {
    // Only real Braze cards can be reported back to Braze.
    if (card && card.brazeCard) {
      const ok = send('braze', () => window.braze.logContentCardClick(card.brazeCard));
      record('braze', 'logContentCardClick', { id: card.id }, outcome('braze', ok));
    }
    trackAnalyticsOnly('Content Card Clicked', {
      card_id: card && card.id,
      card_title: card && card.title,
      source: 'braze',
    });
  }

  // Impressions are what Braze's content card reporting counts, and the
  // Amplitude event puts card exposure in the same funnels as everything else.
  function logContentCardImpressions(cards) {
    const brazeCards = cards.map((c) => c.brazeCard).filter(Boolean);
    if (brazeCards.length) {
      const ok = send('braze', () => window.braze.logContentCardImpressions(brazeCards));
      record(
        'braze',
        'logContentCardImpressions',
        { card_ids: brazeCards.map((c) => c.id) },
        outcome('braze', ok)
      );
    }
    trackAnalyticsOnly('Content Cards Opened', {
      card_count: cards.length,
      card_ids: cards.map((c) => c.id),
      source: 'braze',
    });
  }

  // Whatever the SDK already holds. initBraze asks for a refresh once per
  // page; asking again here was the second of three syncs per page load.
  function cachedContentCards() {
    return state.braze.ready
      ? window.braze.getCachedContentCards().cards || []
      : [];
  }

  /* ======================================================================
     Init
     ====================================================================== */

  let initialised = false;

  function init() {
    if (initialised) return;
    initialised = true;

    record('store', 'Session start', {
      anon_id: store.anonId(),
      session_id: store.sessionId(),
      storage: store.storageAvailable() ? 'localStorage' : 'in-memory fallback',
    });

    // Queued ahead of anything the page fires, so page-load events replay
    // with the user id attached. No event is sent for this; the full
    // identify happens when someone signs in. Braze does the same inside
    // initBraze.
    const userId = userIdFor(store.getCustomer());
    if (userId) send('amplitude', () => window.amplitude.setUserId(userId));

    initAmplitude();
    initBraze();
  }

  const api = {
    init,
    track,
    trackAnalyticsOnly,
    trackPurchase,
    productItem,
    listProducts,
    cartProducts,
    identify,
    resetIdentity,
    setUserProperties,
    logInAppMessageInteraction,
    logContentCardClick,
    logContentCardImpressions,
    cachedContentCards,
    requestWebPush,
    state,
    stream,
    onRecord: function (fn) {
      streamListeners.add(fn);
      return () => streamListeners.delete(fn);
    },
    record,
  };

  window.LanewayTrack = api;
})();
