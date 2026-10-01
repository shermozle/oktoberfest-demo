# Synthetic data for the demo

Generates realistic Amplitude events for Laneway Bank from 1 September to
20 October 2026: visitors arriving from paid search, paid social,
comparison sites and organic search; browsing, calculators and the
landing page; the six-step application, with lots of people getting
distracted and dropping out at the financial steps; some coming back on
their own; and from 8 October, the Braze "High Value Application
Abandoners" email bringing more of them back, with a control group to
measure the lift.

Nothing is sent anywhere until you run `send --confirm`.

```bash
npm run data:generate          # build the events and print the story check
npm run data:report            # the story check again, on the last build
npm run data:send              # dry run: what would be sent, sends nothing
node datagen/run.mjs send --confirm                    # send everything
node datagen/run.mjs send --until 2026-10-01 --confirm # or send in stages
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
| The Braze campaign | `braze.launch`, `minLoan`, `lookbackDays`, `controlGroup`, open and click rates, the second email |

After changing anything, run `generate` and read the report. It shows the
funnel, mobile against desktop on the financial steps, conversion by
channel, and the campaign's results against its control group, so you can
see the story still holds before anything is sent.

The same seed and settings always produce the same events. Change `seed`
for a different but equally realistic set.

## What the data looks like

Events match [TRACKING.md](../TRACKING.md) exactly: the same names,
properties, user properties and context as the site sends, plus the
`[Amplitude] Page Viewed`, `session_start` and `session_end` events the
Browser SDK autocaptures, and UTM attribution user properties. Visitors are
anonymous (device id only) until step 1 of the application, then
identified by email, as on the site.

Emails are at `example.com`, `example.net` and `example.org`, which can't
receive mail, so a cohort synced to Braze can't email a real person. No
phone numbers are generated: the site sends Amplitude only
`phone_provided`.

The lending numbers (borrowing power, LVR, repayments, the instant
decision) come from the site's own `finance.js` and `catalog.json`, so a
synthetic application is approved or referred exactly as a real one would
be.

## Sending

`send` posts to Amplitude's Batch API in batches of 1,000, using the
project key in `src/assets/js/config.js` unless `AMPLITUDE_API_KEY` is
set (and `AMPLITUDE_SERVER_ZONE=EU` for an EU project). It records its
progress in `datagen/out/sent.json`, so running it again carries on where
it stopped instead of repeating. Every event has a fixed `insert_id`, so
Amplitude also drops any repeat sent within 7 days.

Once some data has been sent, don't change the settings and send the rest:
the two halves would describe different people. The sender refuses unless
you pass `--force`. To start again, clear the project's data in Amplitude,
delete `datagen/out/sent.json`, generate and send.

## Before you send

- **Braze event names.** Synthetic email events are named `Email Sent`,
  `Email Delivered`, `Email Opened`, `Email Clicked` and
  `Campaign Control Group Entered`. Check those against what Braze Currents
  actually sends into the project (send yourself one real email), and
  change `braze.events` in the config to match, so synthetic and real
  events land under the same names.
- **Session replays can't be generated.** Record some yourself on the live
  site, abandoning at step 3 or 4, for the replay part of the demo.
- **It's around 175,000 events.** Check that suits the project's event
  volume.
- **Cohort sync.** Syncing a cohort of these users to Braze creates Braze
  profiles for them. They're undeliverable, but they will show up in Braze.
