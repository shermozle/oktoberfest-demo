# Laneway Bank × Amplitude × Braze: Tom's run sheet

Tom presents the Amplitude half. Akshin presents Braze in the middle. Simon
sets everything up beforehand (see the end) and is unreachable on the day.

| | Who | What | About |
|---|---|---|---|
| 1 | Tom | Laneway Bank, Darren, where people drop out, the cohort | 7 min |
| 2 | Akshin | Braze builds the journey and wins Darren back | 9 min |
| 3 | Tom | Did it work? Darren's story, then everyone | 4 min |

Lines in quotes are what to say. Lines starting **Click** are what to do.
Numbers are approximate: say what's on screen.

---

## Before you start (5 minutes, before the session)

Open these in one Chrome window, as tabs, in this order. Tab 1 sets Darren
up in this browser, so open it first and use this same window for
everything.

1. **Darren set-up:** <https://shermozle.github.io/oktoberfest-demo/account/?demo=darren>
   (lands on "Hi, Darren". This is the site tab for Part 1.)
2. **Landing page:** <https://shermozle.github.io/oktoberfest-demo/landing/>
3. **Amplitude, Application funnel:** <https://app.amplitude.com/analytics/braze/chart/wk5p199x?linkingDashboardId=gsrgzl0t&sharingId=N5saheX->
4. **Amplitude, AI assistant:** _link from Simon_
5. **Amplitude, session replay "Mobile, stops at Your income":** _link from Simon_
6. **Amplitude, cohort "High Value Application Abandoners":** _link from Simon_
7. **Amplitude, Darren (User Look-Up, user `lwb_001`):** _link from Simon_
8. **Amplitude, chart "Canvas vs control":** _link from Simon_
9. **Amplitude, chart "What brought them back":** _link from Simon_

Make sure you're signed in to Amplitude in that window.

---

## Part 1: Tom (about 7 minutes)

### Laneway Bank (45 seconds) · tab 2

**Click** tab 2, the landing page.

"This is Laneway Bank. It's a Melbourne bank for people who'd rather pay off
a house than talk to a branch manager about it. This page is where our paid
campaigns land."

**Click** "See what you'd save" and drag the **Kept in offset** slider.

"Everything a visitor does here goes to Amplitude, so we know who's
seriously weighing up a loan and who's just browsing."

### Meet Darren (1 minute) · tab 1

**Click** tab 1, Darren's internet banking.

"Let's follow one applicant. This is Darren. Darren's a first home buyer.
Darren is also, as his transactions make clear, a hipster: craft beer,
cedar and bergamot beard oil, oat flat whites, vinyl, and a sourdough
starter on a monthly subscription. But look at the saver: eighty-two
grand, nicknamed 'House deposit (do not touch)'. Darren is serious."

**Click** the page icon with the dot, top right, to open his application.

"Applying takes six steps. Step one asks for an email and a mobile, so from
there on we know who he is. Hold on to that. Darren got through About you,
the property and his income. Then he hit Your expenses. Given those
transactions, you can see why he paused. He never came back."

Don't type anything here.

### Where people drop out (1 minute) · tab 3

**Click** tab 3, the Application funnel.

"Darren isn't alone. Here's the last month of applications. Steps 1 and 2
are fine: nearly nine in ten get through. Then step 3, Your income: only
about 59% make it. Step 4, Your expenses, loses another third. After that,
almost everyone finishes. So the leak is in the middle: the financial
information."

"And it's worse on a phone: about 55% get past the income step on mobile,
against 66% on desktop."

### Asking why (1.5 minutes) · tab 4

**Click** tab 4 and type:

> Where are people dropping out of the home loan application, and which groups drop out most?

"It's found the same cliff at steps 3 and 4, and that phones and paid
social traffic do worst."

**Type:**

> What do people who stop at Your income do before they leave?

"They linger on that screen for minutes, then go. They're trying, and
something stops them."

If the answer is slow, keep talking and move on to the replay; it makes the
same point.

### Watching it happen (1 minute) · tab 5

**Click** tab 5 and press play.

"Numbers tell us where. Session Replay shows us why. Someone on their phone
at the income step: they scroll, start typing, go back up, look again, and
they're gone."

### We know who they are (2 minutes) · tab 6

**Click** tab 6, the cohort.

"Everyone who stops at step 3 or 4 has already given us their email and
mobile. We know who they are, how far they got, and what's left."

"We start with our highest-value group: first home buyers. A first home loan
usually brings their everyday banking, savings and credit card with it for
twenty years or more. So this cohort is first home buyers who stopped at
income or expenses and haven't come back. Each one carries their progress:
the steps done, what's still needed, the loan, the amount."

"This cohort syncs to Braze every hour, and their events stream to Braze in
real time. The moment someone stalls, Braze knows."

### Hand over to Akshin

"So we've found where people drop out, we've seen why, and we've handed
Braze exactly who to win back, with everything it needs to personalise the
message. Akshin, how do we get them back?"

---

## Part 2: Akshin (about 9 minutes)

