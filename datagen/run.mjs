/* ==========================================================================
   Laneway Bank synthetic data: the command line.

     node datagen/run.mjs generate        build the events, print the report
     node datagen/run.mjs report          report on the last generated file
     node datagen/run.mjs send            show what would be sent (sends nothing)
     node datagen/run.mjs send --confirm  send to Amplitude

   send options:
     --until 2026-10-01      only events up to the end of this local day
                             (default: the whole generated range)
     --force                 send even though the generated data has changed
                             since an earlier partial send

   Output goes to datagen/out/ (git-ignored): events.ndjson, one event per
   line in Amplitude's HTTP API shape, and sent.json, which records how far
   a send has got so a re-run carries on rather than repeating.
   ========================================================================== */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, createWriteStream } from 'node:fs';
import cfg from './config.mjs';
import { generate, siteConfig } from './model.mjs';

const OUT = 'datagen/out';
const EVENTS = OUT + '/events.ndjson';
const META = OUT + '/meta.json';
const SENT = OUT + '/sent.json';

const [command, ...rest] = process.argv.slice(2);
// `npm run data:send --confirm` (no `--` before the flag) hands the flag to
// npm, which passes it on only as npm_config_confirm. Accept that too, so
// the command does what it looks like it does.
const fromNpm = (name) => process.env['npm_config_' + name];
const flag = (name) => rest.includes('--' + name) || fromNpm(name) === 'true';
const option = (name) => {
  const i = rest.indexOf('--' + name);
  if (i !== -1) return rest[i + 1];
  const v = fromNpm(name);
  return v && v !== 'true' ? v : null;
};

// Changes to the settings or the model change the data, which matters for a
// send that's already partly done.
const fingerprint = () =>
  createHash('sha1')
    .update(JSON.stringify(cfg))
    .update(readFileSync('datagen/model.mjs'))
    .digest('hex')
    .slice(0, 12);

const readEvents = () => {
  if (!existsSync(EVENTS)) {
    console.error('No generated data yet. Run: node datagen/run.mjs generate');
    process.exit(1);
  }
  return readFileSync(EVENTS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
};

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '—');
const n = (x) => x.toLocaleString('en-AU');
const localDate = (ms) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone }).format(new Date(ms));

/* --- generate ------------------------------------------------------------ */

async function runGenerate() {
  const started = Date.now();
  const { events, stats } = generate(cfg);
  mkdirSync(OUT, { recursive: true });
  const out = createWriteStream(EVENTS);
  for (const e of events) out.write(JSON.stringify(e) + '\n');
  await new Promise((r) => out.end(r));
  const meta = {
    fingerprint: fingerprint(),
    generatedAt: new Date().toISOString(),
    events: events.length,
    visitors: stats.visitors,
    sessions: stats.sessions,
    first: events[0] && new Date(events[0].time).toISOString(),
    last: events.length && new Date(events[events.length - 1].time).toISOString(),
  };
  writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
  console.log(
    `Generated ${n(events.length)} events for ${n(stats.visitors)} visitors (${n(stats.sessions)} sessions) in ${(
      (Date.now() - started) /
      1000
    ).toFixed(1)}s → ${EVENTS}\n`
  );
  report(events);
}

/* --- report: does the data tell the story? ------------------------------ */

