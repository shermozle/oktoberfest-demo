# Demo: winning back high-value home loan applications

The story: paid traffic to the Package Home Loan landing page isn't
converting. Amplitude shows where applications stall, Braze wins the
stalled ones back with a reminder that knows exactly what's left, and
Amplitude measures how many come back.

Site: <https://shermozle.github.io/oktoberfest-demo/landing/>. Event names
and properties are in [TRACKING.md](TRACKING.md).

## The six steps

The application runs Application Started → six steps → Application
Submitted. Each completed step sends an event to both tools:

| Step | Event when it's completed |
|---|---|
| 1. About you (email and mobile, both required) | `Applicant Details Entered` |
| 2. The property | `Property Details Entered` |
| 3. Your income | `Income Entered` |
| 4. Your expenses | `Expenses Entered` |
| 5. Your loan | `Loan Selected` |
| 6. Review | `Application Submitted` |

Steps 3 and 4 are the financial information. By then the visitor has given
an email and a mobile at step 1, which is the hook for the whole demo.

## Before the demo

### Data

The funnel and the AI analysis need volume showing the drop at steps 3 and
4. [datagen/](datagen/README.md) generates it: 1 September to 20 October,
about 23,000 visitors, the drop-off at the financial steps (worse on
mobile and paid social), people coming back on their own, and the Braze
campaign from 8 October with a control group. Tweak `datagen/config.mjs`,
run `npm run data:generate`, check the report, then send.

Session replays can't be generated. Do a few applications yourself on the
live site and abandon them at step 3 or 4, so there are replays of real
people stalling on the income and expenses screens.

### Amplitude

1. **Funnel:** `Product Viewed` where `page_type = landing` →
   `Application Started` → `Applicant Details Entered` →
   `Property Details Entered` → `Income Entered` → `Expenses Entered` →
   `Loan Selected` → `Application Submitted`. Group by `utm_campaign` to
   show it's the paid landing traffic.
2. **Cohort: "High Value Application Abandoners".** Users who:
   - performed `Property Details Entered` in the last 30 days,
   - did not perform `Expenses Entered` since,
   - have `loan_amount` ≥ 750,000,
   - have `phone_provided` = true and `application_status` = `started`.

   Add `application_product_id` = `package-home-loan` to narrow it to the
   highest-margin loan.
3. **Sync the cohort to Braze** (Audiences → the cohort → Sync → Braze,
   hourly). It arrives as a Braze cohort filter.

### Braze

1. **Currents to Amplitude** must be on, sending message engagement
   (sends, opens, clicks). User ids already match: both tools use the email
   as the user id and share Braze's device id.
2. **Campaign:** email, audience = the synced cohort, re-eligible after a
   week. Optionally add an SMS variant: every abandoner has a phone number
   in Braze.
3. **Template:** start from
   [braze/abandoned-application-email.html](braze/abandoned-application-email.html),
   then restyle or rewrite it with Braze's AI tools in the demo. It lists
   `application_info_needed` (only the steps they haven't done), changes its
   pitch by `application_product_id`, aborts if the application is already
   submitted, and links to `application_resume_url` with
   `utm_source=braze&utm_medium=email&utm_campaign=high_value_application_abandoners`.
4. **Control group:** give the campaign a 10% control group, so the lift
   in Amplitude is measured, not assumed.

## Running it

1. **The problem.** Open the funnel. Most landing page visitors who start
   an application stop at steps 3 and 4.
2. **Ask why.** Use Amplitude's AI to explore the drop-off: which
   segments stall, how long they spend on the income and expenses screens.
   Then open session replays of visitors who stopped at step 3 or 4 and
   watch them hesitate over income, expenses and debts.
3. **The hook.** Click into one of those users. Their `email` and
   `phone_provided` are there: they gave both at step 1. So did everyone
   else in the drop-off.
4. **The cohort.** Show "High Value Application Abandoners" and its sync to
   Braze. Point out `application_steps_completed` and
   `application_info_needed` on a user's profile: the cohort knows how far
   each person got.
5. **Braze.** Open one abandoner's profile: the same attributes are there,
   plus their mobile. Build or refine the reminder with Braze's AI features,
   and preview it as two users: one stopped at income, one at expenses. The
   checklist differs. Swap one to a First Home Loan and the pitch changes.
   Send.
6. **Did it work?** Back in Amplitude: Braze's email events arrive through
   Currents on the same users. Chart `Application Resumed` where
   `utm_source = braze`, then a funnel from the email click through
   `Application Resumed` to `Application Submitted`, compared against the
   control group.

## Doing it live on the site

- **Create an abandoner on the spot:**
  1. Open `/landing/?utm_source=google&utm_medium=cpc&utm_campaign=package_offset`.
  2. Click Apply and fill in step 1 with an address you can receive mail at
     and a mobile. The ACMA fictional numbers (`0491 570 156` to `159`) are
     safe.
  3. Continue through step 2 and close the tab at step 3.

  The event stream (bottom right, or `` ` ``) shows the progress attributes
  going to Braze.
- **One click instead:** the event stream's Controls tab has
  "high-value abandoner: Package, $840k, stopped at step 3".
- **Close the loop:** open the reminder email in the same browser and click
  "Finish my application". The draft is still there, and
  `Application Resumed` fires with `utm_source=braze`.

## Things that will catch you out

- **Resume is per browser.** The saved application lives in localStorage,
  so the email link only resumes it on the device and browser that started
  it. Anywhere else it starts a fresh application.
- **Braze needs the user before the cohort lands.** Users reach Braze when
  they complete step 1. Amplitude's cohort sync only matches users Braze
  already has, which it will have, because step 1 identifies them in both.
- **Subscription state.** Abandoners who left "Send me rate updates"
  unticked are `subscribed`, not `opted_in`. Send the reminder to
  subscribed users, or half the cohort won't get it.
- **Cohort timing.** The sync is hourly at best. For a live demo, sync the
  cohort beforehand and show the result, rather than waiting on it.