What's coming, so you're ready:

1. He opens with the audience we just sent him.
2. Braze's AI builds the whole journey (a Canvas) from a PDF brief.
3. A personalised email for **Darren**, three steps from finishing his First
   Home Loan.
4. Testing subject line, body and button together: 125 combinations.
5. If Darren clicks, a pop-up when he's back on the site. If not, an SMS.
6. An AI agent answers Darren's SMS about rates and passes him to a human
   lender.
7. Braze sends every message event back to Amplitude.

**He hands back with:** "Now we'll switch back to Amplitude to see how
effective our messages have been."

---

## Part 3: Tom (about 4 minutes)

### Darren's story (1.5 minutes) · tab 7

**Click** tab 7, Darren in Amplitude.

"Remember Darren, stuck on Your expenses? Here he is in Amplitude. Look at
the top: he finished. Application submitted, conditionally approved,
documents uploaded. So how did he get there?"

**Scroll** down his timeline. The oldest events are at the bottom.

"Read it from the bottom up. On the ninth of September he heard our ad on a
podcast called The Sourdough Hour. The first thing he did on our site was
search for beard oil. No results. Then craft beer. No results. Then,
finally, 'first home'. He read about the First Home Loan and ran the
borrowing power calculator."

"On the twenty-third, on his phone, he got through three steps, sat on the
expenses screen, and left. Within the hour, Akshin's journey picked him up.
Next morning, the email: opened, not clicked. The day after, the SMS: he
replied with a question, asked about rates, then asked for a person, and
the agent handed him to a lender. And on the fifth of October, at a quarter
to eight in the morning, he tapped the link, landed back where he left
off, saw the pop-up, and finished."

"Every Braze message, in Darren's timeline, right next to what he did on the
site."

### Did it work for everyone? (1.5 minutes) · tabs 8 and 9

**Click** tab 8.

"One person's a story. Here's everyone. Of the first home buyers in the
journey, about 29% have gone on to submit. Braze held back a control group
who got no messages: only about 13% of them came back by themselves. The
journey more than doubled the number who finished."

**Click** tab 9.

"And because Braze sends its events here, we can see which channel did the
work: about half came back from the email, and half from the text
message."

### Close (1 minute) · tab 3

**Click** tab 3, the funnel.

"So that's the loop. Amplitude found where people drop out and why. Braze
reached them by email, on the site, by SMS, and with an agent when they had
questions. And the results came straight back into Amplitude, person by
person and in aggregate."

"We started with one group. Next, we build journeys for the others: the
refinancers, the investors, the people on phones. Each stuck for a
different reason, each with its own message."

---

## After the session

Open <https://shermozle.github.io/oktoberfest-demo/?demo=reset> to clear
Darren out of the browser.

## If something goes wrong

- **A chart won't load:** say the line anyway and move to the next tab.
- **The AI assistant is slow:** skip it. The funnel and the replay tell the
  same story.
- **Tab 1 doesn't say "Hi, Darren":** open tab 1's link again.
- **Never open Darren in Amplitude (tab 7) before Part 3.** His finished
  application is the reveal.

---

## Simon, before you fly

### Send the data

- [ ] `npm run data:generate`, read the CANVAS and DARREN sections, then
  `npm run data:send -- --confirm`. About 3,200 events: the First Home Loan
  Win-Back journey (22 September on) and Darren's history. No real Braze
  data flows into Amplitude for this demo, so these synthetic events, named
  the way Braze's export names them, are the whole "after".

### Build in Amplitude and paste the links into tabs 4 to 9

- [ ] **Tab 4, AI assistant:** try both prompts and tweak the wording until
  the answers are crisp.
- [ ] **Tab 5, replay:** on the live site, start a few applications on a
  phone, linger and abandon at Your income. Save the best replay.
- [ ] **Tab 6, cohort "High Value Application Abandoners":**
  `first_home_buyer` = true, `application_status` = started,
  `application_step` is income or expenses, did Property Details Entered in
  the last 30 days and not Application Submitted. Sync to Braze, hourly.
- [ ] **Tab 7, Darren:** User Look-Up for user id `lwb_001`.
- [ ] **Tab 8, "Canvas vs control":** funnel `[Appboy] Canvas Entered`
  (`canvas_name` = First Home Loan Win-Back) → Application Submitted within
  7 days, grouped by `canvas_variation_name`.
- [ ] **Tab 9, "What brought them back":** Application Resumed where
  `utm_campaign` = first_home_loan_win_back, grouped by `utm_medium`.
- [ ] Add a device-type breakdown to the Application funnel (tab 3).

### Tell Akshin

- [ ] Call the Canvas **First Home Loan Win-Back**, to match the charts.
- [ ] In his Darren profile, change the First Home Loan rate to **5.74%**
  (comparison **5.77%**), as on the site, and the steps to
  `step_reached: "expenses"`, `steps_completed: 3`, `total_steps: 6`, so
  "three steps left" matches the six-step application Tom shows.
- [ ] Share this run sheet with Tom and Akshin.
