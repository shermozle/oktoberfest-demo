/* ==========================================================================
   Laneway demo — configuration
   ==========================================================================

   FILL THESE IN BEFORE DEPLOYING.

   Both values below are client-side keys, designed to sit in public page
   source, so committing them to a public repo is normal practice. They are
   not secrets. Do NOT put an Amplitude *secret* key or a Braze *REST* API
   key in this file.

   Where to find them
   ------------------
   AMPLITUDE_API_KEY   Amplitude → Settings → Projects → <your project> →
                       General → API Key.

   BRAZE_API_KEY       Braze → Settings → App Settings → <your web app> →
                       Identification → API Key ("Web SDK" app).

   BRAZE_SDK_ENDPOINT  Braze → Settings → App Settings → the SDK Endpoint
                       shown next to the API key. It is region-specific and
                       must match your Braze instance, e.g.
                         US-01  sdk.iad-01.braze.com
                         US-03  sdk.iad-03.braze.com
                         US-05  sdk.iad-05.braze.com
                         EU-01  sdk.fra-01.braze.eu
                         EU-02  sdk.fra-02.braze.eu
                         AU-01  sdk.au-01.braze.com

   Until these are filled in the storefront still runs and the event stream
   still shows every call it would make, each flagged NOT SENT. That is the
   "dry run" mode — useful for rehearsing a demo without polluting a project.
   ========================================================================== */

window.LANEWAY_CONFIG = {
  /* --- Amplitude ---------------------------------------------------------- */

  // Amplitude project API key (client-side, safe to publish).
  AMPLITUDE_API_KEY: '7453580b0e27875713bdddd50fc2da46',

  // Data residency. Use 'EU' for an EU project, otherwise 'US'.
  AMPLITUDE_SERVER_ZONE: 'US',

  // Amplitude autocapture. Explicit events are always sent regardless.
  AMPLITUDE_AUTOCAPTURE: {
    attribution: true,
    pageViews: false, // this site sends its own richer "Page Viewed"
    sessions: true,
    formInteractions: true,
    fileDownloads: false,
    elementInteractions: false,
  },

  // Amplitude Session Replay sample rate, 0–1. Set to 0 to disable.
  AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE: 1,

  /* --- Braze -------------------------------------------------------------- */

  // Braze Web SDK API key (client-side, safe to publish).
  BRAZE_API_KEY: '9c3bf326-fa90-468c-bde4-f2d6c2f07ab3',

  // Braze SDK endpoint for this workspace's cluster (US-01), no https://.
  BRAZE_SDK_ENDPOINT: 'sdk.iad-01.braze.com',

  // Braze SDK options.
  BRAZE_OPTIONS: {
    enableLogging: true,
    allowUserSuppliedJavascript: true, // needed for HTML in-app messages
    doNotLoadFontAwesome: true,
  },

  /* --- Storefront --------------------------------------------------------- */

  // The real store sits behind a Shopify storefront password. Keeping the gate
  // makes the mock behave like the original; set to false to open the site up.
  REQUIRE_PASSWORD: true,
  PASSWORD: 'mtl',

  CURRENCY: 'AUD',
  SHIPPING_FLAT: 9.95,
  SHIPPING_FREE_OVER: 100,
  TAX_RATE: 0.1, // GST, already included in displayed prices

  /* --- Demo instrumentation ---------------------------------------------- */

  // Show the event-stream drawer and its launcher button.
  SHOW_DEV_DRAWER: true,

  // Keyboard shortcut that toggles the drawer.
  DEV_DRAWER_KEY: '`',

  // Simulated Braze in-app messages and content cards, faked locally so the
  // campaign side of a demo works before anything is built in Braze. Off:
  // only real Braze campaigns appear. Set to true to bring the fakes back,
  // along with their buttons in the event stream's Controls tab.
  SIMULATE_IAM: false,
};
