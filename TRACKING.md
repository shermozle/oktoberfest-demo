# Tracking plan

Everything fires from `src/assets/js/tracking.js`. There are three call shapes:

- `track(name, props)` sends to **both** Amplitude (`track`) and Braze
  (`logCustomEvent`, with the name lower-snake-cased).
- `trackAnalyticsOnly(name, props)` sends to Amplitude only. It's used for
  high-frequency UI interactions no campaign would trigger on.
- `trackPurchase(order)` sends a Braze `logPurchase` per line item, then
  `Order Completed` to both, with the order total as Amplitude revenue.

## The `products` array

Every event that carries product detail carries it in a `products` object
array, the shape Amplitude's Cart Analysis chart reads. There are no flat
`product`, `brand` or `price` properties on events; the array is the single
place product detail lives. One helper, `productItem()`, builds every element,
so the shape is identical wherever an event comes from.

| Child property | Present on | |
|---|---|---|
| `product_id` | every element | The product handle, e.g. `heavyweight-studio-jacket`. Matches the Braze `logPurchase` product id. |
| `product_name` | every element | |
| `brand` | every element | `Laneway`, `Southbank` or `RMIT` |
| `category` | every element | `Apparel`, `Drinkware`, `Accessories` |
| `price` | every element | Unit price for the selected variant |
| `tier` | when known | `entry`, `mid` or `premium`, from the product tags |
| `variant_id`, `variant` | when a variant is chosen | e.g. `Black / XL` |
| `color`, `size` | products with those options | Split out of the variant so each can be grouped on |
| `quantity` | cart and order lines | |
| `revenue` | cart and order lines | `price × quantity`. **This is the Cart Analysis revenue metric.** |
| `position` | lists the visitor was shown | 1-based: collection grids, search results, recommendations, clicked cards |

Views and impressions carry `price` without `quantity` or `revenue`, so only
real cart and order lines contribute to Cart Analysis revenue.

**To enable Cart Analysis:** in Amplitude Data, open the `products` event
property, set **Property Is Array** to true and turn on property splitting.
Each child property then counts toward the project's 2,000 event property
limit. If that's tight, keep `product_id`, `product_name`, `category`,
`price`, `quantity` and `revenue`.

**Braze** receives the same array as a nested event property on the events
sent to both tools. Braze segmentation works on the scalar custom attributes
listed below, while the array is there for Liquid templating, for example
listing cart contents in an abandoned-cart message.

## Page views

Amplitude autocapture sends `[Amplitude] Page Viewed` on every page, with the
URL, path, title and referrer. The site sends no page event of its own, and
Braze gets no page events; it doesn't need them and each would cost a data
point.

## Delivery

Both SDKs load asynchronously, and view events like `Product Viewed` fire as
the page boots, before either has arrived. Calls made in that window are
queued and replayed in order once the SDK is ready. Amplitude events keep the
time they actually happened. The event stream marks a call `NOT SENT` only if
it will never go: a placeholder key or a failed SDK load.

## Context on every event

Added automatically, so any event can be broken down by it.

| Property | |
|---|---|
| `session_id` | From the mock's own session cookie |
| `signed_in` | Boolean |
| `cart_size` | Units in the cart at the moment of the event |
| `cart_value` | Cart subtotal |
| `page_path` | |
| `currency` | `AUD` |

## Events sent to both tools