function report(events) {
  const STAGES = [
    ['Application Started', 'Started'],
    ['Applicant Details Entered', '1 About you'],
    ['Property Details Entered', '2 The property'],
    ['Income Entered', '3 Your income'],
    ['Expenses Entered', '4 Your expenses'],
    ['Loan Selected', '5 Your loan'],
    ['Application Submitted', '6 Submitted'],
  ];
  const b = cfg.braze.events;
  const apps = new Map();
  const deviceOf = new Map();
  const counts = {};
  const perDay = {};
  let landingVisitors = new Set();

  for (const e of events) {
    counts[e.event_type] = (counts[e.event_type] || 0) + 1;
    const day = localDate(e.time);
    perDay[day] = (perDay[day] || 0) + 1;
    const p = e.event_properties || {};
    if (e.device_id) deviceOf.set(e.device_id, /iPhone|Android/.test(e.device_model) ? 'mobile' : 'desktop');
    if (e.event_type === 'Product Viewed' && p.page_type === 'landing') landingVisitors.add(e.device_id);
    if (p.application_id) {
      if (!apps.has(p.application_id))
        apps.set(p.application_id, { stages: new Set(), device: deviceOf.get(e.device_id), channel: p.utm_source || 'none' });
      const a = apps.get(p.application_id);
      a.stages.add(e.event_type);
      if (e.event_type === 'Application Resumed') a[p.utm_source === 'braze' ? 'resumedFromEmail' : 'resumedOnOwn'] = true;
      if (e.event_type === 'Application Submitted') a.submittedAt = e.time;
    }
  }

  const all = [...apps.values()];
  const reached = (list, name) => list.filter((a) => a.stages.has(name)).length;

  console.log('APPLICATION FUNNEL (distinct applications)');
  let prev = null;
  for (const [name, label] of STAGES) {
    const c = reached(all, name);
    console.log(`  ${label.padEnd(16)} ${n(c).padStart(7)}   ${prev === null ? '' : pct(c, prev) + ' of previous'}`);
    prev = c;
  }

  console.log('\nWHERE IT BREAKS: finishing each financial step, of those who reached it');
  for (const device of ['mobile', 'desktop']) {
    const list = all.filter((a) => a.device === device);
    const income = pct(reached(list, 'Income Entered'), reached(list, 'Property Details Entered'));
    const expenses = pct(reached(list, 'Expenses Entered'), reached(list, 'Income Entered'));
    console.log(`  ${device.padEnd(8)} income ${income.padStart(6)}   expenses ${expenses.padStart(6)}   (${n(list.length)} applications)`);
  }

  console.log('\nBY CHANNEL: landing visitors → started → submitted');
  const channels = {};
  for (const a of all) {
    const c = (channels[a.channel] = channels[a.channel] || { started: 0, submitted: 0 });
    c.started += 1;
    if (a.submittedAt) c.submitted += 1;
  }
  for (const [name, c] of Object.entries(channels).sort((x, y) => y[1].started - x[1].started))
    console.log(`  ${name.padEnd(14)} started ${n(c.started).padStart(6)}   submitted ${pct(c.submitted, c.started).padStart(6)}`);
  console.log(`  (landing page visitors: ${n(landingVisitors.size)}, starting: ${pct(all.filter((a) => a.channel !== 'none').length, landingVisitors.size)})`);

  // Per person, not per application: a reminder clicked on another device
  // starts a second application under the same email.
  const people = new Map();
  for (const e of events) {
    if (!e.user_id) continue;
    const p = people.get(e.user_id) || {};
    const props = e.event_properties || {};
    if (e.event_type === b.sent && !p.emailedAt) p.emailedAt = e.time;
    if (e.event_type === b.opened) p.opened = true;
    if (e.event_type === b.clicked) p.clicked = true;
    if (e.event_type === 'Campaign Control Group Entered') p.controlAt = e.time;
    if (props.utm_source === 'braze' && /Application (Resumed|Started)/.test(e.event_type)) p.backFromEmail = true;
    if (e.event_type === 'Application Submitted') p.submittedAt = e.time;
    people.set(e.user_id, p);
  }
  const emailed = [...people.values()].filter((p) => p.emailedAt);
  const control = [...people.values()].filter((p) => p.controlAt);
  const won = (list, since) => list.filter((p) => p.submittedAt && p.submittedAt > since(p)).length;
  console.log(`\nBRAZE: ${cfg.braze.campaign}, from ${cfg.braze.launch} (people)`);
  console.log(`  cohort entered       ${n(emailed.length + control.length)}  (${n(control.length)} held out as control)`);
  console.log(`  opened               ${pct(emailed.filter((p) => p.opened).length, emailed.length)}`);
  console.log(`  clicked              ${pct(emailed.filter((p) => p.clicked).length, emailed.length)}`);
  console.log(`  back from email      ${n(emailed.filter((p) => p.backFromEmail).length)}`);
  console.log(`  submitted, emailed   ${pct(won(emailed, (p) => p.emailedAt), emailed.length)}`);
  console.log(`  submitted, control   ${pct(won(control, (p) => p.controlAt), control.length)}   ← the lift is the gap`);

  const dayCounts = Object.values(perDay);
  console.log('\nVOLUME');
  console.log(`  ${n(events.length)} events, ${Object.keys(perDay)[0]} to ${Object.keys(perDay).pop()}`);
  console.log(`  per day: ${n(Math.min(...dayCounts))} to ${n(Math.max(...dayCounts))}`);
  const top = Object.entries(counts).sort((x, y) => y[1] - x[1]);
  console.log('  ' + top.map(([k, v]) => `${k} ${n(v)}`).join(' · '));
}

