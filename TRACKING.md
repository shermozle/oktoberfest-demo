# Tracking plan

Everything fires from `src/assets/js/tracking.js`. There are two call shapes:

- `track(name, props)` sends to **both** Amplitude (`track`) and Braze
  (`logCustomEvent`, with the name lower-snake-cased).
- `trackAnalyticsOnly(name, props)` sends to Amplitude only. It's used for
  high-frequency UI interactions no campaign would trigger on.

## Product properties

An event about one product carries it as flat properties, built by one
helper, `productProps()`, so the shape is the same wherever an event comes
from. Both tools can segment on these directly, and Braze Liquid can quote
them back in a message.

| Property | Present on | |
|---|---|---|
| `product_id` | every product | The handle, e.g. `package-home-loan` |
| `product_name` | every product | |
| `product_category` | every product | `home-loans`, `everyday`, `savings`, `credit-cards` |
| `interest_rate` | products with a rate | % p.a. On loan events this is the rate for the chosen repayment type, so interest-only shows the interest-only rate. |
| `comparison_rate` | home loans | % p.a. |
| `rate_type` | home loans | `variable` or `fixed` |
| `fixed_years` | fixed loans | |
| `loan_purpose_type` | home loans | `owner_occupier` or `investor`: who the product is for |

An event about a list (a category page, search results, recommendations)
carries the handles in `product_ids` instead.

## Money: bands and exact figures

A bank would be careful about sending someone's finances to two more
systems, so the site sends bands where an exact figure adds nothing:
`income_band` (`$50k–$100k`), `property_value_band` and `loan_amount_band`.
Exact income never leaves the browser.

Three figures do go across exactly, because a campaign quotes them back
("you could borrow around $680,000"): `loan_amount`, `borrowing_power` and
`estimated_repayment`, plus `lvr`.

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
| `application_in_progress` | Boolean: a saved, unsubmitted application exists |
| `page_path` | |
| `currency` | `AUD` |

## The application funnel

The home loan application is the path the demo follows, in six steps: about
you, the property, your income, your expenses, your loan, review. Each event
goes to both tools: Amplitude builds the funnel, and Braze knows how far
someone got when they stop, which is what an abandoned application campaign
runs on. Every event carries `application_id`. See [DEMO.md](DEMO.md) for
the storyline this supports.

| Event | Braze name | Properties |
|---|---|---|
| `Application Started` | `application_started` | `source` (the button that started it: `product_page`, `borrowing_power_calculator`, `header`, `landing_hero`, `in_app_message`…), any `utm_*` parameters it arrived with, plus product properties if a loan was pre-chosen. Fires once, when a new draft is created. |
| `Application Resumed` | `application_resumed` | `step`, `step_number`, `minutes_since_saved`, and any `utm_*` on the link that brought them back. A reminder email's link carries `utm_source=braze`, so this is the event that measures how many the email re-activated. |
| `Applicant Details Entered` | `applicant_details_entered` | `applicant_count`, `first_home_buyer`, `email_provided`, `phone_provided` (both always true: step 1 requires them), `marketing_opt_in`. Fires after the email identifies the visitor. |
| `Property Details Entered` | `property_details_entered` | `loan_purpose` (`buy_home`, `buy_investment`, `refinance`), `property_stage`, `property_value_band`, `loan_amount`, `lvr`, `state` |
| `Income Entered` | `income_entered` | `employment_type`, `income_band`, `applicant_count`, `other_income` (boolean) |
| `Expenses Entered` | `expenses_entered` | `dependants`, `has_other_debts`, `borrowing_power`, `within_borrowing_power` |
| `Loan Selected` | `loan_selected` | product properties, `repayment_type`, `loan_term_years`, `repayment_frequency`, `estimated_repayment` |
| `Application Submitted` | `application_submitted` | everything above, the `utm_*` parameters the application started with, plus `decision` (`conditionally_approved` or `referred_to_lender`), `decision_reasons`, `minutes_to_submit` |
| `Document Uploaded` | `document_uploaded` | `document_type`, `documents_outstanding` |