| Event | Braze name | `products` holds | Other properties |
|---|---|---|---|
| `Collection Viewed` | `collection_viewed` | the grid, with `position` | `collection`, `collection_handle`, `collection_type` (brand/category), `product_count` |
| `Product Viewed` | `product_viewed` | the product and its default variant | |
| `Product Detail Read` | `product_detail_read` | the product as configured | Fires past 70% scroll depth. A browse-abandonment trigger. |
| `Product Added to Cart` | `product_added_to_cart` | the added line | `add_source` (`product_page` or `sticky_bar`) |
| `Product Removed from Cart` | `product_removed_from_cart` | the line, at the quantity removed | |
| `Cart Quantity Changed` | `cart_quantity_changed` | the line, at its new quantity | `from_quantity`, `to_quantity` |
| `Cart Viewed` | `cart_viewed` | the whole cart | `free_shipping_gap` |
| `Checkout Started` | `checkout_started` | the whole cart | |
| `Contact Entered` | `contact_entered` | n/a | `email_provided`, `marketing_opt_in`. Fires on leaving the contact step, after the email identifies the visitor. |
| `Shipping Entered` | `shipping_entered` | n/a | `shipping_method`, `shipping`, `country`. No address details. |
| `Payment Entered` | `payment_entered` | n/a | `payment_method` |
| `Order Completed` | `order_completed` | the order lines | `order_id`, `revenue`, `subtotal`, `shipping`, `tax_included`, `item_count`, `shipping_method`, `payment_method` |
| `Search Performed` | `search_performed` | the results, with `position` | `query`, `results_count` |
| `Cart Seeded` | `cart_seeded` | the seeded lines | `source`. Demo control only. |
| `Newsletter Subscribed` | `newsletter_subscribed` | n/a | `email`, `source` |
| `Account Created` | `account_created` | n/a | `email`, `method` |
| `Signed In` | `signed_in` | n/a | `email`, `method` |
| `Signed Out` | `signed_out` | n/a | `email` |
| `Email Subscription Started` / `Stopped` | `email_subscription_started` / `_stopped` | n/a | `source` |
| `Enquiry Submitted` | `enquiry_submitted` | n/a | `service`, `company`, `budget`, `message_length` |
| `Service Interest` | `service_interest` | n/a | `service` |
| `Storefront Unlocked` | `storefront_unlocked` | n/a | `method` |

## Amplitude-only events

These are useful for funnels and session replay but would be noise in an
engagement tool.

| Event | `products` holds | Other properties |
|---|---|---|
| `Product Variant Selected` | the product at its new variant | `option_name`, `option_value`, `available` |
| `Product Card Clicked` | the clicked product, with `position` | `placement` |
| `Recommendations Shown` | the recommended list, with `position` | `seed_product_id`, `placement` |
| `Collection Sorted` | the re-sorted grid, with `position` | `collection`, `sort_by`, `results_count` |
| `Collection Filtered` | the filtered grid, with `position` | `collection`, `availability`, `price_min`, `price_max`, `results_count` |
| `Search Result Clicked` | the clicked result, with `position` | `query` |

Also sent with no product detail: `Search Opened`, `Navigation Clicked`, and
`In-App Message Shown` / `Clicked` / `Dismissed`. `In-App Message Shown` goes
to Amplitude only, because Braze records its own impressions.

Arriving on the checkout or order confirmation page sends nothing extra:
`Checkout Started` and `Order Completed` already carry the cart and order, and
the page view is autocaptured.

## Web push

Submitting the storefront password asks for notification permission, via the
browser's own prompt inside the submit click (Safari and Firefox only allow it
from a user action). Once granted, Braze subscribes the browser. Braze records
the subscription and push opens itself; these go to Amplitude only:

| Amplitude event | When | Properties |
|---|---|---|
| `Push Permission Requested` | The prompt is shown | `source` (`password_gate`) |
| `Push Permission Granted` | The visitor allows it | `source` |
| `Push Permission Denied` | The visitor blocks or dismisses it | `source`, `permission` (`denied` = blocked, `default` = dismissed) |

Nothing is asked if the browser has already blocked notifications, and a
returning visitor who already allowed them just has their subscription
re-confirmed, with no events. Give push campaign links UTM parameters (e.g.
`utm_source=braze&utm_medium=web_push`) and Amplitude's attribution
autocapture will record web push as the channel that brought someone back.

## Content cards

Only what the visitor does with cards is tracked:

| Amplitude event | Braze call | When |
|---|---|---|
| `Content Cards Opened` (`card_count`, `card_ids`) | `logContentCardImpressions` | The bell panel opens. That's when the cards are seen, and Braze's content card reporting counts impressions from this call. |
| `Content Card Clicked` (`card_id`, `card_title`) | `logContentCardClick` | A card is clicked |

Card syncs from Braze aren't events. The SDK fetches cards once per page and
the event stream shows each sync, marked as not sent. Sending them as events
put three per page load into Amplitude and cost a Braze data point each.

## User properties and Braze custom attributes

These are set on both sides together, so a cohort built in one tool can be
found in the other. They stay scalar because that's what Braze segments on.