/* --- send ---------------------------------------------------------------- */

async function runSend() {
  const events = readEvents();
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const state = existsSync(SENT) ? JSON.parse(readFileSync(SENT, 'utf8')) : { sent: 0, fingerprint: meta.fingerprint };

  if (meta.fingerprint !== fingerprint()) {
    console.error('Settings or model have changed since the last generate. Run generate first.');
    process.exit(1);
  }
  if (state.sent > 0 && state.fingerprint !== meta.fingerprint && !flag('force')) {
    console.error(
      `${n(state.sent)} events from an earlier version of the data have already been sent.\n` +
        'Sending this version would mix the two. Use --force to carry on anyway, or delete\n' +
        `${SENT} if the earlier send went to a project you've since cleared.`
    );
    process.exit(1);
  }

  const until = option('until');
  const limit = until ? new Date(until + 'T00:00:00Z').getTime() + 38 * 3600e3 : Infinity; // generous; filtered by local date below
  const due = events.filter((e, i) => i >= state.sent && e.time <= limit && (!until || localDate(e.time) <= until));
  const apiKey = process.env.AMPLITUDE_API_KEY || siteConfig.AMPLITUDE_API_KEY;
  const zone = (process.env.AMPLITUDE_SERVER_ZONE || cfg.amplitude.serverZone).toUpperCase();
  const endpoint = zone === 'EU' ? 'https://api.eu.amplitude.com/batch' : 'https://api2.amplitude.com/batch';

  console.log(`Endpoint:   ${endpoint}`);
  console.log(`API key:    ${apiKey.slice(0, 6)}…${apiKey.slice(-4)} (${process.env.AMPLITUDE_API_KEY ? 'AMPLITUDE_API_KEY' : 'src/assets/js/config.js'})`);
  console.log(`Already sent: ${n(state.sent)} of ${n(events.length)}`);
  if (!due.length) return console.log('Nothing to send.');
  console.log(`To send:    ${n(due.length)} events, ${new Date(due[0].time).toISOString()} to ${new Date(due[due.length - 1].time).toISOString()}`);
  console.log(`Batches:    ${Math.ceil(due.length / cfg.amplitude.batchSize)} of up to ${cfg.amplitude.batchSize}`);

  if (!flag('confirm')) {
    console.log('\nDry run: nothing sent. First event:\n' + JSON.stringify(due[0], null, 2));
    console.log('\nAdd --confirm to send.');
    return;
  }

  const start = events.indexOf(due[0]);
  if (start !== state.sent) throw new Error('internal: send cursor out of step');
  for (let i = 0; i < due.length; i += cfg.amplitude.batchSize) {
    const batch = due.slice(i, i + cfg.amplitude.batchSize);
    await post(endpoint, apiKey, batch);
    state.sent += batch.length;
    state.fingerprint = meta.fingerprint;
    state.lastSentAt = new Date().toISOString();
    state.sentThrough = new Date(batch[batch.length - 1].time).toISOString();
    writeFileSync(SENT, JSON.stringify(state, null, 2) + '\n');
    process.stdout.write(`\r  sent ${n(state.sent)} / ${n(events.length)}`);
    await sleep(cfg.amplitude.pauseMs);
  }
  console.log('\nDone.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries rate limits and server errors with backoff; stops on anything
// else, since a 400 means the payload is wrong and retrying won't fix it.
async function post(endpoint, apiKey, events) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ api_key: apiKey, events, options: { min_id_length: 1 } }),
    });
    if (res.ok) return;
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 7) {
      const wait = Math.min(60000, 1000 * 2 ** attempt);
      console.warn(`\n  ${res.status}, retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Amplitude rejected a batch (${res.status}): ${body.slice(0, 500)}`);
  }
}

/* --- main ---------------------------------------------------------------- */

if (command === 'generate') await runGenerate();
else if (command === 'report') report(readEvents());
else if (command === 'send') await runSend();
else {
  console.log(readFileSync('datagen/run.mjs', 'utf8').split('*/')[0].replace('/*', ''));
  process.exit(command ? 1 : 0);
}