The decision is arithmetic: within borrowing power and within the loan's
maximum LVR is a conditional approval, anything else is referred. Going back
a step sends nothing, and typing only saves the draft.

The draft is saved in localStorage after every step and every keystroke, so
reloading or leaving and coming back resumes where the visitor stopped. That
means resuming works in the same browser only: a reminder link opened on
another device starts a fresh application.

### Progress attributes

After every step (and on start and submit) both tools get the same picture
of how far the application has got. Braze uses these to personalise a
reminder, Amplitude to build the abandoner cohort.

| Property | Example after step 2 | |
|---|---|---|
| `application_step` | `income` | The next step to do; `submitted` once it's in |
| `application_steps_completed` | `["about_you","property"]` | Array |
| `application_steps_remaining` | `4` | |
| `application_percent_complete` | `33` | |
| `application_info_needed` | `["Your income and employment", "Your monthly expenses and any other debts", …]` | Array of plain-language items, ready to list in an email |
| `application_resume_url` | `https://…/apply/` | Where a reminder links to. Add UTMs in the campaign. |
| `application_product`, `application_product_id` | `Package Home Loan`, `package-home-loan` | Set on start if a loan was pre-chosen (the landing page does), and again at step 5 |

[braze/abandoned-application-email.html](braze/abandoned-application-email.html)
is a starter reminder email built on these.

## The Package Home Loan landing page

`/landing/` is for paid traffic. Its header and footer are stripped of
navigation, so the ways off the page are applying or talking to a lender.
Send campaign traffic with UTM parameters, for example:

```
/landing/?utm_source=google&utm_medium=cpc&utm_campaign=package_offset
```

Those parameters go on every event the page sends and on every apply link,
so `Application Started` and `Application Submitted` carry them too. A funnel
from `Product Viewed` (where `page_type = landing`) to `Application
Submitted`, grouped by `utm_campaign`, gives cost-per-application by
campaign. Amplitude's attribution autocapture records the same UTMs as user
properties.

Each apply button has its own `source`: `landing_header`, `landing_hero`,
`landing_calculator`, `landing_footer` and `landing_sticky`, so you can see
which placement converts.

| Event | Sent to | Properties |
|---|---|---|
| `Product Viewed` | both | product properties, `page_type: landing`, `utm_*` |
| `Offset Savings Calculated` | both | `loan_amount`, `loan_amount_band`, `offset_balance`, `interest_saved_first_year`, `interest_saved_total`, `months_sooner`, `package_beats_variable`, `utm_*`, product properties. Sent 1.2s after the sliders stop moving. |
| `Product Detail Read` | both | product properties, `page_type: landing`. Past 70% scroll depth. |
| `Landing CTA Clicked` | Amplitude | `cta` (`hero_savings`, `header_talk`, `footer_talk`), `utm_*`. Apply buttons don't send this; `Application Started` records them. |
| `FAQ Opened` | Amplitude | `question`, `position`, `page_type` |

The offset calculator also sets `estimated_offset_saving` (first-year
saving) and `offset_balance` as user properties, so a Braze follow-up can
say "your $40,000 would save you $2,376 this year". The offset balance is
the visitor's slider setting, not a real balance, so it goes across exactly.

The page is honest about the fee. Below the offset balance where the Package
beats the no-fee Variable Home Loan (about $16,800 on a $600,000 loan), the
calculator says so, and `package_beats_variable` is false on the event.

## Other events sent to both tools

