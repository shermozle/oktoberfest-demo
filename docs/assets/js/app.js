/* ==========================================================================
   Laneway demo — storefront behaviour
   Everything is client-side. Each generated page sets document.body.dataset
   .page and window.LANEWAY_PAGE, and this file wires up whatever that page
   needs.
   ========================================================================== */

(function () {
  'use strict';

  const store = window.LanewayStore;
  const track = window.LanewayTrack;
  const cfg = window.LANEWAY_CONFIG || {};
  const PAGE = window.LANEWAY_PAGE || {};
  const INDEX = window.LANEWAY_INDEX || { products: [], collections: [] };
  const BASE = window.LANEWAY_BASE || '';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) =>
    Array.from((root || document).querySelectorAll(sel));

  const url = (path) => BASE + path;
  const productUrl = (handle) => url('products/' + handle + '/');

  const productByHandle = (handle) =>
    INDEX.products.find((p) => p.handle === handle);

  const escapeHtml = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);

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
     Password gate — mirrors the Shopify storefront password on the original
     ====================================================================== */

  function initGate() {
    if (!cfg.REQUIRE_PASSWORD) return true;
    if (store.getCookie(store.NS + '_gate') === 'open') return true;

    const gate = $('#gate');
    if (!gate) return true;
    gate.hidden = false;
    document.documentElement.style.overflow = 'hidden';

    const form = $('form', gate);
    const input = $('input', gate);
    const error = $('.gate__error', gate);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const value = input.value.trim().toLowerCase();
      if (value === String(cfg.PASSWORD).toLowerCase()) {
        store.setCookie(store.NS + '_gate', 'open', 30);
        gate.hidden = true;
        document.documentElement.style.overflow = '';
        track.init();
        track.track('Storefront Unlocked', { method: 'password' });
        boot();
      } else {
        error.textContent = 'That password is incorrect.';
        input.value = '';
        input.focus();
      }
    });

    setTimeout(() => input.focus(), 50);
    return false;
  }

  /* ======================================================================
     Header
     ====================================================================== */

  function renderCartBadge() {
    const count = store.cartCount();
    $$('[data-cart-count]').forEach(function (el) {
      el.textContent = String(count);
      el.hidden = count === 0;
    });
  }

  function initHeader() {
    renderCartBadge();
    store.on('cart:changed', renderCartBadge);

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
          const haystack = [p.title, p.brand, p.category, p.typeTag]
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
          '<p class="muted" style="text-align:center">Search 30 products across Laneway, Southbank Coffee Co. and RMIT.</p>';
        return;
      }
      if (!hits.length) {
        results.innerHTML =
          '<p class="muted" style="text-align:center">No products match &ldquo;' +
          escapeHtml(q) +
          '&rdquo;.</p>';
        return;
      }
      results.innerHTML = hits
        .map(
          (p, i) =>
            '<a class="search-hit" href="' +
            productUrl(p.handle) +
            '" data-hit="' +
            escapeHtml(p.handle) +
            '" data-position="' +
            (i + 1) +
            '">' +
            '<img src="' +
            url(p.image) +
            '" alt="" loading="lazy">' +
            '<span><span style="display:block">' +
            escapeHtml(p.title) +
            '</span><span class="muted" style="font-size:12px">' +
            escapeHtml(p.brand) +
            ' · ' +
            escapeHtml(p.category) +
            '</span></span>' +
            '<span>' +
            store.money(p.priceMin) +
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
          top_result: hits[0] ? hits[0].title : null,
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
      if (hit) {
        track.trackAnalyticsOnly('Search Result Clicked', {
          query: input.value.trim(),
          product: hit.dataset.hit,
          position: Number(hit.dataset.position),
        });
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

    const selection = {};
    product.options.forEach(function (opt, i) {
      const firstAvailable = product.variants.find(
        (v) => v.available && v.options[i]
      );
      selection[opt.name] = firstAvailable
        ? firstAvailable.options[i]
        : opt.values[0];
    });

    function currentVariant() {
      if (!product.options.length) return product.variants[0];
      return (
        product.variants.find((v) =>
          product.options.every((opt, i) => v.options[i] === selection[opt.name])
        ) || null
      );
    }

    const priceEl = $('[data-product-price]');
    const addBtn = $('[data-add-to-cart]');
    const qtyInput = $('[data-qty-input]');
    const quickBar = $('.quick-bar');
    const quickBarText = $('[data-quickbar-variant]');

    function refresh() {
      const v = currentVariant();
      $$('[data-option-value]').forEach(function (btn) {
        const selected = selection[btn.dataset.optionName] === btn.dataset.optionValue;
        btn.setAttribute('aria-pressed', String(selected));
      });
      if (priceEl) priceEl.textContent = v ? store.money(v.price) : '—';
      if (addBtn) {
        addBtn.disabled = !v || !v.available;
        addBtn.querySelector('span').textContent =
          !v ? 'Unavailable' : v.available ? 'Add to cart' : 'Sold out';
      }
      if (quickBarText && v)
        quickBarText.textContent = v.title === 'Default Title' ? '' : v.title;
    }

    $$('[data-option-value]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const name = btn.dataset.optionName;
        const value = btn.dataset.optionValue;
        if (selection[name] === value) return;
        selection[name] = value;
        refresh();
        const v = currentVariant();
        track.trackAnalyticsOnly('Product Variant Selected', {
          product: product.title,
          product_handle: product.handle,
          option_name: name,
          option_value: value,
          variant: v ? v.title : null,
          available: v ? v.available : false,
        });
      });
    });

    // Quantity stepper
    $$('[data-qty-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const delta = Number(btn.dataset.qtyStep);
        const next = Math.max(1, Math.min(99, Number(qtyInput.value) + delta));
        qtyInput.value = String(next);
      });
    });

    function add(source) {
      const v = currentVariant();
      if (!v || !v.available) return;
      const quantity = Math.max(1, Number(qtyInput ? qtyInput.value : 1) || 1);
      const line = {
        handle: product.handle,
        variantId: v.id,
        variantTitle: v.title === 'Default Title' ? null : v.title,
        title: product.title,
        price: v.price,
        quantity: quantity,
        image: product.images[0] ? product.images[0].src : null,
        brand: product.brand,
        category: product.category,
        tier: product.tier,
      };
      store.addToCart(line);

      track.track('Product Added to Cart', {
        product: product.title,
        product_handle: product.handle,
        variant: line.variantTitle,
        brand: product.brand,
        category: product.category,
        tier: product.tier,
        price: v.price,
        quantity: quantity,
        line_value: Math.round(v.price * quantity * 100) / 100,
        add_source: source,
      });

      // Behaviour observed here becomes Braze segmentation fuel.
      track.setUserProperties({
        last_brand_viewed: product.brand,
        last_product_added: product.title,
        cart_value: Math.round(store.cartSubtotal() * 100) / 100,
        cart_size: store.cartCount(),
      });

      toast(product.title + ' added to your cart');
      maybeShowFreeShippingNudge();
    }

    if (addBtn) addBtn.addEventListener('click', () => add('product_page'));
    const quickAdd = $('[data-quickbar-add]');
    if (quickAdd) quickAdd.addEventListener('click', () => add('sticky_bar'));

    // Sticky quick-add bar once the main buy button scrolls away.
    if (quickBar && addBtn) {
      const io = new IntersectionObserver(
        function (entries) {
          const gone = !entries[0].isIntersecting;
          quickBar.classList.toggle('quick-bar--visible', gone);
        },
        { rootMargin: '-80px 0px 0px 0px' }
      );
      io.observe(addBtn);
    }

    refresh();

    track.track('Product Viewed', {
      product: product.title,
      product_handle: product.handle,
      brand: product.brand,
      category: product.category,
      tier: product.tier,
      price: product.priceMin,
      variant_count: product.variants.length,
      image_count: product.images.length,
    });

    track.setUserProperties({
      last_brand_viewed: product.brand,
      last_category_viewed: product.category,
      last_product_viewed: product.title,
    });

    // Depth of engagement on the page — the kind of signal a Braze "browse
    // abandonment" campaign triggers on.
    let deepSeen = false;
    window.addEventListener(
      'scroll',
      function () {
        if (deepSeen) return;
        const seen =
          (window.scrollY + window.innerHeight) / document.body.scrollHeight;
        if (seen > 0.7) {
          deepSeen = true;
          track.track('Product Detail Read', {
            product: product.title,
            product_handle: product.handle,
            brand: product.brand,
          });
        }
      },
      { passive: true }
    );
  }

  /* ======================================================================
     Collection page — sort and filter, client-side
     ====================================================================== */

  function initCollection() {
    const collection = PAGE.collection;
    if (!collection) return;

    const gridEl = $('[data-collection-grid]');
    const countEl = $('[data-collection-count]');
    const sortEl = $('[data-sort]');
    const availEl = $$('[data-filter-availability]');
    const priceMinEl = $('[data-price-min]');
    const priceMaxEl = $('[data-price-max]');
    const clearEl = $('[data-filter-clear]');

    const items = collection.products
      .map(productByHandle)
      .filter(Boolean);

    function apply() {
      const inStockOnly = availEl.some(
        (c) => c.checked && c.value === 'in-stock'
      );
      const outOnly = availEl.some(
        (c) => c.checked && c.value === 'out-of-stock'
      );
      const min = Number(priceMinEl && priceMinEl.value) || 0;
      const max = Number(priceMaxEl && priceMaxEl.value) || Infinity;

      let list = items.filter(function (p) {
        if (inStockOnly && !p.available) return false;
        if (outOnly && p.available) return false;
        return p.priceMin >= min && p.priceMin <= max;
      });

      const sort = sortEl ? sortEl.value : 'featured';
      const sorters = {
        featured: null,
        'title-asc': (a, b) => a.title.localeCompare(b.title),
        'title-desc': (a, b) => b.title.localeCompare(a.title),
        'price-asc': (a, b) => a.priceMin - b.priceMin,
        'price-desc': (a, b) => b.priceMin - a.priceMin,
        'date-desc': (a, b) => b.publishedAt.localeCompare(a.publishedAt),
        'date-asc': (a, b) => a.publishedAt.localeCompare(b.publishedAt),
      };
      if (sorters[sort]) list = list.slice().sort(sorters[sort]);

      if (countEl)
        countEl.textContent = list.length + (list.length === 1 ? ' item' : ' items');
      gridEl.innerHTML = list.length
        ? list.map(cardHtml).join('')
        : '<p class="empty-state" style="grid-column:1/-1">No products match these filters.</p>';
      return list;
    }

    if (sortEl)
      sortEl.addEventListener('change', function () {
        const list = apply();
        track.trackAnalyticsOnly('Collection Sorted', {
          collection: collection.title,
          sort_by: sortEl.value,
          results_count: list.length,
        });
      });

    availEl.concat([priceMinEl, priceMaxEl].filter(Boolean)).forEach(function (el) {
      el.addEventListener('change', function () {
        const list = apply();
        track.trackAnalyticsOnly('Collection Filtered', {
          collection: collection.title,
          availability: availEl.filter((c) => c.checked).map((c) => c.value),
          price_min: Number(priceMinEl && priceMinEl.value) || null,
          price_max: Number(priceMaxEl && priceMaxEl.value) || null,
          results_count: list.length,
        });
      });
    });

    if (clearEl)
      clearEl.addEventListener('click', function () {
        availEl.forEach((c) => (c.checked = false));
        if (priceMinEl) priceMinEl.value = '';
        if (priceMaxEl) priceMaxEl.value = '';
        apply();
      });

    // Filter popovers
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

    apply();

    track.track('Collection Viewed', {
      collection: collection.title,
      collection_handle: collection.handle,
      collection_type: collection.isBrand ? 'brand' : 'category',
      product_count: items.length,
      brands: [...new Set(items.map((p) => p.brand))],
    });
  }

  /* ======================================================================
     Product cards + recommendations
     ====================================================================== */

  function cardHtml(p) {
    const second = p.image2
      ? '<img src="' + url(p.image2) + '" alt="" loading="lazy">'
      : '';
    return (
      '<article class="card" data-product-card="' +
      escapeHtml(p.handle) +
      '">' +
      '<a class="card__media" href="' +
      productUrl(p.handle) +
      '">' +
      '<img src="' +
      url(p.image) +
      '" alt="' +
      escapeHtml(p.title) +
      '" loading="lazy">' +
      second +
      '</a>' +
      '<div class="card__body">' +
      '<span class="card__brand">' +
      escapeHtml(p.brand) +
      '</span>' +
      '<a class="card__title" href="' +
      productUrl(p.handle) +
      '">' +
      escapeHtml(p.title) +
      '</a>' +
      '<div class="card__price">' +
      (p.priceMin === p.priceMax
        ? store.money(p.priceMin)
        : 'From ' + store.money(p.priceMin)) +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  /**
   * Stand-in for a recommendation service. Ranks the catalogue against the
   * current product or the visitor's browsing history: same brand and same
   * category score highest, then price proximity.
   */
  function recommend(seedHandle, limit) {
    const viewed = store.recentlyViewed();
    const seed = seedHandle ? productByHandle(seedHandle) : productByHandle(viewed[0]);
    const pool = INDEX.products.filter(
      (p) => p.handle !== (seed && seed.handle)
    );
    if (!seed) return pool.slice(0, limit || 4);

    return pool
      .map(function (p) {
        let score = 0;
        if (p.brand === seed.brand) score += 4;
        if (p.category === seed.category) score += 3;
        if (p.tier === seed.tier) score += 1;
        if (p.typeTag === seed.typeTag) score += 2;
        score -= Math.min(3, Math.abs(p.priceMin - seed.priceMin) / 40);
        if (viewed.includes(p.handle)) score -= 2; // already seen it
        return { p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 4)
      .map((r) => r.p);
  }

  function initRecommendations() {
    $$('[data-recommend]').forEach(function (holder) {
      const seed = holder.dataset.recommend || null;
      const limit = Number(holder.dataset.recommendLimit) || 4;
      const items = recommend(seed, limit);
      holder.innerHTML = items.map(cardHtml).join('');
      track.trackAnalyticsOnly('Recommendations Shown', {
        seed_product: seed,
        products: items.map((p) => p.handle),
        placement: holder.dataset.placement || 'you-may-also-like',
      });
    });

    const recent = $('[data-recently-viewed]');
    if (recent) {
      const handles = store
        .recentlyViewed()
        .filter((h) => h !== (PAGE.product && PAGE.product.handle))
        .slice(0, 4);
      const items = handles.map(productByHandle).filter(Boolean);
      if (items.length) {
        recent.closest('section').hidden = false;
        recent.innerHTML = items.map(cardHtml).join('');
      }
    }

    document.addEventListener('click', function (e) {
      const card = e.target.closest('[data-product-card]');
      if (!card) return;
      const p = productByHandle(card.dataset.productCard);
      if (!p) return;
      track.trackAnalyticsOnly('Product Card Clicked', {
        product: p.title,
        product_handle: p.handle,
        brand: p.brand,
        price: p.priceMin,
        placement: card.closest('[data-placement]')
          ? card.closest('[data-placement]').dataset.placement
          : 'grid',
      });
    });
  }

  /* ======================================================================
     Cart page
     ====================================================================== */

  function lineHtml(line) {
    return (
      '<div class="line" data-line="' +
      escapeHtml(line.handle) +
      '" data-variant="' +
      escapeHtml(line.variantId) +
      '">' +
      '<a class="line__media" href="' +
      productUrl(line.handle) +
      '">' +
      (line.image
        ? '<img src="' + url(line.image) + '" alt="" loading="lazy">'
        : '') +
      '</a>' +
      '<div>' +
      '<a class="line__title" href="' +
      productUrl(line.handle) +
      '">' +
      escapeHtml(line.title) +
      '</a>' +
      (line.variantTitle
        ? '<div class="line__variant">' + escapeHtml(line.variantTitle) + '</div>'
        : '') +
      '<div class="line__variant">' +
      store.money(line.price) +
      '</div>' +
      '<div class="line__controls">' +
      '<div class="qty qty--sm">' +
      '<button type="button" data-line-step="-1" aria-label="Decrease quantity">&minus;</button>' +
      '<input type="number" min="0" value="' +
      line.quantity +
      '" data-line-qty aria-label="Quantity">' +
      '<button type="button" data-line-step="1" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<button type="button" class="line__remove" data-line-remove aria-label="Remove ' +
      escapeHtml(line.title) +
      '">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>' +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
      store.money(line.price * line.quantity) +
      '</div>' +
      '</div>'
    );
  }

  function renderSummary(root, totals, options) {
    const opts = options || {};
    const rows = [
      ['Subtotal', store.money(totals.subtotal)],
      [
        'Shipping',
        totals.count === 0
          ? '—'
          : totals.shipping === 0
          ? 'Free'
          : store.money(totals.shipping),
      ],
    ];
    if (opts.showTax)
      rows.push(['GST included', store.money(totals.taxIncluded)]);

    root.innerHTML =
      rows
        .map(
          (r) =>
            '<div class="summary__row"><span>' +
            r[0] +
            '</span><span>' +
            r[1] +
            '</span></div>'
        )
        .join('') +
      '<div class="summary__row summary__row--total"><span>' +
      (opts.totalLabel || 'Estimated total') +
      '</span><span>' +
      store.money(totals.total) +
      ' ' +
      (cfg.CURRENCY || 'AUD') +
      '</span></div>';
  }

  function initCart() {
    const linesEl = $('[data-cart-lines]');
    if (!linesEl) return;
    const summaryEl = $('[data-cart-summary]');
    const countEl = $('[data-cart-title-count]');
    const emptyEl = $('[data-cart-empty]');
    const bodyEl = $('[data-cart-body]');
    const progressEl = $('[data-shipping-progress]');

    function render() {
      const cart = store.getCart();
      const totals = store.cartTotals(cart);

      if (emptyEl && bodyEl) {
        emptyEl.hidden = cart.lines.length > 0;
        bodyEl.hidden = cart.lines.length === 0;
      }
      if (countEl) countEl.textContent = String(totals.count);
      linesEl.innerHTML = cart.lines.map(lineHtml).join('');
      if (summaryEl) renderSummary(summaryEl, totals, { showTax: true });

      if (progressEl) {
        if (totals.count === 0) {
          progressEl.textContent = '';
        } else if (totals.freeShippingGap > 0) {
          progressEl.textContent =
            'Spend ' +
            store.money(totals.freeShippingGap) +
            ' more for free shipping.';
        } else {
          progressEl.textContent = 'Free shipping unlocked.';
        }
      }
    }

    linesEl.addEventListener('click', function (e) {
      const row = e.target.closest('[data-line]');
      if (!row) return;
      const handle = row.dataset.line;
      const variantId = row.dataset.variant;
      const cart = store.getCart();
      const line = cart.lines.find(
        (l) => l.handle === handle && l.variantId === variantId
      );
      if (!line) return;

      if (e.target.closest('[data-line-remove]')) {
        store.setLineQuantity(handle, variantId, 0);
        track.track('Product Removed from Cart', {
          product: line.title,
          product_handle: handle,
          variant: line.variantTitle,
          brand: line.brand,
          quantity: line.quantity,
          line_value: Math.round(line.price * line.quantity * 100) / 100,
        });
        render();
        syncCartProperties();
        return;
      }

      const step = e.target.closest('[data-line-step]');
      if (step) {
        const next = line.quantity + Number(step.dataset.lineStep);
        store.setLineQuantity(handle, variantId, next);
        track.track(
          next <= 0 ? 'Product Removed from Cart' : 'Cart Quantity Changed',
          {
            product: line.title,
            product_handle: handle,
            variant: line.variantTitle,
            brand: line.brand,
            from_quantity: line.quantity,
            to_quantity: Math.max(0, next),
          }
        );
        render();
        syncCartProperties();
      }
    });

    linesEl.addEventListener('change', function (e) {
      const input = e.target.closest('[data-line-qty]');
      if (!input) return;
      const row = input.closest('[data-line]');
      const next = Math.max(0, Number(input.value) || 0);
      store.setLineQuantity(row.dataset.line, row.dataset.variant, next);
      render();
      syncCartProperties();
    });

    render();

    const totals = store.cartTotals();
    track.track('Cart Viewed', {
      cart_value: totals.subtotal,
      cart_size: totals.count,
      product_handles: store.getCart().lines.map((l) => l.handle),
      free_shipping_gap: totals.freeShippingGap,
    });

    const checkoutBtn = $('[data-checkout]');
    if (checkoutBtn)
      checkoutBtn.addEventListener('click', function () {
        const t = store.cartTotals();
        if (t.count === 0) return;
        track.track('Checkout Started', {
          cart_value: t.subtotal,
          cart_size: t.count,
          product_handles: store.getCart().lines.map((l) => l.handle),
          brands: [...new Set(store.getCart().lines.map((l) => l.brand))],
        });
        location.href = url('checkout/');
      });
  }

  function syncCartProperties() {
    const totals = store.cartTotals();
    track.setUserProperties({
      cart_value: totals.subtotal,
      cart_size: totals.count,
    });
  }

  /* ======================================================================
     Checkout
     ====================================================================== */

  function initCheckout() {
    const formEl = $('[data-checkout-form]');
    if (!formEl) return;

    const steps = $$('[data-step]');
    const stepNav = $$('[data-step-nav]');
    const summaryEl = $('[data-checkout-summary]');
    const linesEl = $('[data-checkout-lines]');
    const cart = store.getCart();

    if (cart.lines.length === 0) {
      $('[data-checkout-wrap]').hidden = true;
      $('[data-checkout-empty]').hidden = false;
      return;
    }

    // Prefill from the signed-in customer if there is one.
    const customer = store.getCustomer();
    if (customer) {
      const set = (name, value) => {
        const el = formEl.elements[name];
        if (el && value) el.value = value;
      };
      set('email', customer.email);
      set('firstName', customer.firstName);
      set('lastName', customer.lastName);
      set('address', customer.address);
      set('city', customer.city);
      set('postcode', customer.postcode);
    }

    let current = 0;

    function totals() {
      const t = store.cartTotals();
      const method = formEl.elements.shippingMethod;
      const express = method && method.value === 'express';
      const shipping = express ? 19.95 : t.shipping;
      const rate = cfg.TAX_RATE ?? 0.1;
      const total = t.subtotal + shipping;
      return {
        subtotal: t.subtotal,
        shipping: shipping,
        taxIncluded: total - total / (1 + rate),
        total: total,
        count: t.count,
        freeShippingGap: t.freeShippingGap,
      };
    }

    function renderSide() {
      linesEl.innerHTML = cart.lines
        .map(
          (l) =>
            '<div class="line" style="grid-template-columns:56px 1fr auto">' +
            '<span class="line__media" style="width:56px">' +
            (l.image ? '<img src="' + url(l.image) + '" alt="">' : '') +
            '</span>' +
            '<span><span class="line__title">' +
            escapeHtml(l.title) +
            '</span>' +
            (l.variantTitle
              ? '<span class="line__variant" style="display:block">' +
                escapeHtml(l.variantTitle) +
                '</span>'
              : '') +
            '<span class="line__variant" style="display:block">Qty ' +
            l.quantity +
            '</span></span>' +
            '<span>' +
            store.money(l.price * l.quantity) +
            '</span>' +
            '</div>'
        )
        .join('');
      renderSummary(summaryEl, totals(), {
        showTax: true,
        totalLabel: 'Total',
      });
    }

    function showStep(index) {
      current = index;
      steps.forEach((s, i) => (s.hidden = i !== index));
      stepNav.forEach((s, i) =>
        i === index
          ? s.setAttribute('aria-current', 'step')
          : s.removeAttribute('aria-current')
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function validate(index) {
      const step = steps[index];
      let ok = true;
      $$('[required]', step).forEach(function (input) {
        const wrap = input.closest('.field');
        const value = input.value.trim();
        let message = '';
        if (!value) message = 'Required';
        else if (input.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
          message = 'Enter a valid email address';
        if (message) ok = false;
        if (wrap) {
          wrap.classList.toggle('field--error', !!message);
          const err = $('.field__error', wrap);
          if (err) err.textContent = message;
        }
      });
      return ok;
    }

    const stepNames = ['Contact', 'Shipping', 'Payment', 'Review'];

    $$('[data-step-next]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!validate(current)) {
          track.trackAnalyticsOnly('Checkout Step Failed Validation', {
            step: current + 1,
            step_name: stepNames[current],
          });
          return;
        }
        const t = totals();
        track.track('Checkout Step Completed', {
          step: current + 1,
          step_name: stepNames[current],
          cart_value: t.subtotal,
          cart_size: t.count,
        });
        // Capturing the email mid-checkout is what makes an abandoned-cart
        // campaign possible, so hand it to both tools as soon as it exists.
        if (current === 0) {
          const email = formEl.elements.email.value.trim();
          const optIn = formEl.elements.marketingOptIn
            ? formEl.elements.marketingOptIn.checked
            : false;
          const person = store.signIn({
            email: email,
            firstName: formEl.elements.firstName
              ? formEl.elements.firstName.value.trim()
              : '',
            marketingOptIn: optIn,
            source: 'checkout',
          });
          track.identify(person);
        }
        renderSide();
        showStep(Math.min(current + 1, steps.length - 1));
      });
    });

    $$('[data-step-back]').forEach(function (btn) {
      btn.addEventListener('click', () => showStep(Math.max(0, current - 1)));
    });

    $$('[name="shippingMethod"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        renderSide();
        track.trackAnalyticsOnly('Shipping Method Selected', {
          method: radio.value,
        });
      });
    });

    $$('[name="paymentMethod"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        track.trackAnalyticsOnly('Payment Method Selected', {
          method: radio.value,
        });
      });
    });

    const placeBtn = $('[data-place-order]');
    if (placeBtn)
      placeBtn.addEventListener('click', function () {
        if (!validate(current)) return;
        const t = totals();
        const data = new FormData(formEl);
        const order = {
          lines: store.getCart().lines.slice(),
          subtotal: Math.round(t.subtotal * 100) / 100,
          shipping: Math.round(t.shipping * 100) / 100,
          taxIncluded: Math.round(t.taxIncluded * 100) / 100,
          total: Math.round(t.total * 100) / 100,
          currency: cfg.CURRENCY || 'AUD',
          email: data.get('email'),
          name: [data.get('firstName'), data.get('lastName')]
            .filter(Boolean)
            .join(' '),
          address: [
            data.get('address'),
            data.get('city'),
            data.get('postcode'),
            data.get('country'),
          ]
            .filter(Boolean)
            .join(', '),
          shippingMethod: data.get('shippingMethod'),
          paymentMethod: data.get('paymentMethod'),
        };

        const record = store.placeOrder(order);
        track.trackPurchase(record);

        const person = store.getCustomer();
        if (person) {
          track.setUserProperties({
            lifetime_orders: person.lifetimeOrders || 1,
            lifetime_value: person.lifetimeValue || record.total,
            last_order_id: record.id,
            last_order_at: record.placedAt,
            favourite_brand: mostCommonBrand(record.lines),
            cart_value: 0,
            cart_size: 0,
          });
        }

        store.clearCart();
        store.setPref('lastOrderId', record.id);
        location.href = url('order/');
      });

    renderSide();
    showStep(0);

    const t = totals();
    track.trackAnalyticsOnly('Checkout Viewed', {
      cart_value: t.subtotal,
      cart_size: t.count,
    });
  }

  function mostCommonBrand(lines) {
    const tally = {};
    lines.forEach((l) => (tally[l.brand] = (tally[l.brand] || 0) + l.quantity));
    return Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  }

  /* ======================================================================
     Order confirmation
     ====================================================================== */

  function initOrder() {
    const root = $('[data-order]');
    if (!root) return;
    const orders = store.getOrders();
    const wanted = store.getPrefs().lastOrderId;
    const order = orders.find((o) => o.id === wanted) || orders[0];

    if (!order) {
      root.innerHTML =
        '<p class="muted">No order to show. <a class="link-underline" href="' +
        url('collections/new-season/') +
        '">Start shopping</a>.</p>';
      return;
    }

    root.innerHTML =
      '<p class="eyebrow">Order ' +
      escapeHtml(order.id) +
      '</p>' +
      '<h1 style="margin:8px 0 14px">Thanks' +
      (order.name ? ', ' + escapeHtml(order.name.split(' ')[0]) : '') +
      '.</h1>' +
      '<p>A confirmation is on its way to <strong>' +
      escapeHtml(order.email || '') +
      '</strong>. Nothing ships — this is a teaching store.</p>' +
      '<div class="order-card" style="margin-top:28px">' +
      '<div class="order-card__head"><strong>' +
      order.lines.reduce((n, l) => n + l.quantity, 0) +
      ' items</strong><span>' +
      store.money(order.total) +
      ' ' +
      escapeHtml(order.currency) +
      '</span></div>' +
      '<div class="order-card__items">' +
      order.lines
        .map(
          (l) =>
            '<div>' +
            l.quantity +
            ' × ' +
            escapeHtml(l.title) +
            (l.variantTitle ? ' (' + escapeHtml(l.variantTitle) + ')' : '') +
            '</div>'
        )
        .join('') +
      '</div>' +
      '<div class="summary__row" style="padding-top:14px;border-top:1px solid var(--line);margin-top:14px"><span>Shipping</span><span>' +
      (order.shipping === 0 ? 'Free' : store.money(order.shipping)) +
      '</span></div>' +
      (order.address
        ? '<p class="muted" style="margin:14px 0 0">Shipping to ' +
          escapeHtml(order.address) +
          '</p>'
        : '') +
      '</div>';

    track.trackAnalyticsOnly('Order Confirmation Viewed', {
      order_id: order.id,
      revenue: order.total,
    });
  }

  /* ======================================================================
     Account
     ====================================================================== */

  function initAccount() {
    const root = $('[data-account]');
    if (!root) return;

    function renderSignedIn(customer) {
      const orders = store.getOrders();
      root.innerHTML =
        '<h1 style="margin-bottom:6px">' +
        escapeHtml(customer.firstName || 'Your account') +
        '</h1>' +
        '<p class="muted" style="margin-bottom:28px">' +
        escapeHtml(customer.email) +
        '</p>' +
        '<dl class="summary" style="display:grid;gap:8px;margin-bottom:24px">' +
        '<div class="summary__row"><span>Orders</span><span>' +
        (customer.lifetimeOrders || 0) +
        '</span></div>' +
        '<div class="summary__row"><span>Lifetime value</span><span>' +
        store.money(customer.lifetimeValue || 0) +
        '</span></div>' +
        '<div class="summary__row"><span>Favourite brand</span><span>' +
        escapeHtml(customer.favouriteBrand || '—') +
        '</span></div>' +
        '<div class="summary__row"><span>Email marketing</span><span>' +
        (customer.marketingOptIn ? 'Subscribed' : 'Not subscribed') +
        '</span></div>' +
        '</dl>' +
        '<button class="btn btn--outline btn--sm" data-optin-toggle>' +
        (customer.marketingOptIn ? 'Unsubscribe' : 'Subscribe to email') +
        '</button> ' +
        '<button class="btn btn--outline btn--sm" data-signout>Sign out</button>' +
        '<h2 style="margin:40px 0 14px;font-size:20px">Order history</h2>' +
        (orders.length
          ? orders
              .map(
                (o) =>
                  '<div class="order-card"><div class="order-card__head">' +
                  '<strong>' +
                  escapeHtml(o.id) +
                  '</strong><span>' +
                  new Date(o.placedAt).toLocaleDateString('en-AU') +
                  ' · ' +
                  store.money(o.total) +
                  '</span></div><div class="order-card__items">' +
                  o.lines
                    .map(
                      (l) =>
                        '<div>' + l.quantity + ' × ' + escapeHtml(l.title) + '</div>'
                    )
                    .join('') +
                  '</div></div>'
              )
              .join('')
          : '<p class="muted">No orders yet.</p>');

      $('[data-signout]').addEventListener('click', function () {
        track.track('Signed Out', { email: customer.email });
        store.signOut();
        track.resetIdentity();
        renderAuth();
      });

      $('[data-optin-toggle]').addEventListener('click', function () {
        customer.marketingOptIn = !customer.marketingOptIn;
        store.saveCustomer(customer);
        track.track(
          customer.marketingOptIn
            ? 'Email Subscription Started'
            : 'Email Subscription Stopped',
          { source: 'account_page' }
        );
        track.identify(customer);
        renderSignedIn(customer);
        toast(
          customer.marketingOptIn
            ? 'Subscribed to email'
            : 'Unsubscribed from email'
        );
      });
    }

    function renderAuth() {
      root.innerHTML =
        '<div class="auth__tabs" role="tablist">' +
        '<button role="tab" aria-selected="true" data-auth-tab="signin">Sign in</button>' +
        '<button role="tab" aria-selected="false" data-auth-tab="register">Create account</button>' +
        '</div>' +
        '<form data-auth-form novalidate>' +
        '<div data-register-only hidden>' +
        '<label class="field"><span>First name</span><input name="firstName" autocomplete="given-name"><span class="field__error"></span></label>' +
        '</div>' +
        '<label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"><span class="field__error"></span></label>' +
        '<label class="field"><span>Password</span><input name="password" type="password" required autocomplete="current-password"><span class="field__error"></span></label>' +
        '<label class="check" data-register-only hidden><input type="checkbox" name="marketingOptIn"><span>Email me about new collections</span></label>' +
        '<button class="btn btn--block" type="submit" style="margin-top:10px" data-auth-submit>Sign in</button>' +
        '</form>' +
        '<p class="muted" style="margin-top:18px;font-size:12px">No account is really created and no password is stored or checked. Any email works — the point is what Amplitude and Braze do with the identity.</p>';

      let mode = 'signin';
      const form = $('[data-auth-form]', root);

      $$('[data-auth-tab]', root).forEach(function (tab) {
        tab.addEventListener('click', function () {
          mode = tab.dataset.authTab;
          $$('[data-auth-tab]', root).forEach((t) =>
            t.setAttribute('aria-selected', String(t === tab))
          );
          $$('[data-register-only]', root).forEach(
            (el) => (el.hidden = mode !== 'register')
          );
          $('[data-auth-submit]', root).textContent =
            mode === 'register' ? 'Create account' : 'Sign in';
        });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const email = form.elements.email.value.trim();
        const wrap = form.elements.email.closest('.field');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          wrap.classList.add('field--error');
          $('.field__error', wrap).textContent = 'Enter a valid email address';
          return;
        }
        const customer = store.signIn({
          email: email,
          firstName: form.elements.firstName
            ? form.elements.firstName.value.trim()
            : '',
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
        toast(mode === 'register' ? 'Account created' : 'Signed in');
        renderSignedIn(customer);
      });
    }

    const existing = store.getCustomer();
    if (existing) renderSignedIn(existing);
    else renderAuth();

    track.trackAnalyticsOnly('Account Page Viewed', {
      signed_in: !!existing,
    });
  }

  /* ======================================================================
     Newsletter + enquiry forms
     ====================================================================== */

  function initForms() {
    $$('[data-newsletter]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const input = $('input[type=email]', form);
        const msg = $('.newsletter__msg', form.parentElement) || null;
        const email = input.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          if (msg) msg.textContent = 'Enter a valid email address.';
          return;
        }
        const customer = store.signIn({
          email: email,
          marketingOptIn: true,
          source: 'newsletter',
        });
        track.track('Newsletter Subscribed', {
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
        let ok = true;
        $$('[required]', form).forEach(function (input) {
          const wrap = input.closest('.field');
          const bad =
            !input.value.trim() ||
            (input.type === 'email' &&
              !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value.trim()));
          if (bad) ok = false;
          if (wrap) {
            wrap.classList.toggle('field--error', bad);
            const err = $('.field__error', wrap);
            if (err) err.textContent = bad ? 'Required' : '';
          }
        });
        if (!ok) return;

        const data = new FormData(form);
        const customer = store.signIn({
          email: String(data.get('email') || '').trim(),
          firstName: String(data.get('name') || '').split(' ')[0],
          company: data.get('company'),
          marketingOptIn: true,
          source: 'services_enquiry',
        });
        track.track('Enquiry Submitted', {
          service: data.get('service'),
          company: data.get('company'),
          budget: data.get('budget') || null,
          message_length: String(data.get('message') || '').length,
        });
        track.identify(customer);
        track.setUserProperties({
          lead_type: 'b2b_enquiry',
          interested_service: data.get('service'),
        });
        form.hidden = true;
        const done = $('[data-enquiry-done]', form.parentElement);
        if (done) done.hidden = false;
      });
    });

    $$('[data-service-cta]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        track.track('Service Interest', { service: btn.dataset.serviceCta });
        const select = $('[data-enquiry] [name=service]');
        if (select) select.value = btn.dataset.serviceCta;
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
      id: 'sim-signature',
      title: 'The Signature Range is live',
      body: 'Three pieces, made to no brief but our own. Limited numbers.',
      link: 'collections/signature/',
      simulated: true,
    },
    {
      id: 'sim-southbank',
      title: 'New from Southbank Coffee Co.',
      body: 'The pour-over dripper we made for the roastery, now in the store.',
      link: 'products/southbank-pour-over-dripper/',
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

    document.addEventListener('laneway:contentcards', (e) =>
      adoptBrazeCards(e.detail)
    );

    const live = track.requestContentCards();
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
        if (!panel.hidden)
          track.trackAnalyticsOnly('Content Cards Opened', {
            card_count: cards.length,
          });
      });
    });

    document.addEventListener('click', function (e) {
      if (!panel.hidden && !e.target.closest('#cards-panel') && !e.target.closest('[data-cards-toggle]'))
        panel.hidden = true;
    });

    listEl.addEventListener('click', function (e) {
      const el = e.target.closest('[data-card]');
      if (!el) return;
      const card = cards.find((c) => c.id === el.dataset.card);
      if (!card) return;
      track.logContentCardClick(card);
      if (card.link)
        location.href = /^https?:/.test(card.link) ? card.link : url(card.link);
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

  function maybeShowFreeShippingNudge() {
    const t = store.cartTotals();
    if (t.freeShippingGap <= 0 || t.count === 0) return;
    showIam({
      id: 'free-shipping',
      campaign: 'Free shipping threshold nudge',
      trigger: 'cart_value below free shipping threshold',
      title: 'You&rsquo;re ' + store.money(t.freeShippingGap) + ' from free shipping',
      body:
        'Orders over ' +
        store.money(cfg.SHIPPING_FREE_OVER || 100) +
        ' ship free anywhere in Australia.',
      cta: 'Keep shopping',
      link: 'collections/new-season/',
    });
  }

  function maybeShowReturningNudge() {
    const cart = store.getCart();
    if (!cart.lines.length) return;
    const age = Date.now() - new Date(cart.updatedAt || Date.now()).getTime();
    // A real Braze abandoned-cart campaign waits hours. Two minutes keeps the
    // demo watchable.
    if (age < 120000) return;
    const first = cart.lines[0];
    showIam({
      id: 'abandoned-cart',
      campaign: 'Cart abandonment',
      trigger: 'cart untouched for 2 minutes (hours, in a real campaign)',
      title: 'Still thinking about the ' + first.title + '?',
      body: 'Your cart is waiting. ' + store.cartCount() + ' item(s) held for you.',
      cta: 'View cart',
      link: 'cart/',
    });
  }

  /* ======================================================================
     Page view
     ====================================================================== */

  function trackPageView() {
    track.track('Page Viewed', {
      page_type: document.body.dataset.page || 'other',
      page_name: PAGE.name || document.title,
      path: location.pathname,
      referrer: document.referrer || null,
      title: document.title,
    });
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
    if (page === 'cart') initCart();
    if (page === 'checkout') initCheckout();
    if (page === 'order') initOrder();
    if (page === 'account') initAccount();

    trackPageView();
    setTimeout(maybeShowReturningNudge, 2500);

    if (window.LanewayDevtools) window.LanewayDevtools.mount();
  }

  function start() {
    const open = initGate();
    if (open) {
      track.init();
      boot();
    } else if (window.LanewayDevtools) {
      // Let the drawer work behind the gate — it is how you show what a
      // storefront password does to tracking.
      window.LanewayDevtools.mount();
    }
  }

  // Exposed so the dev panel can drive the storefront during a demo.
  window.LanewayApp = {
    toast,
    showIam,
    recommend,
    cardHtml,
    reboot: function () {
      renderCartBadge();
    },
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else start();
})();
