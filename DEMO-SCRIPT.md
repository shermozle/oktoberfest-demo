# Laneway Bank × Amplitude × Braze: the Amplitude script

For whoever presents the Amplitude half (Tom or Avinash), and for Akshin, so
everyone knows where the handovers land.

The shape of the whole demo:

| | Who | What | About |
|---|---|---|---|
| 1 | Amplitude | Laneway Bank, Darren, the drop-off, why, and the cohort | 7 min |
| 2 | Braze (Akshin) | The Canvas built by AI, Darren's messages, the agent | 9 min |
| 3 | Amplitude | Did it work? The lift, the channels, Darren's story | 4 min |

**Site:** <https://shermozle.github.io/oktoberfest-demo/>
**Landing page:** <https://shermozle.github.io/oktoberfest-demo/landing/>
**Amplitude dashboard:** _Laneway Bank: Oktoberfest demo_ (built in prep, below)
**Application funnel:** <https://app.amplitude.com/analytics/braze/chart/wk5p199x?linkingDashboardId=gsrgzl0t&sharingId=N5saheX->

Lines in quotes are what to say. Indented notes are what to click. Numbers
are approximate: say what's on screen.

---

## Part 1: Amplitude (about 7 minutes)

### 1. Meet Laneway Bank (45 seconds)