| Event | Braze name | Properties |
|---|---|---|
| `Product List Viewed` | `product_list_viewed` | `category`, `category_handle`, `product_count`, `product_ids` |
| `Product Viewed` | `product_viewed` | product properties |
| `Product Detail Read` | `product_detail_read` | product properties. Fires past 70% scroll depth. A browse-abandonment trigger. |
| `Product Interest Registered` | `product_interest_registered` | product properties. Accounts, savings and cards can't be opened in the demo, so this is the cross-sell signal. |
| `Borrowing Power Calculated` | `borrowing_power_calculated` | `applicant_count`, `dependants`, `income_band`, `borrowing_power`, `estimated_repayment`, product properties. Sent 1.2s after the visitor stops changing inputs. |
| `Repayments Calculated` | `repayments_calculated` | `loan_amount`, `loan_amount_band`, `loan_term_years`, `repayment_frequency`, `repayment_type`, `repayment`, product properties. Same debounce. |
| `Search Performed` | `search_performed` | `query`, `results_count`, `product_ids` |
| `Lender Callback Requested` | `lender_callback_requested` | `topic`, `contact_method`, `preferred_time`, `message_length` |
| `Contact Method Chosen` | `contact_method_chosen` | `contact_method` (`mobile_lender`, `video`, `phone`) |
| `Rate Updates Subscribed` | `rate_updates_subscribed` | `email`, `source` |
| `Account Created` | `account_created` | `email`, `method` |
| `Signed In` | `signed_in` | `email`, `method` |
| `Signed Out` | `signed_out` | `email` |
| `Email Subscription Started` / `Stopped` | `email_subscription_started` / `_stopped` | `source` |
| `Application Seeded` | `application_seeded` | `source`, `step`, `loan_amount`. Demo control only. |

## Amplitude-only events

These are useful for funnels and session replay but would be noise in an
engagement tool.

| Event | Properties |
|---|---|
| `Product Card Clicked` | product properties, `placement`, `position` |
| `Recommendations Shown` | `seed_product_id`, `placement`, `product_ids` |
| `Product List Sorted` | `category`, `sort_by`, `results_count`, `product_ids` |
| `Product List Filtered` | `category`, `purpose`, `rate_type`, `features`, `results_count`, `product_ids` |
| `Search Result Clicked` | product properties, `query`, `position` |

Also sent with no product detail: `Search Opened`, `Navigation Clicked`, and
`In-App Message Shown` / `Clicked` / `Dismissed`. `In-App Message Shown` goes
to Amplitude only, because Braze records its own impressions.

Arriving on the application outcome page sends nothing extra:
`Application Submitted` already carries the application, and the page view is
autocaptured.

## Web push

Signing up for rate updates (the footer form) asks for notification
permission, via the browser's own prompt inside the submit click (Safari and
Firefox only allow it from a user action). Once granted, Braze subscribes
the browser. Braze records the subscription and push opens itself; these go
to Amplitude only:

| Amplitude event | When | Properties |
|---|---|---|
| `Push Permission Requested` | The prompt is shown | `source` (`rate_updates`) |
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
the event stream shows each sync, marked as not sent.

## User properties and Braze custom attributes

These are set on both sides together, so a cohort built in one tool can be
found in the other. They stay scalar because that's what Braze segments on,
except the two progress arrays above, which are there for Liquid.