| Property | Set when |
|---|---|
| `email`, `first_name`, `last_name` | Sign-in, registration, checkout step 1, newsletter, enquiry |
| `marketing_opt_in` | Sign-up checkbox or account toggle. Also drives Braze's email subscription state. |
| `persona` | Demo persona switch |
| `lifetime_orders`, `lifetime_value` | Order placed |
| `favourite_brand` | Order placed: the most-purchased brand on the order |
| `last_brand_viewed`, `last_category_viewed`, `last_product_viewed` | Product page view |
| `last_product_added` | Add to cart |
| `cart_value`, `cart_size` | Any cart change. Zeroed on order. |
| `last_order_id`, `last_order_at` | Order placed |
| `lead_type`, `interested_service` | Services enquiry |

No form validates its input. An email only becomes the Amplitude user id if
it's at least 5 characters, since Amplitude rejects shorter ids; a blank email
leaves the visitor as they were.

## Identity

Braze Currents sends Braze events (content card impressions and clicks, push
opens and so on) to Amplitude with the Braze external id as the Amplitude
`user_id`, and matches anonymous users by device id. So both pairs match:

| | Amplitude | Braze |
|---|---|---|
| User id | `user_id` = the email | `external_id` = the same email |
| Device id | `device_id` = Braze's device id | Braze's own device id |

- **One user id, set in one place.** `userIdFor()` in `tracking.js` gives the
  id both tools use. An email shorter than 5 characters (Amplitude's minimum)
  gives none, and both tools stay anonymous rather than disagreeing.
- **Amplitude adopts Braze's device id,** since Braze can't be told which id
  to use. Amplitude waits up to 5 seconds for Braze to load before starting
  (events fired meanwhile are queued), and switches over if Braze arrives
  later than that.
- **Storefront sign-out** leaves Braze on the same user, as Braze recommends,
  and clears Amplitude's user id but keeps the shared device id, so both still
  see the same person.
- **"Reset identity"** in the event stream's Controls tab calls Braze's
  `wipeData()` and Amplitude's `reset()`, giving a new anonymous visitor in
  both with a new shared device id. Use it before switching persona in a demo.

The State tab shows the ids each SDK is actually using and whether they match.

## Revenue

`Order Completed` carries the order total as Amplitude's event-level
`revenue` field, with `revenueType: purchase`, so Amplitude's revenue metrics
and LTV count it directly. There's no separate `revenue()` call; that created
a second event, shown in Amplitude as "Revenue (Unverified)", repeating the
same total. ("Unverified" only means no App Store or Play Store receipt,
which never applies on the web.) Product-level revenue comes from Cart
Analysis over `products.revenue` on the same event.

Braze gets one `logPurchase(product_id, price, currency, quantity, properties)`
per line item, since Braze's purchase model is per product and that's what
drives revenue-based segmentation and post-purchase campaigns. An immediate
data flush follows.

## Suggested things to show

1. **Add to cart.** One click produces an Amplitude event carrying the line
   in `products`, a Braze custom event with the same array, and Braze
   attribute writes for `cart_value` and `last_brand_viewed`. Behaviour
   Amplitude measures becomes segmentable in Braze straight away.
2. **Switch persona** from the Controls tab. Watch `changeUser`, `setEmail`,
   the subscription state and every custom attribute go across, then check
   the State tab for both ids.
3. **Show a Braze in-app message.** Any real Braze campaign that fires logs
   `In-App Message Shown` to Amplitude, so campaign exposure is an analytics
   event and its lift is measurable. With no campaigns built yet, set
   `SIMULATE_IAM: true` and add something under $100 to see a simulated one.
4. **Complete a checkout.** No field is required, so you can click straight
   through. `Checkout Started` carries the cart, then `Contact Entered`,
   `Shipping Entered` and `Payment Entered` mark each stage (a funnel of
   those shows where checkouts stall), then `Order Completed` carries the
   lines with `revenue` per line, Braze logs a purchase per line, and
   lifetime stats roll forward.
5. **Open Cart Analysis** on `Order Completed` and group by `products.brand`
   or `products.size` to show which brand or size drives revenue.
6. **Sign out, then back in.** Identity resets on both sides while the
   anonymous device id stays put.
