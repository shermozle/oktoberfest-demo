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

  const PLACEHOLDER = /^(YOUR_|TODO|REPLACE|<)/i;
  const isReal = (v) => typeof v === 'string' && v.length > 8 && !PLACEHOLDER.test(v);

  const state = {
    amplitude: { configured: isReal(cfg.AMPLITUDE_API_KEY), ready: false },
    braze: {
      configured: isReal(cfg.BRAZE_API_KEY) && isReal(cfg.BRAZE_SDK_ENDPOINT),
      ready: false,
    },
    queue: [],
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

  const notSent = (sink) =>
    sink === 'amplitude'
      ? 'NOT SENT — AMPLITUDE_API_KEY is still a placeholder'
      : 'NOT SENT — BRAZE_API_KEY / BRAZE_SDK_ENDPOINT are still placeholders';

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
    } catch (err) {
      record('amplitude', 'SDK failed to load', { error: String(err) }, String(err));
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
        Object.assign({ baseUrl: cfg.BRAZE_SDK_ENDPOINT }, cfg.BRAZE_OPTIONS)
      );

      // Braze → Amplitude. Campaign exposure becomes analytics events, which
      // is what makes lift measurable in Amplitude.
      braze.subscribeToInAppMessage(function (message) {
        const meta = {
          message_id: message.messageId || null,
          campaign: message.extras && message.extras.campaign,
          source: 'braze',
        };
        api.track('In-App Message Shown', meta);
        braze.showInAppMessage(message);
      });

      braze.subscribeToContentCardsUpdates(function (updates) {
        api.track('Content Cards Updated', {
          card_count: updates.cards.length,
          unviewed: updates.getUnviewedCardCount
            ? updates.getUnviewedCardCount()
            : null,
          source: 'braze',
        });
        document.dispatchEvent(
          new CustomEvent('laneway:contentcards', { detail: updates.cards })
        );
      });

      braze.openSession();
      braze.requestContentCardsRefresh();

      state.braze.ready = true;
      record('braze', 'SDK initialised', { baseUrl: cfg.BRAZE_SDK_ENDPOINT });
      applyIdentityToBraze();
    } catch (err) {
      record('braze', 'SDK failed to load', { error: String(err) }, String(err));
    }
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

    if (state.braze.ready) {
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
      user.setCustomUserAttribute('amplitude_user_id', customer.email);
      braze.requestImmediateDataFlush();
    }

    record(
      'braze',
      'changeUser + setCustomUserAttribute',
      Object.assign({ external_id: customer.id }, attrs, {
        amplitude_device_id: store.anonId(),
      }),
      state.braze.ready ? null : notSent('braze')
    );
  }

  function identify(customer) {
    const attrs = customerAttributes(customer);

    if (state.amplitude.ready) {
      const amp = window.amplitude;
      amp.setUserId(customer.email);
      const id = new amp.Identify();
      Object.entries(attrs).forEach(function (pair) {
        if (pair[1] !== null && pair[1] !== undefined) id.set(pair[0], pair[1]);
      });
      // Identity bridge in the other direction.
      id.set('braze_external_id', customer.id);
      amp.identify(id);
    }
    record(
      'amplitude',
      'setUserId + identify',
      Object.assign({ user_id: customer.email }, attrs, {
        braze_external_id: customer.id,
      }),
      state.amplitude.ready ? null : notSent('amplitude')
    );

    applyIdentityToBraze();
  }

  function resetIdentity() {
    if (state.amplitude.ready) {
      window.amplitude.reset();
      window.amplitude.setDeviceId(store.anonId());
    }
    record(
      'amplitude',
      'reset',
      { deviceId: store.anonId() },
      state.amplitude.ready ? null : notSent('amplitude')
    );

    if (state.braze.ready) window.braze.changeUser(store.anonId());
    record(
      'braze',
      'changeUser (anonymous)',
      { external_id: store.anonId() },
      state.braze.ready ? null : notSent('braze')
    );
  }

  /* ======================================================================
     User properties / Braze attributes
     ====================================================================== */

  function setUserProperties(props) {
    if (state.amplitude.ready) {
      const amp = window.amplitude;
      const id = new amp.Identify();
      Object.entries(props).forEach(function (pair) {
        if (pair[1] !== null && pair[1] !== undefined) id.set(pair[0], pair[1]);
      });
      amp.identify(id);
    }
    record(
      'amplitude',
      'identify',
      props,
      state.amplitude.ready ? null : notSent('amplitude')
    );

    if (state.braze.ready) {
      const user = window.braze.getUser();
      Object.entries(props).forEach(function (pair) {
        if (pair[1] !== null && pair[1] !== undefined)
          user.setCustomUserAttribute(pair[0], pair[1]);
      });
    }
    record(
      'braze',
      'setCustomUserAttribute',
      props,
      state.braze.ready ? null : notSent('braze')
    );
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

  function track(name, props) {
    const payload = Object.assign({}, context(), props || {});

    if (state.amplitude.ready) window.amplitude.track(name, payload);
    record(
      'amplitude',
      name,
      payload,
      state.amplitude.ready ? null : notSent('amplitude')
    );

    // Braze custom event names conventionally use snake_case.
    const brazeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (state.braze.ready) window.braze.logCustomEvent(brazeName, payload);
    record(
      'braze',
      'logCustomEvent(' + brazeName + ')',
      payload,
      state.braze.ready ? null : notSent('braze')
    );

    return payload;
  }

  // Amplitude-only. For events that would be noise in Braze — high-frequency
  // UI interactions that no campaign would ever trigger on.
  function trackAnalyticsOnly(name, props) {
    const payload = Object.assign({}, context(), props || {});
    if (state.amplitude.ready) window.amplitude.track(name, payload);
    record(
      'amplitude',
      name,
      payload,
      state.amplitude.ready ? null : notSent('amplitude')
    );
    return payload;
  }

  /* --- revenue ----------------------------------------------------------- */

  function trackPurchase(order) {
    // Amplitude: one Revenue object per line, so product-level revenue
    // reporting works, plus a single event for funnel analysis.
    order.lines.forEach(function (line) {
      if (state.amplitude.ready) {
        const rev = new window.amplitude.Revenue()
          .setProductId(line.handle)
          .setPrice(line.price)
          .setQuantity(line.quantity)
          .setRevenueType('purchase')
          .setEventProperties({
            order_id: order.id,
            variant: line.variantTitle || null,
            brand: line.brand,
            category: line.category,
          });
        window.amplitude.revenue(rev);
      }
      record(
        'amplitude',
        'revenue',
        {
          productId: line.handle,
          price: line.price,
          quantity: line.quantity,
          revenueType: 'purchase',
          order_id: order.id,
        },
        state.amplitude.ready ? null : notSent('amplitude')
      );
    });

    // Braze: logPurchase per line drives revenue-based segmentation and
    // triggers post-purchase campaigns.
    order.lines.forEach(function (line) {
      if (state.braze.ready) {
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
      }
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
        state.braze.ready ? null : notSent('braze')
      );
    });

    track('Order Completed', {
      order_id: order.id,
      revenue: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      tax_included: order.taxIncluded,
      item_count: order.lines.reduce((n, l) => n + l.quantity, 0),
      product_handles: order.lines.map((l) => l.handle),
      brands: [...new Set(order.lines.map((l) => l.brand))],
      shipping_method: order.shippingMethod || null,
      payment_method: order.paymentMethod || null,
    });

    if (state.braze.ready) window.braze.requestImmediateDataFlush();
  }

  /* --- Braze surface interactions ---------------------------------------- */

  function logInAppMessageInteraction(action, meta) {
    // Recorded in Amplitude so campaign exposure joins the funnel.
    trackAnalyticsOnly('In-App Message ' + action, Object.assign({ source: 'braze' }, meta));
  }

  function logContentCardClick(card) {
    if (state.braze.ready && card && card.brazeCard) {
      window.braze.logContentCardClick(card.brazeCard);
      record('braze', 'logContentCardClick', { id: card.id });
    } else {
      record(
        'braze',
        'logContentCardClick',
        { id: card && card.id },
        state.braze.ready ? null : notSent('braze')
      );
    }
    trackAnalyticsOnly('Content Card Clicked', {
      card_id: card && card.id,
      card_title: card && card.title,
      source: 'braze',
    });
  }

  function requestContentCards() {
    if (state.braze.ready) {
      window.braze.requestContentCardsRefresh();
      record('braze', 'requestContentCardsRefresh', null);
      return window.braze.getCachedContentCards().cards || [];
    }
    record('braze', 'requestContentCardsRefresh', null, notSent('braze'));
    return [];
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

    initAmplitude().then(function () {
      const customer = store.getCustomer();
      if (customer && state.amplitude.ready) identify(customer);
    });
    initBraze();
  }

  const api = {
    init,
    track,
    trackAnalyticsOnly,
    trackPurchase,
    identify,
    resetIdentity,
    setUserProperties,
    logInAppMessageInteraction,
    logContentCardClick,
    requestContentCards,
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
