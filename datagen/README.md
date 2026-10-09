# Synthetic data for the demo

Generates realistic Amplitude events for Laneway Bank from 1 September to
20 October 2026: visitors arriving from paid search, paid social,
comparison sites and organic search; browsing, calculators and the
landing page; the six-step application, with lots of people getting
distracted and dropping out at the financial steps; some coming back on
their own; and from 8 October, the Braze "High Value Application
Abandoners" email bringing more of them back, with a control group to
measure the lift.

Nothing is sent anywhere until you run `send --confirm`. Through npm, the
flags go after a `--` (`npm run data:send -- --confirm`); without it npm
keeps them for itself. The script picks them up either way.

```bash
npm run data:generate          # build the events and print the story check
npm run data:report            # the story check again, on the last build
npm run data:send              # dry run: what would be sent, sends nothing
npm run data:send -- --confirm                         # send everything
npm run data:send -- --until 2026-10-01 --confirm      # or send in stages
```

## Tweaking

Everything is in [config.mjs](config.mjs), commented. The settings that
shape the story:

| To change | Setting |
|---|---|
| How much traffic | `traffic.visitorsPerDay`, `weekendFactor`, `weeklyGrowth`, `bursts` |
| Where it comes from | `channels` (weight, landing page, mobile share, UTMs, how well each converts) |
| Who applies and for how much | `personas` (property values, deposits, incomes, preferred loans) |
| Where people drop out | `funnel.steps`, plus `funnel.mobile` and `funnel.bigLoan` for the segments Amplitude's analysis should find |
| How distracted they are | `funnel.hesitationFactor`, `dropouts.returnOnOwn`, `dropouts.returnHours` |
| Everything around the journey | `behaviour`: bounces, repeat browsing, search (and the junk people type), filters, calculators, lead forms, rate updates and push prompts, internet banking, and the odd things below |
| The Braze campaign | `braze.launch`, `minLoan`, `lookbackDays`, `controlGroup`, open and click rates, the second email |

After changing anything, run `generate` and read the report. It shows the
funnel, mobile against desktop on the financial steps, conversion by
channel, and the campaign's results against its control group, so you can
see the story still holds before anything is sent.

The same seed and settings always produce the same events. Change `seed`
for a different but equally realistic set.

## What the data looks like

Every event in [TRACKING.md](../TRACKING.md) is generated, with the same
names, properties, user properties and context the site sends. On top of
those come the events the Browser SDK autocaptures: `[Amplitude] Page
Viewed`, `session_start`, `session_end`, `[Amplitude] Form Started` and
`[Amplitude] Form Submitted`, plus UTM and referrer attribution. Visitors
are anonymous (device id only) until they give an email, then identified,
as on the site. Left out: content cards and in-app messages, which only
appear when real Braze campaigns run, and the demo-only `Application
Seeded`.

The application journey is the spine, with the rest around it:

- **People who do nothing.** About a third of sessions are one page and
  out. A landing page bounce still has `Product Viewed`, because the page
  fires it on load.
- **Browsers.** Search, the menus, product cards, filters and sorting,
  recommendations, both calculators, accounts and cards. Some come back
  days later, and are more likely to apply when they do.
- **Leads.** Lender callback requests (including abandoners who ring
  instead of finishing), rate update sign-ups with the push prompt, new
  internet banking logins, and existing customers who sign in, browse, sign
  out or unsubscribe.
- **Odd behaviour:**
  - junk and misspelt searches that find nothing
  - calculator fiddling with silly numbers
  - going back a step and redoing it, which fires that step's event again,
    as the site does
  - leaving the application open past Amplitude's 30-minute session
    timeout, so it carries on in a new session
  - coming back on a different device, where the saved application isn't,
    and starting a second one under the same email (also after clicking a
    reminder on the other device)
  - speed-runners who click straight through on the defaults

Emails are at `example.com`, `example.net` and `example.org`, which can't
receive mail, so a cohort synced to Braze can't email a real person. No
phone numbers are generated: the site sends Amplitude only
`phone_provided`.

The lending numbers (borrowing power, LVR, repayments, the instant
decision) come from the site's own `finance.js` and `catalog.json`, so a
synthetic application is approved or referred exactly as a real one would
be.

## The Braze Canvas and Darren

Two layers sit on top of the base data, for the Braze half of the demo
(see [DEMO-SCRIPT.md](../DEMO-SCRIPT.md)):

- **The First Home Loan Canvas** (`canvas` in the config). First home
  buyers who stop at step 3 or 4 after the launch date enter a Braze
  Canvas: an email, a welcome-back in-app modal when they return, an SMS
  for those who don't click, and replies handed to the conversational
  agent. 15% are a control group. Braze's own events arrive the way its
  Amplitude export sends them, with the `[Appboy]` prefix, carrying
  `canvas_name`, `canvas_step_name` and `canvas_variation_name`. The report
  shows the Canvas against its control.
- **Darren Whitlock** (`darren` in the config), the user Akshin's demo is
  built around. His whole journey is scripted relative to `demoDate`:
  browsing, abandoning a First Home Loan at step 4 on his phone, the email,
  the SMS conversation, then finishing. Set `darren.email` to his Braze
  external id so Braze's live events land on the same user.

Both only ever add events, with their own ids. Turning them on, or changing
their settings, never changes an event that's already been sent.

## Sending

`send` posts to Amplitude's Batch API in batches of 1,000, using the
project key in `src/assets/js/config.js` unless `AMPLITUDE_API_KEY` is
set (and `AMPLITUDE_SERVER_ZONE=EU` for an EU project).

It records the id of every event it sends in `datagen/out/sent-ids.txt`,
and only ever sends events that aren't in it. So running it again carries
on where it stopped, and a later generate that adds events (switching on
the Canvas, say) sends just the new ones. Every event also has a fixed
`insert_id`, so Amplitude drops any repeat sent within 7 days.

It also keeps a fingerprint of everything already sent
(`datagen/out/sent-hash.txt`). If a settings change would alter an event
that's already in Amplitude, rather than only add new ones, it refuses to
send: the two would no longer tell the same story. Undo the change, or
pass `--force` if you really mean it. Settings that only add (the Canvas,
Darren) are always safe.

To start again from scratch, clear the project's data in Amplitude, delete
`datagen/out/sent-ids.txt` and `sent-hash.txt`, generate and send.

## Before you send

- **Form autocapture.** The `[Amplitude] Form Started` and
  `[Amplitude] Form Submitted` events carry only `[Amplitude] Form
  Destination`, since the site's forms have no id or name. Compare with a
  real one in the project, or set `behaviour.formAutocapture` to false to
  leave them out.
- **Braze event names.** The Canvas layer's events use `canvas.events` in
  the config (`[Appboy] Email Sent` and so on). Check them against the
  first real events from Braze's Amplitude export and correct them before
  sending. The older campaign below uses `braze.events`.
- **The older email campaign** (`braze` in the config) is already in
  Amplitude, under `Email Sent`, `Email Opened` and so on, without the
  prefix. Leave its settings alone: changing them alters events that have
  been sent, and the sender will refuse. Charts for the Canvas filter on
  `canvas_name`, which keeps it out of the way.
- **Session replays can't be generated.** Record some yourself on the live
  site, abandoning at step 3 or 4, for the replay part of the demo.
- **It's around 255,000 events.** Check that suits the project's event
  volume.
- **Cohort sync.** Syncing a cohort of these users to Braze creates Braze
  profiles for them. They're undeliverable, but they will show up in Braze.
