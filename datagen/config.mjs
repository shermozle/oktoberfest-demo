/* ==========================================================================
   Laneway Bank synthetic data: the knobs.

   Everything about who visits, what they do and where they give up is set
   here. Change a number, run `npm run data:generate`, and read the report
   it prints to check the story still holds before sending anything.

   Probabilities are 0–1. Durations are minutes unless the name says hours.
   Dates and hours are local to Australia/Melbourne.
   ========================================================================== */

export default {
  // Same seed + same settings = the same users and events, every run.
  seed: 20261001,

  // First and last day of data, inclusive.
  start: '2026-09-01',
  end: '2026-10-20',
  timezone: 'Australia/Melbourne',

  site: 'https://shermozle.github.io/oktoberfest-demo/',

  /* --- Traffic -------------------------------------------------------- */

  traffic: {
    // New visitors on a weekday at the start of the period.
    visitorsPerDay: 420,
    weekendFactor: 0.72,
    // Compounding weekly growth, so the trend line isn't flat.
    weeklyGrowth: 0.025,
    // Days with more (or less) traffic than usual.
    bursts: [
      { from: '2026-09-14', to: '2026-09-20', factor: 1.35, note: 'Spring campaign flight' },
      { from: '2026-10-05', to: '2026-10-11', factor: 1.2, note: 'Paid social push' },
    ],
    // Share of visits starting in each local hour, 0–23.
    hourWeights: [1, 0.5, 0.3, 0.2, 0.2, 0.4, 1, 2, 3, 3.5, 3.5, 3.8, 4.5, 4.2, 3.5, 3.4, 3.6, 4, 4.6, 5.2, 5.6, 5, 3.6, 2],
  },

  // Where visitors come from. `landing` is the first page: 'landing/' is
  // the Package Home Loan landing page, 'index.html' the home page.
  // `startFactor` scales how likely that channel's visitors are to start
  // an application; `stepFactor` scales every step's completion rate.
  channels: [
    { name: 'paid_search', weight: 34, landing: 'landing/', mobileShare: 0.55, startFactor: 1.0, stepFactor: 1.0,
      utm: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'package_offset' }, referrer: 'https://www.google.com/' },
    { name: 'paid_social', weight: 22, landing: 'landing/', mobileShare: 0.86, startFactor: 0.8, stepFactor: 0.94,
      utm: { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'package_offset_social' }, referrer: 'https://m.facebook.com/' },
    { name: 'comparison_site', weight: 8, landing: 'landing/', mobileShare: 0.5, startFactor: 1.2, stepFactor: 1.03,
      utm: { utm_source: 'rate_compare', utm_medium: 'referral', utm_campaign: 'package_listing' }, referrer: 'https://www.ratecompare.example/' },
    { name: 'organic_search', weight: 20, landing: 'index.html', mobileShare: 0.6, startFactor: 0.7, stepFactor: 1.0,
      utm: null, referrer: 'https://www.google.com/' },
    { name: 'direct', weight: 11, landing: 'index.html', mobileShare: 0.45, startFactor: 0.8, stepFactor: 1.04,
      utm: null, referrer: null },
    { name: 'existing_customer', weight: 5, landing: 'account/', mobileShare: 0.5, startFactor: 0.3, stepFactor: 1.05,
      utm: null, referrer: null },
  ],

  // Devices, split into mobile and desktop by each channel's mobileShare.
  devices: {
    mobile: [
      { weight: 62, os_name: 'Mobile Safari', os_version: '18', device_model: 'iPhone' },
      { weight: 38, os_name: 'Chrome Mobile', os_version: '129', device_model: 'Android' },
    ],
    desktop: [
      { weight: 55, os_name: 'Chrome', os_version: '129', device_model: 'Windows' },
      { weight: 35, os_name: 'Safari', os_version: '18', device_model: 'Mac' },
      { weight: 10, os_name: 'Edge', os_version: '129', device_model: 'Windows' },
    ],
  },

  // Where in Australia. Melbourne-heavy, like a Melbourne bank.
  locations: [
    { weight: 46, city: 'Melbourne', region: 'Victoria', state: 'VIC', postcodes: ['3068', '3056', '3121', '3181', '3070', '3011'] },
    { weight: 24, city: 'Sydney', region: 'New South Wales', state: 'NSW', postcodes: ['2042', '2010', '2026', '2204'] },
    { weight: 13, city: 'Brisbane', region: 'Queensland', state: 'QLD', postcodes: ['4101', '4005', '4064'] },
    { weight: 7, city: 'Adelaide', region: 'South Australia', state: 'SA', postcodes: ['5000', '5067'] },
    { weight: 6, city: 'Perth', region: 'Western Australia', state: 'WA', postcodes: ['6000', '6050'] },
    { weight: 4, city: 'Hobart', region: 'Tasmania', state: 'TAS', postcodes: ['7000'] },
  ],

  /* --- Who they are ---------------------------------------------------- */

  // What each kind of borrower looks like. Money is in dollars. `products`
  // weights which loan they end up choosing at step 5; landing page traffic
  // leans further towards the Package (see funnel.landingPackageBias).
  personas: [
    { name: 'first_home_buyer', weight: 34, couple: 0.55, propertyValue: [520000, 980000], depositShare: [0.05, 0.2],
      income: [72000, 135000], expenses: [1900, 3400], products: { 'first-home-loan': 50, 'variable-home-loan': 25, 'package-home-loan': 25 } },
    { name: 'upgrader', weight: 26, couple: 0.8, propertyValue: [950000, 1900000], depositShare: [0.2, 0.4],
      income: [110000, 220000], expenses: [3200, 6200], products: { 'package-home-loan': 50, 'fixed-3-year-home-loan': 20, 'variable-home-loan': 20, 'green-home-loan': 10 } },
    { name: 'refinancer', weight: 22, couple: 0.65, propertyValue: [700000, 1600000], depositShare: [0.25, 0.5],
      income: [95000, 190000], expenses: [2800, 5200], products: { 'package-home-loan': 45, 'variable-home-loan': 35, 'fixed-2-year-home-loan': 20 } },
    { name: 'investor', weight: 18, couple: 0.6, propertyValue: [600000, 1300000], depositShare: [0.2, 0.3],
      income: [120000, 260000], expenses: [3000, 5800], products: { 'investor-variable-home-loan': 100 } },
  ],

  /* --- The application funnel ----------------------------------------- */

  funnel: {
    // Chance a visitor starts an application, by first page.
    landingStart: 0.27,
    browseStart: 0.11,
    // Of landing page visitors who start, how many already lean Package.
    landingPackageBias: 0.75,

    // Chance of completing each step, for someone who has reached it.
    // Steps 3 and 4 are the financial information: the drop the demo is
    // about.
    steps: { about_you: 0.86, property: 0.83, income: 0.56, expenses: 0.66, loan: 0.93, review: 0.88 },

    // Multipliers on those, for the segments Amplitude's analysis should
    // surface: phones struggle with the financial screens, and the biggest
    // loans have the most to declare.
    mobile: { income: 0.78, expenses: 0.82 },
    bigLoan: { over: 1000000, expenses: 0.9 },

    // Minutes spent on each step, [min, max], for those who complete it.
    // People who give up linger first: hesitationFactor stretches the time
    // before they leave.
    stepMinutes: { about_you: [1, 3], property: [2, 5], income: [3, 9], expenses: [3, 8], loan: [1, 4], review: [1, 3] },
    hesitationFactor: 1.6,
  },

  /* --- Getting distracted and coming back ---------------------------- */

  dropouts: {
    // Chance someone who abandoned comes back by themselves.
    returnOnOwn: 0.2,
    // How long until they do, in hours, [min, max].
    returnHours: [1, 200],
    // Coming back makes finishing easier: each remaining step's chance is
    // raised to this power (0.5 turns 0.56 into 0.75). 1 means no help.
    resumeEase: 0.55,
  },

  /* --- After submitting ---------------------------------------------- */

  documents: {
    uploadSameSession: 0.45,
    uploadLater: 0.55,
    laterHours: [3, 72],
  },

  /* --- The Braze reminder -------------------------------------------- */

  braze: {
    campaign: 'High Value Application Abandoners',
    // The campaign goes live at 10am on this day. Abandoners from before
    // then are picked up on the first send.
    launch: '2026-10-08',
    // Who's in the cohort: completed step 2, stopped at step 3 or 4, and
    // borrowing at least this much.
    minLoan: 750000,
    // How far back the cohort reaches on launch day. Older abandoners
    // aren't picked up.
    lookbackDays: 14,
    // Hours after abandoning before the email goes (cohort sync + send
    // window), [min, max].
    delayHours: [18, 30],
    // Held out to measure lift: no email, natural behaviour only.
    controlGroup: 0.1,
    delivered: 0.985,
    opened: 0.52,
    clicked: 0.3, // of those who open
    // Chance a click becomes a resumed application, and how much easier
    // the steps feel for someone who came back from the email.
    resumeAfterClick: 0.85,
    resumeEase: 0.45,
    // A second email for those who didn't click, this many hours after the
    // first. Set to null for one email only.
    secondEmailHours: 72,
    secondOpened: 0.38,
    secondClicked: 0.3,

    // How Braze Currents events are named when they arrive in Amplitude.
    // CHECK THESE against one real send before sending synthetic data, so
    // synthetic and real events land under the same names.
    events: {
      sent: 'Email Sent',
      delivered: 'Email Delivered',
      opened: 'Email Opened',
      clicked: 'Email Clicked',
    },
  },

  /* --- Sending -------------------------------------------------------- */

  amplitude: {
    // The project key the site uses (src/assets/js/config.js) unless
    // AMPLITUDE_API_KEY is set.
    serverZone: 'US',
    batchSize: 1000,
    // Pause between batches, to stay well inside Amplitude's limits.
    pauseMs: 400,
  },
};