| Property | Set when |
|---|---|
| `email`, `first_name`, `last_name` | Sign-in, registration, application step 1, rate updates, callback request |
| `marketing_opt_in` | Sign-up checkbox, application step 1 or internet banking toggle |
| `phone_provided` | Application step 1. The number itself goes to Braze only, via `setPhoneNumber` (E.164, e.g. `+61412345678`), for SMS. |
| `persona`, `existing_customer`, `has_home_loan` | Demo persona switch |
| `application_status` | `started`, `conditionally_approved`, `referred_to_lender`, `documents_received` |
| `application_step` and the other progress attributes | Every step: see [Progress attributes](#progress-attributes) |
| `application_started_at`, `application_submitted_at`, `application_id`, `application_last_resumed_at` | Start, submit and resume |
| `first_home_buyer` | Step 1 |
| `loan_purpose`, `loan_amount`, `loan_amount_band`, `lvr` | Step 2 |
| `income_band`, `employment_type` | Step 3 (`income_band` also from the borrowing power calculator) |
| `borrowing_power` | Step 4, or the borrowing power calculator |
| `documents_outstanding` | Submit, then each upload |
| `last_product_viewed`, `last_category_viewed` | Product page view |
| `interested_product` | Register interest on a non-loan product |
| `estimated_offset_saving`, `offset_balance` | Offset calculator on the landing page |
| `lead_type`, `enquiry_topic` | Lender callback request |

Email is required, and must look like an address (`name@example.com`), on
every form that takes one: application step 1, the lender callback form,
internet banking and rate updates. It's what Braze sends to, and it becomes
the user id in both tools. Application step 1 also requires an Australian
mobile (`0412 345 678` or `+61 412 345 678`). Every other field is optional.

**Braze email subscription** has three states. Ticking "Send me rate
updates" (or subscribing in internet banking) sets `opted_in`. Leaving it
unticked keeps Braze's default, `subscribed`, so an abandoned application
reminder still reaches them. Only unsubscribing in internet banking sets
`unsubscribed`. Send the reminder to `subscribed` and above; send marketing
to `opted_in` only.

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
- **Internet banking sign-out** leaves Braze on the same user, as Braze
  recommends, and clears Amplitude's user id but keeps the shared device id,
  so both still see the same person.
- **"Reset identity"** in the event stream's Controls tab calls Braze's
  `wipeData()` and Amplitude's `reset()`, giving a new anonymous visitor in
  both with a new shared device id. Use it before switching persona in a demo.
  It keeps the application and history saved in the browser.
- **"Start fresh"**, below it, goes further: it resets both SDKs, deletes
  their saved ids and unsent queues (`AMP_*` cookies, `ab.storage.*`) and
  everything the site saved, then reloads. The next page view is a brand new
  visitor with a new device id, which is the way to run the demo journey
  again from the top.

The State tab shows the ids each SDK is actually using and whether they match.

## Revenue

Nothing is sent as revenue, and Braze gets no `logPurchase`. An application
isn't a purchase, and a loan amount booked as revenue would swamp every
revenue chart. Measure the funnel on `Application Submitted` with
`decision = conditionally_approved`, and sum `loan_amount` where a value is
needed.

## Suggested things to show

1. **Run the borrowing power calculator.** Stop typing and one
   `Borrowing Power Calculated` event lands in both tools, and
   `borrowing_power` becomes a Braze attribute a campaign can quote. With
   `SIMULATE_IAM: true` a simulated in-app message offers to start an
   application with that amount.
2. **Apply from the calculator.** `Application Started` carries
   `source: borrowing_power_calculator`, so Amplitude can attribute
   applications to the tool that produced them.
3. **Stop at step 3 and leave.** Reload, or come back later:
   `Application Resumed` fires, and the draft is exactly as it was. Braze has
   `application_status: started`, `application_step: income` and the list of
   what's left in `application_info_needed`. The full storyline is in
   [DEMO-SCRIPT.md](DEMO-SCRIPT.md).
   "Be Darren" in the Controls tab shows Darren's paused application on the
   site but, being presentation only, sends nothing to his real user.
4. **Submit two ways.** Enter an email and mobile and click straight through
   with the defaults, and it's conditionally approved; raise the property
   value or drop the income and it's referred to a lender. The decision is
   on the event, so a funnel split by `decision` shows both paths.
5. **Upload documents** on the outcome page. Each `Document Uploaded` lowers
   `documents_outstanding` in Braze, the attribute a reminder campaign would
   run on.
6. **Switch persona** from the Controls tab. Watch `changeUser`, `setEmail`,
   the subscription state and every custom attribute go across, then check
   the State tab for both ids.