> Open the [landing page](https://shermozle.github.io/oktoberfest-demo/landing/) in the browser where you clicked
> **be Darren** (see "On the day").

"This is Laneway Bank. It's a Melbourne bank for people who'd rather pay off
a house than talk to a branch manager about it. The page you're looking at is
where our paid campaigns land: the Package Home Loan, our best-margin loan,
with a 100% offset account."

> Scroll to the [offset calculator](https://shermozle.github.io/oktoberfest-demo/landing/#savings) and move the "Kept in offset"
> slider.

"The calculator shows what your savings would save you. Every time someone
moves it, Amplitude records it, so we know which visitors are seriously
weighing up a loan and which are just browsing."

### 2. Meet Darren (1 minute)

> Click the person icon, top right: [internet banking](https://shermozle.github.io/oktoberfest-demo/account/), signed in as
> Darren.

"Let's follow one applicant. This is Darren. Darren's a first home buyer.
Darren is also, as his transactions make clear, a hipster: craft beer,
cedar and bergamot beard oil, oat flat whites, vinyl, and a sourdough
starter on a monthly subscription. But look at the Bonus Saver: a hundred
and twenty grand, nicknamed 'House deposit (do not touch)'. Darren is
serious."

> Click the application icon (the page with the dot) to open
> [his application](https://shermozle.github.io/oktoberfest-demo/apply/), paused at step 4.

"Applying takes six steps. Step one asks for an email and a mobile, so from
there on we know who he is. Hold on to that: it matters in a minute. Darren
got through About you, the property and his income. Then he hit Your
expenses. Given those transactions, you can see why he paused. He never
came back."

> Don't fill anything in. Switch to Amplitude.

### 3. The problem (1 minute)

> In Amplitude, open the dashboard, chart
> [**Application funnel**](https://app.amplitude.com/analytics/braze/chart/wk5p199x?linkingDashboardId=gsrgzl0t&sharingId=N5saheX-).

"Darren isn't alone. Here's the last month of applications. Steps 1 and 2 are fine: about 87% and
86% get through. Then look at step 3, Your income: only about 59% make it.
And step 4, Your expenses, loses another third. After that, almost everyone
who's still with us finishes."

"So the leak is in the middle. Steps 3 and 4 are the financial information."

> Point at the mobile versus desktop breakdown on the same chart.

"And it's worse on a phone. On mobile, only about 54% get past the income
step, against 66% on desktop."

### 4. Asking why with Amplitude AI (1.5 minutes)

> Open Amplitude's AI assistant and type the first prompt.

"I could spend the afternoon slicing this. Instead I'll ask."

**Prompt 1:** _Where are people dropping out of the home loan application, and
which groups drop out most?_

"It's found the same cliff at steps 3 and 4, and it's telling us mobile and
paid social traffic do worst."

**Prompt 2:** _What do people who stop at Your income do before they leave?_

"They linger. They spend several minutes on the income screen and then go.
Nobody bounces off it straight away: they're trying, and something stops
them."

> If the assistant offers a chart, click through to it. If it takes a while,
> keep talking about the next step while it works.

### 5. Watching it happen: session replay (1 minute)

> Open the saved replay **Mobile, stops at Your income**. Play from the step 3
> screen.

"Numbers tell us where. Session Replay shows us why. Here's someone on their
phone at the income step: they scroll, start typing, go back up, look at the
fields again... and they're gone. Payslip not handy, figure not to hand, lost
momentum."

### 6. The opportunity: we already know who they are (45 seconds)

> Back to the funnel. Click the bar for **Expenses Entered** to see the users
> who didn't get there, or open the cohort directly.

"Here's the thing. Everyone who drops out at step 3 or 4 already gave us
their email and mobile at step 1. These aren't anonymous visitors. We know
exactly who they are, how far they got, and what's left."

### 7. Building the high-value cohort and sending it to Braze (1 minute)

> Open the cohort **High Value Application Abandoners**.

"Rather than chase every abandoner, we start with our highest-value group:
first home buyers. A first home loan usually brings their everyday banking,
their savings and their credit card with it, for twenty years or more. So
this cohort is first home buyers who stopped at the income or expenses step
and haven't come back."

"Every one of them carries their progress with them: which steps they've
done, what's still needed, the loan they were after, how much they want to
borrow."

> Click **Sync** and show the Braze destination.

"We sync this cohort to Braze every hour, and we stream their events and
profile changes to Braze in real time. So the moment someone stalls, Braze
knows."

### Hand over to Braze

"So: we've found where people drop out, we've seen why, and we've handed
Braze a list of exactly who to win back, with everything it needs to
personalise the message. Akshin, how do we get them back?"

---

## Part 2: Braze (Akshin, about 9 minutes)

For reference, so the Amplitude presenter knows what's coming:

1. "Thanks to the team working with Amplitude, we now have an in-depth
   audience of high value application abandoners", ingested through the
   native bidirectional sync: the cohort (hourly) and the event stream (real
   time).
2. A Canvas built from scratch by Braze's AI Operator, from an uploaded PDF
   brief, with human approval and then auto-approve. It triggers in real time
   on the event from Amplitude and targets the Amplitude cohort.
3. A personalised email for **Darren Whitlock**, who abandoned a First Home
   Loan application with three steps left, built by AI to the brand
   guidelines with Liquid fallbacks.
4. Content Optimizer: subject line, body and button tested together
   (5 × 5 × 5 = 125 combinations).
5. If Darren clicks: an in-app modal when he's back on the site (and a
   banner). If he doesn't: an SMS with a link.
6. A conversational agent over SMS answers Darren's question about rates and
   hands him to a human lender with the full context.
7. Braze exports every message event back to Amplitude.

Akshin hands back with:

> "Now we'll switch back to Amplitude to see how effective our messages have
> been."

---

## Part 3: Amplitude, the hand back (about 4 minutes)

### 8. Darren's story (1.5 minutes)

> Open **User Look-Up** and search for Darren.

"Remember Darren, stuck on Your expenses? Here he is in Amplitude, and the
first thing you'll notice at the top: he finished. Application submitted, conditionally
approved, documents uploaded. So how did he get there?"

> Scroll down through his timeline, oldest at the bottom.

"Read it from the bottom up. Nine days ago he heard our ad on a podcast
called The Sourdough Hour. The first thing he did on our site was search
for beard oil. No results. Then craft beer. No results. Then, finally,
'first home'. He read about the First Home Loan and ran the borrowing power
calculator. Six days ago, on his phone, he got through steps 1, 2 and 3, sat on the expenses
screen for ten minutes, and left. Three steps from the end."

"Within the hour he entered Akshin's Canvas. Next morning, the email: opened,
not clicked. The day after, the SMS. He replied with a question, then
another about rates, then asked for a person: that's the agent handing him
to a lender. The next evening he tapped the link in the SMS, landed back
exactly where he left off, saw the welcome-back modal, and finished. Every
Braze event, in Darren's timeline, right next to what he did on the site."

### 9. Did the Canvas work? (1.5 minutes)

> Open chart **Canvas: submitted, Canvas vs control**.

"One person's a story. Here's everyone. Since the Canvas went live, about 27%
of the first home buyers in it have gone on to submit their application.
Braze held back a control group who got no messages: only about 14% of them
came back by themselves. The Canvas roughly doubled the number who finished."

> Open chart **Canvas: what brought them back**.

"And because Braze sends its events here, we can see which channel did the
work. The email brings back the people who were nearly there. The SMS
catches the ones the email missed: about half of everyone who came back did
it from a text message."

### 10. Close (1 minute)

> Back to the [**Application funnel**](https://app.amplitude.com/analytics/braze/chart/wk5p199x?linkingDashboardId=gsrgzl0t&sharingId=N5saheX-) chart.

"So that's the loop. Amplitude found where people were dropping out and why.
Braze reached them, by email, on the site, by SMS, and with an agent when
they had questions. And the results came straight back into Amplitude, where
we can see the Canvas working: person by person and in aggregate."

"And we started with one group. Later we could build journeys for all the
other groups too: the refinancers, the investors, the people on phones.
Each with its own message, because each is stuck for a different reason."

---

## Prep checklist (Simon)

### Data

- [ ] **Braze's event names.** Akshin's Amplitude export sends events with an
  `[Appboy]` prefix. After one real export, check the exact names in
  Amplitude (Data → Events) against `canvas.events` in
  `datagen/config.mjs`, and correct the config if they differ.
- [ ] **Darren.** Get Akshin's profile JSON. Set `darren.email` in
  `datagen/config.mjs` to Darren's Braze external id, so Braze's live events
  and the synthetic history land on the same Amplitude user. Set
  `darren.demoDate` to the demo day: his timeline is scripted relative to it
  (abandons six days before, finishes three days before).
- [ ] **Send the Canvas history:** `npm run data:generate`, check the
  CANVAS and DARREN sections of the report, then
  `npm run data:send -- --confirm`. It only sends what isn't already in
  Amplitude, and refuses if anything already sent would change.
- [ ] **Session replays.** Synthetic data can't produce replays. On the live
  site, start a few applications on a phone and on a laptop and abandon
  them at Your income and Your expenses, lingering first. Save the best
  one as **Mobile, stops at Your income**.

### Amplitude

Build a dashboard, **Laneway Bank: Oktoberfest demo**, with:

- [x] **[Application funnel](https://app.amplitude.com/analytics/braze/chart/wk5p199x?linkingDashboardId=gsrgzl0t&sharingId=N5saheX-)** (built):
  Application Started → Applicant Details
  Entered → Property Details Entered → Income Entered → Expenses Entered →
  Loan Selected → Application Submitted. Last 30 days. A second version
  segmented by device type (mobile, desktop).
- [ ] **Cohort, High Value Application Abandoners:** users where
  `first_home_buyer` = true, `application_status` = started and
  `application_step` is income or expenses, who performed Property Details
  Entered in the last 30 days and did not perform Application Submitted.
  Sync to Braze, hourly.
- [ ] **Event streaming to Braze:** Application Started, Income Entered,
  Expenses Entered and Application Submitted, with the user properties the
  Canvas needs (`first_name`, `application_step`,
  `application_info_needed`, `application_product`, `loan_amount`).
- [ ] **Canvas: submitted, Canvas vs control:** funnel `[Appboy] Canvas
  Entered` (where `canvas_name` = First Home Loan Win-Back) → Application
  Submitted, within 7 days, grouped by `canvas_variation_name` (Variant 1,
  Control).
- [ ] **Canvas: what brought them back:** Application Resumed where
  `utm_campaign` = first_home_loan_win_back, grouped by `utm_medium` (email,
  sms).
- [ ] **AI prompts:** try both prompts in Part 1 beforehand and tweak the
  wording until the answers are crisp.

### Braze (Akshin)

- [ ] The Amplitude export (Currents) sends **message engagement events
  only**. The site already sends its own custom events to Amplitude;
  exporting Braze's copies too would double them.
- [ ] The Canvas is called **First Home Loan Win-Back**, so the synthetic
  history and the live Canvas share a name. Its links carry
  `utm_source=braze`, `utm_campaign=first_home_loan_win_back` and
  `utm_medium` email or sms.
- [ ] Darren's external id matches the email set in `darren.email`.

### On the day

- [ ] Open tabs, in order: the landing page; the Amplitude dashboard; the AI
  assistant; the saved replay; the cohort; Darren in User Look-Up; the two
  Canvas charts.
- [ ] On [the site](https://shermozle.github.io/oktoberfest-demo/), open the event stream (`` ` ``), Controls tab, click
  **be Darren**, then press `` ` `` again to hide it. The site now shows
  Darren's internet banking and his application paused at step 4. This is
  presentation only: nothing done as him reaches his real user in Amplitude
  or Braze, so his Part 3 timeline stays clean.
- [ ] Afterwards: Controls tab, **start fresh**.
- [ ] If the AI assistant is slow, the funnel chart and the replay tell the
  same story without it.

---

## Things that could trip you up

- **Darren is already finished in Amplitude** by demo day. In Part 1 show him
  only on the site; don't open him in Amplitude until Part 3, where finishing
  is the reveal.
- **An older email campaign is also in the data** (from early October, sent
  to anyone borrowing over $750k). Its events have no `[Appboy]` prefix. The
  Canvas charts filter on `canvas_name`, so it stays out of the way; just
  don't chart `Email Sent` unfiltered.
- **Today's date matters.** The data runs to 20 October. Charts set to "last
  30 days" on demo day show the right window; don't pick a range that runs
  into the future.
