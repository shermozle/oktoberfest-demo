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

  /* --- Everything around the journey --------------------------------- */

  // The background that makes the data look like a real site: people who
  // leave straight away, people who browse and come back, and people who
  // do odd things. Chances are per visit unless the name says otherwise.
  behaviour: {
    // Leave after the first page. The landing page still fires
    // Product Viewed on load, so a landing bounce has that too.
    bounce: { landing: 0.3, home: 0.36 },

    // Visitors who didn't start an application coming back to look again,
    // days later, a bit more likely to apply each time.
    returnToBrowse: 0.24,
    returnDays: [1, 12],
    returnWarmth: 1.6,

    // Search: how often, what people type (junk and typos included, which
    // return nothing), and how often they click a result.
    search: 0.13,
    searchClick: 0.55,
    searchQueries: {
      offset: 14, package: 10, 'first home': 10, 'fixed rate': 9, refinance: 7, calculator: 6, investor: 5,
      'interest only': 4, 'term deposit': 5, savings: 6, 'credit card': 5, rewards: 3, green: 2,
      pakage: 2, 'hoem loan': 2, 'car loan': 3, 'personal loan': 3, bsb: 2, login: 3, 'lost card': 2, bitcoin: 1, asdf: 1,
    },

    filterOrSort: 0.28, // on the home loans list
    repaymentsCalculator: 0.16,
    calculatorFiddle: 0.12, // keep changing inputs: several calculations, some silly
    otherProducts: 0.12, // wander into accounts, savings or cards

    // Ringing a lender instead of (or as well as) applying.
    talkToLender: { browser: 0.035, abandoner: 0.07 },

    // Footer sign-up, and the push prompt it brings up.
    rateUpdates: 0.025,
    push: { prompted: 0.85, granted: 0.32, denied: 0.38 },

    register: 0.015, // create an internet banking login

    // Odd things people do mid-application:
    stepBack: 0.07, // go back a step and redo it (the stage event fires twice)
    idleMidApplication: 0.06, // leave the tab open past the 30-minute session timeout
    idleMinutes: [35, 240],
    speedRunner: 0.04, // click straight through on the defaults
    // Come back on a different device, where the saved application isn't,
    // so a second application starts under the same email.
    deviceSwitch: 0.22, // of those who come back by themselves
    emailOnOtherDevice: 0.15, // of those who click a reminder

    // Existing customers in internet banking.
    customer: { signOut: 0.3, unsubscribe: 0.03, subscribe: 0.04 },

    // Amplitude's form autocapture ([Amplitude] Form Started / Submitted),
    // on because the site turns formInteractions on.
    formAutocapture: true,
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
    clicked: 0.36, // of those who open
    // Chance a click becomes a resumed application, and how much easier
    // the steps feel for someone who came back from the email.
    resumeAfterClick: 0.85,
    resumeEase: 0.4,
    // A second email for those who didn't click, this many hours after the
    // first. Set to null for one email only.
    secondEmailHours: 72,
    secondOpened: 0.38,
    secondClicked: 0.3,

    // How Braze Currents events are named when they arrive in Amplitude.
    // Already in Amplitude under these names: leave them as they are, or
    // the sender will refuse (changing them alters events already sent).
    events: {
      sent: 'Email Sent',
      delivered: 'Email Delivered',
      opened: 'Email Opened',
      clicked: 'Email Clicked',
    },
  },

  /* --- The First Home Loan Canvas ----------------------------------- */

  // Akshin's Braze journey, as history: first home buyers who stop at step 3
  // or 4 enter a Canvas triggered from Amplitude's event stream. Email
  // first; when they come back, a welcome-back modal; no click on the
  // email, an SMS the next day, where replies go to the conversational
  // agent and on to a lender. 15% are held out as a control.
  //
  // This is a layer on top of the data above: it only adds events, with
  // their own ids, so it can be switched on after the rest has been sent.
  canvas: {
    enabled: true,
    name: 'First Home Loan Win-Back',
    utmCampaign: 'first_home_loan_win_back',
    // Real-time trigger, so only abandonments from launch on enter.
    launch: '2026-09-22',
    entryDelayHours: [0.5, 2], // event stream to Braze, then the entry wait
    controlGroup: 0.15,
    emailDelayHours: [12, 20], // the Canvas's delay before the first email
    email: { delivered: 0.985, opened: 0.56, clicked: 0.4 }, // clicked: of those who open
    smsAfterHours: 24,
    sms: { delivered: 0.97, clicked: 0.24, replied: 0.1 }, // replied: of those who don't click
    agent: { backAfterHandoff: 0.65, backHours: [3, 30] },
    inApp: { clicked: 0.5 },
    resumeAfterClick: 0.88,
    resumeEase: 0.35,
    // Coming back unprompted, in both arms, so the control has a baseline.
    naturalReturn: 0.22,
    naturalReturnHours: [4, 140],
    steps: {
      email: 'Email: Finish your first home loan application',
      inApp: 'In-app: Welcome back modal',
      sms: 'SMS: Finish on your phone',
    },
    // Named the way Braze's Amplitude export (Currents) names them, with its
    // [Appboy] prefix. No real Braze data flows into Amplitude for this
    // demo: these synthetic events are the whole Braze side.
    events: {
      entered: '[Appboy] Canvas Entered',
      converted: '[Appboy] Canvas Conversion',
      emailSent: '[Appboy] Email Sent',
      emailDelivered: '[Appboy] Email Delivered',
      emailOpened: '[Appboy] Email Opened',
      emailClicked: '[Appboy] Email Clicked',
      inAppViewed: '[Appboy] In-App Message Viewed',
      inAppClicked: '[Appboy] In-App Message Clicked',
      smsSent: '[Appboy] SMS Sent',
      smsDelivered: '[Appboy] SMS Delivered',
      smsClicked: '[Appboy] SMS Short Link Clicked',
      smsInbound: '[Appboy] SMS Inbound Received',
    },
  },

  /* --- Darren Whitlock -------------------------------------------------- */

  // The hipster Akshin's Braze demo is built around, matched to Akshin's
  // Braze profile (darren_whitlock.json): external id lwb_001, Sydney, an
  // existing customer with an everyday account and a saver, $80k deposit,
  // $480k First Home Loan, viewed it and ran the calculator on 9 September,
  // started and abandoned on 23 September. His "logged in on iOS" at 7:48am
  // on 5 October is when he comes back and finishes. No real Braze data
  // flows in, so this is his whole story in Amplitude.
  darren: {
    userId: 'lwb_001',
    email: 'darren.whitlock@example.com',
    firstName: 'Darren',
    lastName: 'Whitlock',
    applicationId: 'app_lwb_0001',
    place: { city: 'Sydney', region: 'New South Wales', state: 'NSW' },
    // He arrives from an ad on a (made-up) podcast, and searches the bank's
    // site for these, in order, before finding the First Home Loan.
    arrival: { utm_source: 'the_sourdough_hour', utm_medium: 'podcast', utm_campaign: 'first_home_buyers' },
    searches: ['beard oil', 'craft beer', 'first home'],
    // Local times (Australia/Melbourne and Sydney share a clock).
    when: {
      firstVisit: '2026-09-09T19:40',
      applied: '2026-09-23T20:15',
      abandoned: '2026-09-23T20:31',
      canvasEntered: '2026-09-23T21:10',
      email: '2026-09-24T10:05',
      emailOpened: '2026-09-24T12:40',
      sms: '2026-09-25T10:00',
      smsReplies: ['2026-09-25T10:18', '2026-09-25T10:25', '2026-09-25T10:31'],
      back: '2026-10-05T07:48',
      documents: '2026-10-06T12:30',
    },
    // A $480k loan on a $560k place in Wagga.
    profile: {
      couple: false,
      firstHomeBuyer: true,
      purpose: 'buy_home',
      stage: 'found',
      value: 560000,
      deposit: 80000,
      balance: 0,
      loanAmount: 480000,
      income: 98000,
      partnerIncome: 0,
      otherIncome: 0,
      dependants: 0,
      expenses: 2100,
      debts: 0,
      cardLimits: 5000,
      employment: 'full_time',
      marketingOptIn: true,
      repaymentType: 'principal_and_interest',
      term: 30,
      frequency: 'fortnightly',
      product: 'first-home-loan',
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
