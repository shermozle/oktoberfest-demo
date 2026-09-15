# Tracking plan

Everything fires from `src/assets/js/tracking.js`. Three call shapes:

- `track(name, props)` — goes to **both** Amplitude (`logEvent`) and Braze
  (`logCustomEvent`, name lower-snake-cased).
- `trackAnalyticsOnly(name, props)` — Amplitude only. Used for high-frequency
  UI interactions no campaign would ever trigger on.
- `trackPurchase(order)` — Amplitude `Revenue` objects plus Braze `logPurchase`,
  one per line item, then a single `Order Completed` event to both.

## Context on every event

Added automatically, so anything can be broken down by it later.

| Property | |
|---|---|
| `session_id` | From the mock's own session cookie |
| `signed_in` | Boolean |
| `cart_size` | Units in cart at the moment of the event |
| `cart_value` | Cart subtotal |
| `page_path` | |
| `currency` | `AUD` |

## Events sent to both tools

| Event | Braze name | Key properties |
|---|---|---|
| `Page Viewed` | `page_viewed` | `page_type`, `page_name`, `path`, `referrer` |
| `Collection Viewed` | `collection_viewed` | `collection`, `collection_type` (brand/category), `product_count`, `brands` |
| `Product Viewed` | `product_viewed` | `product`, `product_handle`, `brand`, `category`, `tier`, `price`, `variant_count` |
| `Product Detail Read` | `product_detail_read` | Fires past 70% scroll depth. Browse-abandonment trigger. |
| `Product Added to Cart` | `product_added_to_cart` | `product`, `variant`, `brand`, `category`, `tier`, `price`, `quantity`, `line_value`, `add_source` |
| `Product Removed from Cart` | `product_removed_from_cart` | `product`, `variant`, `quantity`, `line_value` |
| `Cart Quantity Changed` | `cart_quantity_changed` | `from_quantity`, `to_quantity` |
| `Cart Viewed` | `cart_viewed` | `cart_value`, `cart_size`, `product_handles`, `free_shipping_gap` |
| `Checkout Started` | `checkout_started` | `cart_value`, `cart_size`, `product_handles`, `brands` |
| `Checkout Step Completed` | `checkout_step_completed` | `step` (1–4), `step_name` |
| `Order Completed` | `order_completed` | `order_id`, `revenue`, `subtotal`, `shipping`, `tax_included`, `item_count`, `product_handles`, `brands`, `shipping_method`, `payment_method` |
| `Search Performed` | `search_performed` | `query`, `results_count`, `top_result` |
| `Newsletter Subscribed` | `newsletter_subscribed` | `email`, `source` |
| `Account Created` | `account_created` | `email`, `method` |
| `Signed In` | `signed_in` | `email`, `method` |
| `Signed Out` | `signed_out` | `email` |
| `Email Subscription Started` / `Stopped` | `email_subscription_started` / `_stopped` | `source` |
| `Enquiry Submitted` | `enquiry_submitted` | `service`, `company`, `budget`, `message_length` |
| `Service Interest` | `service_interest` | `service` |
| `Storefront Unlocked` | `storefront_unlocked` | `method` |
| `Content Cards Updated` | `content_cards_updated` | `card_count`, `unviewed` |
| `In-App Message Shown` | `in_app_message_shown` | `message_id`, `campaign` — fired from Braze's own subscription |

## Amplitude-only events

Useful for funnels and session replay, noise in an engagement tool.

`Product Variant Selected` · `Product Card Clicked` · `Recommendations Shown` ·
`Collection Sorted` · `Collection Filtered` · `Search Opened` ·
`Search Result Clicked` · `Navigation Clicked` · `Checkout Viewed` ·
`Checkout Step Failed Validation` · `Shipping Method Selected` ·
`Payment Method Selected` · `Order Confirmation Viewed` ·
`Account Page Viewed` · `Content Cards Opened` · `Content Card Clicked` ·
`In-App Message Shown` / `Clicked` / `Dismissed`

## User properties / Braze custom attributes

Set on both sides together, so a cohort built in one tool can be found in the
other.

| Property | Set when |
|---|---|
| `email`, `first_name`, `last_name` | Sign-in, registration, checkout step 1, newsletter, enquiry |
| `marketing_opt_in` | Sign-up checkbox, account toggle. Also drives Braze's email subscription state. |
| `persona` | Demo persona switch |
| `lifetime_orders`, `lifetime_value` | Order placed |
| `favourite_brand` | Order placed — most-purchased brand on the order |
| `last_brand_viewed`, `last_category_viewed`, `last_product_viewed` | Product page view |
| `last_product_added` | Add to cart |
| `cart_value`, `cart_size` | Any cart change. Zeroed on order. |
| `last_order_id`, `last_order_at` | Order placed |
| `lead_type`, `interested_service` | Services enquiry |

## Identity bridge

| Tool | Identifier | Cross-reference it carries |
|---|---|---|
| Amplitude | `user_id` = email; `device_id` = the mock's anon id | `braze_external_id` user property |
| Braze | `external_id` = generated customer id | `amplitude_device_id` and `amplitude_user_id` custom attributes |

Before sign-in both tools share the same anonymous device id, so the
pre-identification session stitches correctly.

## Revenue

Amplitude gets one `Revenue` object per line item — `productId`, `price`,
`quantity`, `revenueType: 'purchase'`, plus `order_id`, `variant`, `brand` and
`category` as event properties — so product-level revenue reporting works.

Braze gets one `logPurchase(product_id, price, currency, quantity, properties)`
per line item, which is what drives revenue-based segmentation and
post-purchase campaigns, followed by an immediate data flush.

## Suggested things to show

1. **Add to cart** → one click produces an Amplitude event, a Braze custom
   event, and Braze attribute writes for `cart_value` and `last_brand_viewed`.
   The point: behaviour Amplitude measures is immediately segmentable in Braze.
2. **Switch persona** (Controls tab) → watch `changeUser`, `setEmail`, the
   subscription state and every custom attribute go across, then check the
   State tab for both ids.
3. **Under $100 add-to-cart** → the free-shipping in-app message appears and
   logs `In-App Message Shown` to Amplitude. The point: campaign exposure is an
   analytics event, so lift is measurable.
4. **Complete a checkout** → four `Checkout Step Completed` events, then
   per-line Amplitude revenue and Braze `logPurchase`, then lifetime stats
   rolling forward on the profile.
5. **Sign out, then back in** → identity reset on both sides and the anonymous
   device id staying put.
