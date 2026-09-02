/* HeimUI documentation — content, navigation, search, code tabs and copy. */

const K = 'kotlin', J = 'json', G = 'gradle';

/** A fenced block. `tabs` renders several languages behind switchable pills. */
const code = (lang, src) => ({ kind: 'code', lang, src });
const tabs = (...blocks) => ({ kind: 'tabs', blocks });
const note = (variant, body) => ({ kind: 'note', variant, body });
const table = (head, rows) => ({ kind: 'table', head, rows });
const html = (body) => ({ kind: 'html', body });

const SECTIONS = [
{
  group: 'Getting started',
  items: [
  {
    id: 'introduction', title: 'What is HeimUI?',
    blocks: [
      html(`<p><strong>HeimUI is a Server-Driven UI engine for Kotlin Multiplatform.</strong> Your backend
      returns JSON describing a screen; the SDK renders it as native Compose on Android and iOS. Changing a
      screen becomes a deploy, not an app release.</p>
      <p>That is the easy part to build and the hard part to get right. What separates a toy SDUI from one you
      can put in front of users is what happens when things go wrong — a payload from a newer server, a network
      that drops mid-form, a cache written by an attacker on a rooted device. Those are the parts this SDK is
      mostly made of.</p>`),

      html(`<h3>What you get beyond rendering</h3>`),
      table(['', ''], [
        ['<strong>Forward compatibility</strong>', 'A component type this client has never heard of degrades to nothing and reports itself. An old app does not break on a new payload.'],
        ['<strong>Stale-while-revalidate</strong>', 'The cached screen paints immediately, then the network answer replaces it. ETag revalidation means an unchanged screen costs a few hundred bytes.'],
        ['<strong>Fails closed</strong>', 'Submissions only reach allow-listed hosts. URLs only open allow-listed schemes. Signed payloads are re-verified when read from cache, not just when written.'],
        ['<strong>Degrades, never blanks</strong>', 'Circuit breaker, timeouts, an emergency bundle, and a cached copy that stays on screen rather than being replaced by an error.'],
        ['<strong>Yours to extend</strong>', 'Nine providers, custom native components addressed by name, and a repository you can replace outright.']
      ]),

      note('note', `This site documents the <strong>mobile SDK</strong> — how to add it to an app and
      drive it. The payload contract is a separate artefact, delivered with the platform rather than
      published here.`)
    ]
  },
  {
    id: 'installation', title: 'Installation',
    blocks: [
      html(`<p>HeimUI publishes one artifact per platform from a single Kotlin Multiplatform module. You depend
      on the root coordinate and Gradle resolves the right variant.</p>`),
      code(G, `repositories {
    mavenCentral()
    mavenLocal()   // while the SDK is pre-release
}

dependencies {
    implementation("io.heimui:heimui-core:0.0.1-alpha")
}`),

      html(`<h3>Plain Android apps too</h3>
      <p>You do not need Kotlin Multiplatform to consume this. Compose Multiplatform's Android target
      <em>is</em> Jetpack Compose — the same <code>androidx.compose</code> classes, no duplication — so an
      ordinary Android module works with no KMP plugin anywhere in the build.</p>`),
      code(G, `// A plain com.android.application module. No KMP plugin.
dependencies {
    implementation("io.heimui:heimui-core:0.0.1-alpha")
    implementation(platform("androidx.compose:compose-bom:2025.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
}`),
      note('note', `The one requirement is that your app uses Compose. From a Views/XML app, host it in a
      <code>ComposeView</code>.`),

      html(`<h3>Android permissions</h3>`),
      code(J, `<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />`),
      note('tip', `<code>ACCESS_NETWORK_STATE</code> is what lets the SDK tell <em>offline</em> apart from
      <em>the server failed</em>, and serve cached content accordingly.`)
    ]
  },
  {
    id: 'quickstart', title: 'Quickstart',
    blocks: [
      html(`<p>Three steps to a screen coming down from your backend.</p>
      <h3>1 · Initialise once per process</h3>`),
      code(K, `// Application.onCreate() on Android, or your iOS startup path.
HeimUI.initialize(
    HeimConfig(baseUrl = "https://api.yourcompany.com/sdui")
)`),

      html(`<h3>2 · Render a screen inside the theme</h3>`),
      code(K, `@Composable
fun HomeRoute(navController: NavController) {
    HeimTheme {
        HeimScreen(
            screenId = "home",
            onAction = { action ->
                // Navigation is yours: only your app knows its own graph.
                if (action is NavigateAction) navController.navigate(action.screenId)
            },
        )
    }
}`),
      note('warning', `<code>onAction</code> has no default, on purpose. HeimUI dispatches
      <code>NavigateAction</code> and stops — it never navigates on its own, because only the host knows its
      routes. Making the parameter required means you cannot forget to wire it and wonder why taps do nothing.`),

      html(`<h3>3 · Serve the payload</h3>
      <p>A screen id resolves to <code>{baseUrl}/screens/{screenId}</code>. Return this and you have a
      working screen:</p>`),
      code(J, `{
  "id": "home",
  "version": "1.0.0",
  "title": "Home",
  "root": {
    "type": "container",
    "id": "root",
    "padding": { "horizontal": 16, "top": 24 },
    "spacing": 12,
    "children": [
      { "type": "text", "id": "hello", "text": "Shipped without a release", "style": "headlineSmall" },
      { "type": "button", "id": "go", "title": "Open catalog", "icon": "shopping_cart",
        "actions": [ { "type": "navigate", "screen_id": "catalog" } ] }
    ]
  }
}`),
      html(`<p>Loading, pull-to-refresh, error and empty states are handled for you. So is caching, ETag
      revalidation and the circuit breaker.</p>`)
    ]
  }]
},
{
  group: 'Core concepts',
  items: [
  {
    id: 'config', title: 'HeimConfig',
    blocks: [
      html(`<p>Everything the engine needs, in one object. Only <code>baseUrl</code> is required.</p>`),
      table(['Option', 'Type', 'What it decides'], [
        ['<code>baseUrl</code>', '<code>String</code>', 'Where screens live. A screen id resolves to <code>{baseUrl}/screens/{screenId}</code>.'],
        ['<code>authTokenProvider</code>', '<code>HeimAuthTokenProvider?</code>', 'Supplies the <code>Authorization</code> header, per request and per context. See <a href="#auth">Authentication</a>.'],
        ['<code>allowedSubmitHosts</code>', '<code>Set&lt;String&gt;</code>', 'Hosts a <code>submit_form</code> may post to besides your origin. A payload cannot exfiltrate the token to a host you did not list.'],
        ['<code>customHttpClient</code>', '<code>HttpClient?</code>', 'Your own Ktor client — interceptors, certificate pinning, a shared connection pool.'],
        ['<code>verifySignatures</code>', '<code>Boolean</code>', 'Refuse payloads whose signature does not verify. Cached copies are re-checked before rendering, not only when stored.'],
        ['<code>publicKey</code>', '<code>String?</code>', 'The key signatures are checked against.'],
        ['<code>customSignatureVerifier</code>', '<code>HeimSignatureVerifier?</code>', 'Your own verification, if your scheme is not the default.'],
        ['<code>emergencyBundleProvider</code>', '<code>HeimEmergencyBundleProvider?</code>', 'Payloads compiled into the app, shown when the network and the cache both have nothing.'],
        ['<code>customCacheDataSource</code>', '<code>HeimCacheDataSource?</code>', 'Where cached screens live. See <a href="#caching">Caching</a>.']
      ]),
      code(K, `HeimUI.initialize(
    HeimConfig(
        baseUrl = "https://api.yourcompany.com/sdui",
        allowedSubmitHosts = setOf("forms.yourcompany.com"),
        verifySignatures = true,
        publicKey = BuildConfig.HEIMUI_PUBLIC_KEY,
        customCacheDataSource = DriverBackedHeimCacheDataSource(driver = YourStorageDriver()),
    )
)`),
      html(`<h3>Lifecycle</h3>`),
      table(['', ''], [
        ['<code>HeimUI.initialize(config)</code>', 'Configures the engine. Calling it again reconfigures in place — use it when the user switches environment or region.'],
        ['<code>HeimUI.reset()</code>', 'Tears everything down. Call it on logout: it drops the isolated DI container so no cached screen from the previous session survives.'],
        ['<code>HeimUI.repository</code>', 'The repository, for fetching a screen outside Compose.'],
        ['<code>HeimUI.isInitialized</code>', 'Guard for code that may run before startup.']
      ]),
      note('note', `HeimUI runs Koin in an isolated container, so it cannot collide with the DI graph of an
      app that already uses Koin. You do not have to know or care that it is there.`)
    ]
  },
  {
    id: 'auth', title: 'Authentication',
    blocks: [
      html(`<p>The provider is called <strong>per request</strong>, and it is told <em>what</em> is being
      requested. That distinction is not decoration — it is the shape most integrations actually need once
      payloads sit on a CDN and writes go to your own API.</p>`),
      code(K, `HeimConfig(
    baseUrl = "https://cdn.yourcompany.com/sdui",
    authTokenProvider = HeimAuthTokenProvider { context ->
        when (context) {
            is HeimAuthContext.ScreenFetch -> null                  // public CDN
            is HeimAuthContext.FormSubmit  -> session.bearerToken()  // your API
        }
    },
)`),
      note('security', `Handing a credential to a third-party CDN is wrong even when it works. It also breaks
      in ways that are hard to diagnose: <code>raw.githubusercontent.com</code>, for instance, answers
      <strong>404 — not 401 —</strong> to an <code>Authorization</code> header it cannot validate, so it never
      reveals whether a private repo exists. A single unconditional token turns every screen into a misleading
      "not found".`),
      html(`<p>Because it is called per request, a rotated token takes effect immediately with no
      re-initialisation. HeimUI never stores, caches or refreshes it — token lifecycle stays entirely yours. A
      blank or whitespace-only return is treated as no token rather than sending an empty header, which some
      gateways reject outright.</p>`)
    ]
  },
  {
    id: 'caching', title: 'Caching & offline',
    blocks: [
      html(`<p>There is one thing here that surprises people, so it is worth stating plainly:</p>`),
      note('note', `<strong>HeimUI always makes the network request.</strong> There is no "serve the cache and
      skip the call" mode. The cache exists to remove the <em>wait</em>, not the request.`),
      html(`<p><code>getScreen()</code> is a flow that emits up to twice — the cached screen immediately, then
      the fresh one if it differs. Bandwidth is saved by the <strong>ETag</strong>, not by skipping the call:
      the second open sends <code>If-None-Match</code>, the server answers <code>304</code> with an empty body,
      and the cached screen is re-emitted as fresh.</p>
      <p>The consequence is the property you bought SDUI for: a screen you change on the server appears on the
      next open. Always. No cache-busting, no version bump. An offline-first cache that skipped the network
      would quietly destroy that.</p>
      <h3>What identifies a cached screen</h3>
      <p>The <strong>URL it was fetched from</strong> — origin, path and query parameters — not the
      screen id.</p>`),
      note('note', `The distinction is not academic. <code>product_detail?sku=x1</code> and
      <code>?sku=x2</code> share a screen id and are different resources, so keying by the id put both
      in one entry: opening the second product showed the first for an instant, and asked the server
      about it using the first one's ETag. The same collapse happens across origins, where two
      backends each serve a <code>products</code>.`),
      html(`<p>Parameters are sorted into the key, so two callers passing the same filters in a
      different order share one entry instead of caching the same screen twice.</p>

      <h3>The cache is bounded</h3>
      <p><code>DriverBackedHeimCacheDataSource</code> keeps <strong>60 screens</strong> and drops the
      oldest first. Adjust with <code>maxEntries</code>.</p>`),
      note('tip', `The bound matters because entries are per-URL: a catalogue browsed through a hundred
      products leaves a hundred entries, in storage the user never agreed to spend. A TTL alone does not
      limit that — it removes what nobody came back for, and says nothing about how much accumulates in
      the meantime.`),

      html(`<h3>What you can change</h3>`),
      table(['Goal', 'How'], [
        ['Default', 'Nothing. In-memory, dies with the process.'],
        ['Survive restarts', '<code>DriverBackedHeimCacheDataSource(driver = …)</code>'],
        ['Change how long a stale copy stays usable', '<code>ttlMillis</code> — 7 days by default, <code>null</code> disables expiry'],
        ['Never cache', '<code>NoHeimCacheDataSource()</code>'],
        ['Your own storage', 'Implement <code>HeimStorageDriver</code> — four suspend functions'],
        ['Total control', 'Implement <code>HeimCacheDataSource</code>']
      ]),
      code(K, `HeimConfig(
    baseUrl = "https://api.yourcompany.com/sdui",
    customCacheDataSource = DriverBackedHeimCacheDataSource(
        driver = SharedPreferencesStorageDriver(context),
        ttlMillis = 2 * 60 * 60 * 1000L,   // two hours instead of seven days
    ),
)`),
      note('warning', `Reach for <code>NoHeimCacheDataSource</code> less often than it looks. Disabling the
      cache costs stale-while-revalidate (the user now waits on the network every open), all offline
      behaviour, and the ETag saving — a <code>304</code> needs a cached copy to serve, so every open
      re-downloads the whole payload. The default already revalidates on every open.`),
      note('security', `With <code>verifySignatures</code> on, a cached entry is re-verified <em>before</em>
      it is rendered, not only when it was written. A cache file is attacker-writable on a rooted or
      jailbroken device, so trusting it implicitly would reopen the exact hole signatures close.`)
    ]
  }]
},
{
  group: 'Building screens',
  items: [
  {
    id: 'components', title: 'Component catalogue',
    blocks: [
      html(`<p>Twenty-one component types. Every one accepts <code>id</code>, <code>visible_if</code>,
      <code>a11y</code>, <code>weight</code> and <code>frame</code> in addition to what is listed here.</p>
      <h3>Layout</h3>`),
      table(['Type', 'Notes'], [
        ['<code>container</code>', 'Linear layout. <code>direction</code> (<code>VERTICAL</code>/<code>HORIZONTAL</code>), <code>alignment</code>, <code>arrangement</code>, <code>spacing</code>, <code>padding</code>, <code>background_color</code>, <code>corner_radius</code>, <code>border_color</code>, <code>border_width</code>, <code>scrollable</code> — see the note below on its default.'],
        ['<code>box</code>', 'Overlay. <code>content_alignment</code>, <code>padding</code>, <code>background_color</code>, <code>corner_radius</code>, <code>border_color</code>, <code>border_width</code>.'],
        ['<code>card</code>', 'Elevated surface with one child. <code>elevation</code>, <code>corner_radius</code>, <code>border_color</code>, and it can carry <code>actions</code>.'],
        ['<code>lazy_column</code> · <code>lazy_row</code>', 'Virtualised lists. <code>spacing</code>, <code>padding</code>, <code>alignment</code>, <code>arrangement</code>, <code>pagination</code>.'],
        ['<code>spacer</code> · <code>divider</code>', 'Fixed gap (<code>size</code>, or flexible with <code>is_flexible</code>), and a rule (<code>thickness</code>, <code>color</code>).']
      ]),
      note('note', `There is no <code>column</code>, <code>row</code> or <code>grid</code>. A vertical stack is
      <code>container</code> with <code>direction: "VERTICAL"</code>; a horizontal one is the same component
      with <code>HORIZONTAL</code>. One component, one set of properties to learn.`),

      html(`<h3>Content</h3>`),
      table(['Type', 'Notes'], [
        ['<code>text</code>', '<code>text</code>, <code>style</code>, <code>color</code>, <code>text_align</code>, <code>max_lines</code>.'],
        ['<code>rich_text</code>', 'One paragraph of styled runs, with links. See <a href="#richtext">Rich text</a>.'],
        ['<code>image</code>', 'Loaded through Coil 3. <code>url</code>, <code>blur_hash</code>, <code>aspect_ratio</code>, <code>corner_radius</code>, <code>content_scale</code>.'],
        ['<code>icon</code>', 'A <em>name</em>, drawn by your <code>HeimIconProvider</code>.'],
        ['<code>badge</code>', 'Decoration, not tappable — for a tappable pill use <code>chip</code>. <code>background_color</code>, <code>text_color</code>, <code>icon_url</code>.'],
        ['<code>button</code>', '<code>variant</code> (<code>FILLED</code>, <code>OUTLINED</code>, <code>TEXT</code>, <code>TONAL</code>), optional <code>icon</code>, <code>is_loading</code>, <code>is_enabled</code>, <code>actions</code>.'],
        ['<code>chip</code>', 'Compact and tappable. Action, single choice, or toggle — see <a href="#chips">Chips</a>.'],
        ['<code>custom</code>', 'Your own composable, addressed by name. See <a href="#custom">Custom components</a>.']
      ]),

      html(`<h3>Forms</h3>`),
      table(['Type', 'Notes'], [
        ['<code>text_field</code>', '<code>input_type</code> (<code>TEXT</code>, <code>NUMBER</code>, <code>EMAIL</code>, <code>PASSWORD</code>, <code>PHONE</code>), <code>initial_value</code>, <code>validation_rules</code>, <code>helper_text</code>.'],
        ['<code>switch</code>', 'A setting. <code>initial_checked</code>, <code>on_check_actions</code>.'],
        ['<code>checkbox</code>', 'An agreement — "I accept". The whole row is the tap target, not the 20dp box.'],
        ['<code>radio_group</code>', 'One of a few, all visible. Past about five options, use a select. <code>initial_value</code>, <code>on_select_actions</code>.'],
        ['<code>select</code>', 'One of many, revealed on demand. Stores the option <code>value</code>, shows its <code>label</code>. <code>initial_value</code>, <code>on_select_actions</code>.'],
        ['<code>date_picker</code>', 'State holds ISO <code>YYYY-MM-DD</code>. <code>min_date</code>, <code>max_date</code>, and <code>confirm_text</code> / <code>dismiss_text</code> — see <a href="#forms">Forms</a>.']
      ]),
      note('note', `<code>dropdown</code> is spelled <code>select</code>. Every form component writes into the
      same state namespace, so <code>visible_if</code> can read any of them.`)
    ]
  },
  {
    id: 'layout', title: 'Layout: padding, weight & frame',
    blocks: [
      html(`<h3>Padding takes a number or an object</h3>`),
      code(J, `"padding": 16
"padding": { "horizontal": 16, "vertical": 24 }
"padding": { "start": 48, "top": 32, "end": 8, "bottom": 0 }`),
      html(`<p>Sides are <code>start</code>/<code>end</code>, not left/right, so one payload lays out correctly
      in Arabic and Hebrew without the server knowing the reader's locale. <code>all</code>,
      <code>horizontal</code> and <code>vertical</code> are shorthands, and an explicit side always wins —
      JSON guarantees no key order, so <code>{ "horizontal": 16, "start": 0 }</code> reads the same either way
      round.</p>`),

      note('warning', `<strong>Padding means one of two things.</strong> On <code>container</code>,
      <code>card</code> and <code>box</code> it is layout padding, applied inside the scroll viewport — it
      scrolls away with the content. On <code>lazy_row</code> and <code>lazy_column</code> it is
      <em>content padding</em>, which stays put while items scroll edge to edge. For a chip strip or a
      carousel that must keep a fixed inset at both ends, <code>lazy_row</code> is the component you want.`),

      html(`<h3>weight — sharing an axis</h3>
      <p>Relational: what share of the parent's main axis a child takes. Only a <code>container</code>
      applies it, because only a parent can divide an axis.</p>`),
      code(J, `{ "type": "container", "direction": "HORIZONTAL", "spacing": 12, "children": [
  { "type": "button", "id": "send", "title": "Send", "weight": 1 },
  { "type": "button", "id": "recv", "title": "Receive", "weight": 1 }
]}`),

      html(`<h3>frame — asking for a size</h3>
      <p>Intrinsic: what the component asks for regardless of who holds it.</p>`),
      code(J, `"frame": { "min_height": 120 }          // a floor; still grows with its content
"frame": { "aspect_ratio": 1.78 }       // a proportion, correct at any width
"frame": { "width": 48, "height": 48 }  // fixed; does NOT grow`),
      note('warning', `<strong>Reach for <code>min_height</code>, not <code>height</code>.</strong> <code>dp</code>
      is independent of screen density but <em>not</em> of the user's font scale. Someone running text at 200%
      for accessibility will see it clipped inside a fixed box and can do nothing about it — and in
      server-driven UI that mistake ships to every device at once, with nobody having seen it rendered. Fixed
      sizes are right for an avatar or an icon frame: things with no text in them.`),

      html(`<h3>Arrangement and alignment are different axes</h3>`),
      code(J, `{ "type": "container", "direction": "HORIZONTAL",
  "arrangement": "SPACE_BETWEEN",   // distributes along the row
  "alignment": "CENTER",            // centres across its height
  "spacing": 8 }                    // a minimum gap, not the exact one, with SPACE_*`),
      html(`<p><code>arrangement</code> takes <code>PACKED</code> (the default), <code>CENTER</code>,
      <code>END</code>, <code>SPACE_BETWEEN</code>, <code>SPACE_AROUND</code> and
      <code>SPACE_EVENLY</code>.</p>`),

      html(`<h3>Scrolling</h3>
      <p><code>scrollable</code> defaults differently per axis, and the reason is worth knowing.</p>`),
      note('warning', `A <strong>vertical</strong> container scrolls unless told not to — content taller
      than the screen is the common case, and clipping it strands the user. A <strong>horizontal</strong>
      one does <em>not</em> scroll unless you ask.
      <br><br>That asymmetry is not arbitrary: a scrolling axis is measured as unbounded, and unbounded
      width stops text from ever wrapping. A row holding a title and a description beside an icon —
      the most common card layout there is — would be clipped mid-word. Overflowing horizontally is
      the rarer intent and is better asked for explicitly.`),
      note('tip', `For a chip strip or a carousel, reach for <code>lazy_row</code> rather than a
      scrollable <code>container</code>. Its padding becomes content padding, so the items keep their
      inset at both ends while still scrolling to the screen edge.`),

      html(`<h3>Insets</h3>
      <p><code>apply_safe_insets</code> is screen-level and on by default: the SDK pads the payload by the
      status bar, navigation bar and cutout.</p>`),
      note('warning', `If you wrapped <code>HeimScreen</code> in a <code>Scaffold</code>, the insets get applied
      twice and the screen sits about 22dp too low. <code>Modifier.padding(innerPadding)</code> insets the
      content but does not tell anything below it that the window insets are handled. Consume them:`),
      code(K, `Scaffold(topBar = { … }, bottomBar = { … }) { innerPadding ->
    Box(
        modifier = Modifier
            .padding(innerPadding)
            .consumeWindowInsets(innerPadding)   // without this, the payload pads again
    ) {
        HeimScreen(screenId = "home", onAction = ::onHeimAction)
    }
}`),
      html(`<p>Fix it here, not with <code>apply_safe_insets: false</code> in the payload. The payload must not
      have to know whether a particular host wrapped it in a Scaffold, or the same screen renders differently
      depending on which app fetched it.</p>`)
    ]
  },
  {
    id: 'richtext', title: 'Rich text',
    blocks: [
      html(`<p>The sentence <code>text</code> cannot express: "I accept the <u>terms and conditions</u>" with
      only the bracketed part linked. Splitting it into three components puts a line break where the sentence
      should flow.</p>`),
      code(J, `{
  "type": "rich_text",
  "id": "legal",
  "style": "bodySmall",
  "align": "START",
  "spans": [
    { "text": "I accept the " },
    { "text": "terms and conditions", "weight": "bold", "url": "https://yourcompany.com/terms" },
    { "text": " and the " },
    { "text": "privacy policy", "url": "https://yourcompany.com/privacy" },
    { "text": "." }
  ]
}`),
      html(`<p>A span inherits the paragraph's style and overrides only what it names, so three bold words do
      not mean restating the size and family. <code>weight</code> accepts the CSS-ish names a design team
      writes (<code>bold</code>, <code>semibold</code>) and the numeric weights a designer exports
      (<code>700</code>).</p>`),
      note('security', `There is no HTML here, deliberately. A link inside a paragraph goes through the same
      <code>HeimUrlLauncher</code> and scheme policy as <code>open_url</code>, so <code>javascript:</code> and
      <code>intent://</code> are refused in prose exactly as they are in a button. A payload cannot get a wider
      capability by phrasing it as a sentence.`)
    ]
  },
  {
    id: 'chips', title: 'Chips',
    blocks: [
      html(`<p>The compact tappable label that sits between <code>badge</code>, which is decoration and cannot
      be tapped, and <code>button</code>, which is the wrong shape for a strip of them.</p>
      <p>What it binds decides what it is:</p>`),
      table(['Binding', 'Behaviour'], [
        ['<code>state_key</code> + <code>value</code>', 'One of a group. Chips sharing a key are mutually exclusive, and tapping the selected one clears it.'],
        ['<code>state_key</code> alone', 'An independent on/off, for a multi-select row.'],
        ['Neither', 'A plain action chip.']
      ]),
      code(J, `{ "type": "lazy_row", "id": "categories", "spacing": 8, "padding": { "horizontal": 16 },
  "items": [
    { "type": "chip", "id": "c_all",   "label": "All",   "variant": "FILTER",
      "state_key": "category", "value": "all", "icon": "widgets" },
    { "type": "chip", "id": "c_audio", "label": "Audio", "variant": "FILTER",
      "state_key": "category", "value": "audio", "icon": "headphones" }
  ]}`),
      note('tip', `Put the strip in a <code>lazy_row</code>, not a horizontal <code>container</code>. Its
      padding becomes content padding, so the chips scroll edge to edge while keeping their 16dp inset at both
      ends. A padded container puts that inset <em>inside</em> the scroll, and it disappears the moment the
      user drags.`),

      html(`<h4>Reaching the screen edge</h4>
      <p>There is a subtlety here that is easy to miss. If the strip sits inside a
      <code>lazy_column</code> that has horizontal padding, the parent insets <em>every</em> item —
      including the strip. The chips end up double-inset, and worse, the strip cannot scroll to the
      screen edge because its viewport starts 16dp in.</p>
      <p>For a full-bleed carousel, move the horizontal inset off the parent and onto the items that
      need it:</p>`),
      code(J, `{ "type": "lazy_column", "id": "home",
  "padding": { "top": 8, "bottom": 96 },
  "items": [
    { "type": "box", "id": "hero_inset", "padding": { "horizontal": 16 },
      "children": [ { "type": "card", "id": "hero", "child": { } } ] },

    { "type": "lazy_row", "id": "chips", "padding": { "horizontal": 16 },
      "items": [ ] }
  ]}`),
      html(`<p>Components that carry no padding of their own — <code>text</code>, <code>button</code>,
      <code>image</code>, <code>badge</code> — go inside a <code>box</code> or <code>container</code>
      that does. Verbose, but it is the only arrangement where one child reaches the edge and its
      siblings stay aligned.</p>`),
      note('note', `<code>variant</code> is not cosmetic. <code>FILTER</code> announces itself as selected or
      not to a screen reader; <code>ASSIST</code> announces an action. Using one for the other is the
      difference between hearing "selected" and hearing nothing.`)
    ]
  },
  {
    id: 'forms', title: 'Forms, validation & conditional visibility',
    blocks: [
      html(`<p>Every form component writes into one state namespace keyed by <code>state_key</code>. Anything
      can read it back with <code>visible_if</code>, and <code>submit_form</code> interpolates it into the
      request body.</p>`),
      code(J, `{ "type": "container", "id": "kyc", "direction": "VERTICAL", "spacing": 16, "children": [
  { "type": "switch", "id": "biz", "state_key": "is_business",
    "label": "Registering a business account?" },

  { "type": "text_field", "id": "tax", "state_key": "tax_id",
    "label": "Tax ID",
    "visible_if": "is_business == true",
    "validation_rules": [
      { "type": "REQUIRED", "error_message": "Tax ID is required for business accounts" }
    ]},

  { "type": "select", "id": "doc", "state_key": "doc_type", "label": "Document type",
    "options": [
      { "value": "cc", "label": "National ID" },
      { "value": "passport", "label": "Passport" }
    ]},

  { "type": "date_picker", "id": "dob", "state_key": "birth_date",
    "label": "Date of birth", "min_date": "1900-01-01", "max_date": "2007-12-31" },

  { "type": "button", "id": "submit", "title": "Submit", "is_full_width": true,
    "actions": [
      { "type": "submit_form", "endpoint": "https://api.yourcompany.com/kyc",
        "payload": { "tax_id": "{{state.tax_id}}", "born": "{{state.birth_date}}" } }
    ]}
]}`),
      html(`<h3>Validation rules</h3>
      <p><code>REQUIRED</code>, <code>MIN_LENGTH</code>, <code>MAX_LENGTH</code>, <code>EMAIL</code>,
      <code>NUMERIC</code>, and <code>CUSTOM</code> for validators you register yourself. The whole form is
      validated before the request is built, so a field the user never touched still blocks submission.</p>`),
      code(K, `HeimTheme(
    validatorRegistry = remember {
        HeimValidatorRegistry().apply {
            register("COLOMBIAN_NIT") { value, _ -> value.filter(Char::isDigit).length == 9 }
        }
    },
) { HeimScreen(screenId = "kyc", onAction = ::onHeimAction) }`),
      note('note', `A <code>CUSTOM</code> rule naming a validator you have not registered fails the field
      <strong>closed</strong>. Silently skipping it would let an older client accept data a newer server
      rejects.`),
      html(`<h3>Dates are stored as ISO</h3>
      <p><code>date_picker</code> puts <code>YYYY-MM-DD</code> in state and shows the user their own format.
      The stored value travels to your backend, and <code>15/03/2024</code> is 15 March in Bogotá and
      unparseable where the month comes first. Bounds are compared in UTC, because a calendar date has no time
      zone and treating it as an instant moves a birth date by a day west of Greenwich.</p>`),
      html(`<h3>The picker's two labels come from the payload</h3>`),
      code(J, `{ "type": "date_picker", "id": "dob", "state_key": "birth_date",
  "label": "Fecha de nacimiento",
  "confirm_text": "Aceptar",
  "dismiss_text": "Cancelar" }`),
      note('note', `Material localises the rest of the dialog from the device locale — the headline,
      the month names, the weekday initials. These two buttons cannot follow, because the SDK ships no
      translations for languages it has never heard of. Left alone they read "OK" and "Cancel" inside an
      otherwise translated sheet.
      <br><br>The server already knows the reader's language from <code>Accept-Language</code>, so it is
      the right place to answer this.`),

      html(`<h3>Drafts survive process death</h3>`),
      code(K, `HeimTheme(
    formDraftStorage = DriverBackedFormDraftStorage(driver = YourStorageDriver()),
) { … }`),
      html(`<p>A user halfway through a long form who takes a phone call can have the app killed underneath
      them. With this wired, their answers are still there.</p>`)
    ]
  }]
},
{
  group: 'Actions',
  items: [
  {
    id: 'actions', title: 'The action model',
    blocks: [
      html(`<p>Ten action types. Some the SDK performs itself; all of them are forwarded to your
      <code>onAction</code> afterwards, so you can observe or extend any of them. Every action also
      accepts <code>tracking</code> — see <a href="#tracking">Analytics</a>.</p>`),
      table(['Action', 'Fields', 'Who handles it'], [
        ['<code>navigate</code>', '<code>screen_id</code>, <code>params</code>', '<strong>You.</strong> The SDK never navigates — only your app knows its graph.'],
        ['<code>submit_form</code>', '<code>endpoint</code>, <code>method</code>, <code>payload</code>', 'SDK. Validates, interpolates state, posts, reports the result.'],
        ['<code>set_state</code>', '<code>key</code>, <code>value</code>', 'SDK. Writes a value into form state. Purely local.'],
        ['<code>open_url</code>', '<code>url</code>', 'SDK, through <code>HeimUrlLauncher</code> under the scheme policy.'],
        ['<code>show_dialog</code> · <code>show_bottom_sheet</code>', '<code>title</code>, <code>message</code>, <code>confirm_text</code>/<code>confirm_actions</code>, <code>dismiss_text</code>/<code>dismiss_actions</code> · <code>content</code>, <code>is_dismissible</code>', 'SDK, through <code>HeimModalPresenter</code>. The sheet&rsquo;s content is a full SDUI component tree.'],
        ['<code>show_snackbar</code>', '<code>message</code>, <code>duration</code>', 'SDK.'],
        ['<code>dismiss_modal</code> · <code>dismiss</code>', '—', 'SDK closes modals; <code>dismiss</code> is forwarded so you can pop your own stack.'],
        ['<code>custom</code>', '<code>name</code>, <code>payload</code>', '<strong>You.</strong> An escape hatch with a name and a payload.']
      ]),
      code(K, `HeimScreen(
    screenId = "catalog",
    onAction = { action ->
        when (action) {
            is NavigateAction -> navController.navigate(action.screenId, action.params)
            is DismissAction  -> navController.popBackStack()
            is CustomAction   -> handleCustom(action.name, action.payload)
            else -> Unit   // the SDK already did the rest
        }
    },
)`),

      html(`<h3>Actions run in order, and stop on failure</h3>`),
      code(J, `"actions": [
  { "type": "set_state", "key": "submitting", "value": true },
  { "type": "submit_form", "endpoint": "https://api.yourcompany.com/kyc" },
  { "type": "navigate", "screen_id": "success" }
]`),
      note('note', `A list is not a set. The navigation runs <em>after</em> the submission finishes, and
      <strong>only if it succeeded</strong>. An action an interceptor swallowed stops the sequence too: it
      decided that step must not happen, and the steps after it were written assuming it did.`),

      html(`<h3>set_state — interaction without a round trip</h3>
      <p>This is what lets anything that is not an input drive <code>visible_if</code>: selecting a plan card,
      switching a tab, expanding a section. Tabs, for instance, need no dedicated component:</p>`),
      code(J, `{ "type": "container", "direction": "HORIZONTAL", "spacing": 8, "children": [
  { "type": "chip", "id": "t_m", "label": "Monthly", "variant": "FILTER",
    "state_key": "plan_tab", "value": "monthly" },
  { "type": "chip", "id": "t_y", "label": "Yearly", "variant": "FILTER",
    "state_key": "plan_tab", "value": "yearly" }
]},
{ "type": "card", "id": "monthly", "visible_if": "plan_tab == 'monthly'", "child": { … } },
{ "type": "card", "id": "yearly",  "visible_if": "plan_tab == 'yearly'",  "child": { … } }`)
    ]
  },
  {
    id: 'tracking', title: 'Analytics',
    blocks: [
      html(`<p>Any action can carry the analytics event it should report. The SDK never looks inside the
      map — it carries the names the payload chose and hands them over.</p>`),
      code(J, `{ "type": "navigate", "screen_id": "catalog",
  "tracking": {
    "primary":   { "name": "select_category",
                   "params": { "category_id": "audio", "position": 2 } },
    "warehouse": { "event": "catalog.category.selected",
                   "attributes": [ { "key": "surface", "value": "home" } ] }
  }}`),
      code(K, `HeimTheme(
    trackingDispatcher = { _, payload ->
        payload["primary"]?.let { firstProvider.log(it) }
        payload["warehouse"]?.let { secondProvider.log(it) }
    },
) { … }`),
      html(`<p>Nested objects and arrays survive intact, so one block per provider works — each names the same
      click differently and the SDK does not have to know that.</p>`),
      note('tip', `<strong>Why this belongs in the payload.</strong> In most companies the analytics team is
      not the mobile team, and event names change every sprint. With the names in the client, every rename is
      an app release. With them in the payload, it is a backend deploy — which is the promise of SDUI applied
      to measurement.`),
      note('note', `This is distinct from <code>HeimTelemetryObserver</code>, which is the SDK reporting on
      <em>itself</em> — a screen rendered, a payload repaired, a submission blocked. Its vocabulary is fixed by
      the SDK. Tracking is the product reporting on the user, and its vocabulary is yours.`)
    ]
  }]
},
{
  group: 'Extending',
  items: [
  {
    id: 'theming', title: 'Theming & tokens',
    blocks: [
      html(`<p>Pass your Material 3 objects straight in. The payload names roles —
      <code>primary</code>, <code>titleMedium</code>, <code>surfaceVariant</code> — and your theme decides what
      they look like.</p>`),
      code(K, `// HeimTheme inherits the theme it is wrapped in. Server-driven screens look like the
// rest of your app with nothing to restate at the call site.
YourAppTheme {
    HeimTheme {
        HeimScreen(screenId = "home", onAction = ::onHeimAction)
    }
}

// Pass them explicitly only when the SDUI surface should differ from the rest of the app.
HeimTheme(
    colorScheme = MarketingColorScheme,
    typography  = MarketingTypography,
) { … }`),
      note('tip', `<strong>A payload should never contain a hex colour.</strong> It names a role and this file
      decides what the role means — which is what makes a rebrand a client release rather than a migration
      across every JSON on your server.`),
      html(`<h3>Names Material does not have</h3>
      <p>Real design systems have vocabulary Material does not: <code>legal</code>,
      <code>price-strikethrough</code>, <code>brand-gradient</code>. <code>HeimBrandTokens</code> maps
      arbitrary names to colours and text styles, so a larger design system does not force a fork.</p>`),
      code(K, `val brandTokens = remember {
    HeimBrandTokens(
        colors = mapOf("legal" to Color(0xFF6B7280), "flash-sale" to Color(0xFFFF3D71)),
        textStyles = mapOf("legal" to MaterialTheme.typography.bodySmall.copy(lineHeight = 16.sp)),
    )
}

HeimTheme(brandTokens = brandTokens) { … }`)
    ]
  },
  {
    id: 'providers', title: 'Providers',
    blocks: [
      html(`<p>Nine interfaces, each with a working default. Override what you need; the rest cost you
      nothing.</p>`),
      table(['Provider', 'What it decides', 'When to override'], [
        ['<code>HeimIconProvider</code>', 'What an icon <em>name</em> draws', '<strong>Almost always.</strong> The SDK ships about a dozen generic glyphs and no icon dependency.'],
        ['<code>HeimImageLoader</code>', 'How remote images load', 'Ask your CDN for the size actually drawn; add gateway auth'],
        ['<code>HeimUrlLauncher</code>', 'What <code>open_url</code> does', 'Claim your own scheme instead of bouncing out to the OS'],
        ['<code>HeimUrlPolicy</code>', 'Which schemes may open', 'Allow-list — never a deny-list'],
        ['<code>HeimModalPresenter</code>', 'How dialogs and sheets look', 'Stock Material reads as someone else&rsquo;s UI inside yours'],
        ['<code>HeimTelemetryObserver</code>', 'Where SDK events go', '<strong>Wire on day one.</strong>'],
        ['<code>HeimFormDraftStorage</code>', 'Where drafts survive process death', 'Any form longer than one screen'],
        ['<code>HeimValidatorRegistry</code>', 'Named validation rules', 'Your own <code>tax_id</code>, <code>iban</code>, <code>curp</code>'],
        ['<code>HeimActionDispatcher</code>', 'Intercept actions before they run', 'Gate a submission <em>before</em> it reaches the network']
      ]),
      html(`<h3>Icons are the one to do first</h3>
      <p>The SDK carries no icon dependency, on purpose. It knows a dozen generic names; anything else falls
      back to a placeholder and reports <code>IconMissing</code>. A dozen lines fixes it:</p>`),
      code(K, `object AppIcons : HeimIconProvider {
    private val icons = mapOf(
        "shopping_cart"   to Icons.Default.ShoppingCart,
        "account_balance" to Icons.Default.AccountBalance,
    )

    @Composable
    override fun RenderIcon(name: String, tint: Color, size: Dp, modifier: Modifier) {
        Icon(
            imageVector = icons[name.lowercase().trim()]
                ?: Icons.AutoMirrored.Filled.HelpOutline,
            contentDescription = null,
            tint = tint,
            modifier = modifier.size(size),
        )
    }
}`),
      note('tip', `The principle generalises: <strong>the vocabulary belongs to the app, not the SDK.</strong>
      The server names an icon; you decide what that name draws. The same <code>"shopping_cart"</code> is a
      Material symbol in one app and a brand asset in another, with no server change and no SDK release.`),

      html(`<h3>Gating an action before it runs</h3>`),
      code(K, `class RequireSessionInterceptor(private val session: Session) : HeimActionInterceptor {
    override suspend fun intercept(
        action: HeimAction,
        stateManager: HeimStateManager,
        next: suspend (HeimAction) -> Unit,
    ) {
        // Not calling next stops the chain: the request is never built, let alone sent.
        if (action is SubmitFormAction && session.token == null) return
        next(action)
    }
}

HeimTheme(
    actionDispatcher = remember {
        HeimActionDispatcher.build { addInterceptor(RequireSessionInterceptor(session)) }
    },
) { … }`),
      note('note', `The check belongs here rather than in a payload. A server-driven screen cannot know whether
      this device still holds a valid session — the token may have expired since the JSON was authored, and
      <code>visible_if</code> evaluates against form state, not auth. In an interceptor, every screen inherits
      it, including screens written after this code.`)
    ]
  },
  {
    id: 'custom', title: 'Custom components',
    blocks: [
      html(`<p>The escape hatch for anything the primitives cannot express — a chart, a map, a card
      scanner, an AR view, or a product card whose design is yours and is not going to be described in
      JSON. The server addresses a composable the SDK has never heard of.</p>

      <h3>Two halves that meet at render time</h3>
      <p>This is the part worth getting straight, because the registry lives at the app root and a tap
      usually has to navigate — and navigation is per-route. Those are not in conflict: the registry
      declares <em>how a name is drawn</em>, and the action handler arrives <em>as a parameter</em> when
      the component is actually rendered.</p>`),

      html(`<svg viewBox="0 0 720 400" xmlns="http://www.w3.org/2000/svg" class="my-4 w-full" role="img" aria-label="How a custom component is resolved">
  <defs>
    <marker id="ar" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#334155"/>
    </marker>
  </defs>
  <rect x="8" y="8" width="330" height="150" rx="10" fill="#161D2F" stroke="#A855F7" stroke-width="1.5"/>
  <text x="24" y="34" fill="#A855F7" font-family="JetBrains Mono, monospace" font-size="11">ONCE, AT THE APP ROOT</text>
  <text x="24" y="60" fill="#F8FAFC" font-family="Inter, sans-serif" font-size="14" font-weight="600">HeimTheme(registry)</text>
  <text x="24" y="84" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">Declares how a name is drawn.</text>
  <text x="24" y="104" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">Knows nothing about navigation,</text>
  <text x="24" y="124" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">screens, or where it is used.</text>
  <text x="24" y="146" fill="#00E5FF" font-family="JetBrains Mono, monospace" font-size="11.5">"product_card" &#8594; @Composable</text>
  <rect x="382" y="8" width="330" height="150" rx="10" fill="#161D2F" stroke="#00E5FF" stroke-width="1.5"/>
  <text x="398" y="34" fill="#00E5FF" font-family="JetBrains Mono, monospace" font-size="11">PER SCREEN</text>
  <text x="398" y="60" fill="#F8FAFC" font-family="Inter, sans-serif" font-size="14" font-weight="600">HeimScreen(id, onAction)</text>
  <text x="398" y="84" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">Decides what a tap does, because</text>
  <text x="398" y="104" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">only this route knows its graph.</text>
  <text x="398" y="146" fill="#00E5FF" font-family="JetBrains Mono, monospace" font-size="11.5">NavigateAction &#8594; navController</text>
  <rect x="196" y="196" width="330" height="88" rx="10" fill="#0d1220" stroke="#334155" stroke-width="1.5"/>
  <text x="212" y="222" fill="#D97706" font-family="JetBrains Mono, monospace" font-size="11">FROM THE SERVER</text>
  <text x="212" y="248" fill="#94A3B8" font-family="JetBrains Mono, monospace" font-size="11.5">{ "type": "custom",</text>
  <text x="212" y="268" fill="#94A3B8" font-family="JetBrains Mono, monospace" font-size="11.5">&#160;&#160;"name": "product_card", "data": { … } }</text>
  <path d="M173,158 L330,196" stroke="#334155" stroke-width="1.5" fill="none" marker-end="url(#ar)"/>
  <path d="M547,158 L392,196" stroke="#334155" stroke-width="1.5" fill="none" marker-end="url(#ar)"/>
  <path d="M361,284 L361,318" stroke="#334155" stroke-width="1.5" fill="none" marker-end="url(#ar)"/>
  <rect x="112" y="322" width="498" height="66" rx="10" fill="#161D2F" stroke="#10B981" stroke-width="1.5"/>
  <text x="128" y="348" fill="#10B981" font-family="JetBrains Mono, monospace" font-size="11">YOUR COMPOSABLE, CALLED WITH BOTH</text>
  <text x="128" y="374" fill="#F8FAFC" font-family="JetBrains Mono, monospace" font-size="12">renderer(data, onAction<tspan fill="#94A3B8"> of this screen</tspan>, modifier)</text>
</svg>`),

      note('note', `The click does <strong>not</strong> live in the theme. Your renderer receives the
      <code>onAction</code> of the screen being drawn, so one registration navigates differently
      depending on where it appears. Capturing a <code>navController</code> inside the registry would
      be the mistake — take the parameter instead.`),

      html(`<h3>1 · Declare the shape</h3>
      <p>Once, as a type. It doubles as the contract you hand to whoever writes the payload.</p>`),
      code(K, `@Serializable
data class ProductCard(
    val sku: String,
    val title: String,
    val price: Double,
    val currency: String = "USD",
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("in_stock") val inStock: Boolean = true,
)`),

      html(`<h3>2 · Register it at the root</h3>`),
      code(K, `// App.kt — once per process. No navigation in here.
val registry = remember {
    HeimCustomComponentRegistry().apply {
        register<ProductCard>("HORIZONTAL_CARD_PRODUCT") { product, onAction, modifier ->
            HorizontalProductCard(
                product  = product,
                onClick  = {
                    // Goes back through the same pipeline as any SDK action: your interceptors,
                    // your tracking, the sequential ordering. Nothing special-cased.
                    onAction(NavigateAction("product_detail", mapOf("sku" to product.sku)))
                },
                modifier = modifier,   // already carries weight and frame from the payload
            )
        }
    }
}

HeimTheme(customComponentRegistry = registry) { AppNavHost() }`),

      html(`<h3>3 · Each route brings its own handler</h3>`),
      code(K, `composable("catalog") {
    HeimScreen("catalog", onAction = { if (it is NavigateAction) nav.navigate(it.screenId) })
}

composable("wishlist") {
    // Same card, same registration — a different destination, because the route decides.
    HeimScreen("wishlist", onAction = { if (it is NavigateAction) nav.navigate(it.screenId) })
}`),

      html(`<h3>4 · The server sends data, not design</h3>`),
      code(J, `{ "type": "lazy_column", "id": "catalog",
  "padding": { "horizontal": 16, "top": 8 }, "spacing": 12,
  "items": [
    { "type": "custom", "id": "p_001", "name": "HORIZONTAL_CARD_PRODUCT",
      "data": {
        "sku": "sku_001", "title": "Auriculares Pro", "price": 348.5,
        "image_url": "https://cdn.example.com/p/001.jpg", "in_stock": true
      }},
    { "type": "custom", "id": "p_002", "name": "HORIZONTAL_CARD_PRODUCT",
      "data": { "sku": "sku_002", "title": "Teclado 65%", "price": 129.0 } }
  ]}`),

      html(`<p>Reordering the list, adding products, changing prices — all payload. Changing how the
      card <em>looks</em> is a client release, and that is correct: it is native code.</p>`),

      note('tip', `<strong>Prefer the typed overload.</strong> The untyped one hands you a
      <code>Map&lt;String, HeimValue&gt;</code> and leaves the unpacking to you —
      <code>d["title"]?.asString.orEmpty()</code> at every field, with the payload's shape spelled out
      in string literals the compiler cannot check. A typo in <code>"image_url"</code> is a silently
      empty image. With a type, defaults live in the constructor and the names are checked for you.`),

      note('note', `A payload that does not fit the type renders <strong>nothing</strong> and reports a
      <code>PayloadViolation</code>, rather than throwing — the same rule everywhere else: a malformed
      component costs its own space on screen, never the screen around it. The same happens for a
      <code>custom</code> nobody registered. Set <code>showDiagnostics = true</code> in debug builds to
      see a visible placeholder instead.`),

      html(`<h3>Ten components do not mean ten blocks at the root</h3>
      <p><code>register</code> returns the registry, so registrations compose. Group them by feature,
      one extension function per file, and the composition root stays the same size however many
      components exist.</p>`),
      code(K, `// designsystem/custom/ProductComponents.kt
fun HeimCustomComponentRegistry.productComponents() = apply {
    register<ProductCard>("HORIZONTAL_CARD_PRODUCT") { p, onAction, m ->
        HorizontalProductCard(p, { onAction(NavigateAction("product_detail", mapOf("sku" to p.sku))) }, m)
    }
    register<ProductGrid>("GRID_CARD_PRODUCT") { p, onAction, m -> GridProductCard(p, onAction, m) }
}

// App.kt — five lines, whether you have three components or thirty.
val registry = remember {
    HeimCustomComponentRegistry()
        .productComponents()
        .checkoutComponents()
        .marketingComponents()
}`),
      note('tip', `When your composable already takes <code>(data, onAction, modifier)</code> in that
      order, the registration is a reference:
      <code>register&lt;ProductCard&gt;("HORIZONTAL_CARD_PRODUCT", ::HorizontalProductCard)</code>.
      The lambda is only needed where you translate an action — and that translation is the useful
      code, not ceremony.`),
      note('note', `There is no annotation processor doing this for you, deliberately. A component
      that appears without a visible registration is impossible to trace when it misbehaves, it
      would make KSP a build dependency for every consumer, and two features registering the same
      name would collide invisibly. Composition solves the verbosity without any of that.`),

      html(`<h3>When not to reach for this</h3>
      <p>If the card can be built from <code>card</code> + a horizontal <code>container</code> +
      <code>image</code> + <code>text</code>, build it that way — then the server controls the design
      too, which is the point of SDUI. Reserve <code>custom</code> for what the primitives genuinely
      cannot express.</p>
      <p>A useful test: <strong>if expressing it would mean adding ten properties to the schema, it is a
      custom component.</strong></p>`)
    ]
  },
  {
    id: 'repository', title: 'Replacing the data layer',
    blocks: [
      html(`<p><code>HeimScreenRepository</code> is an interface. Implement it and the SDK never opens a
      socket — payloads can come from your existing GraphQL or gRPC stack, from assets compiled into the app,
      or from fixtures in a test.</p>`),
      code(K, `// UI tests with no server, and no flakiness that has nothing to do with the code under test.
val repository = MockHeimScreenRepository(
    jsonProvider = { screenId -> testFixtures[screenId] }
)

HeimScreen(screenId = "checkout", onAction = {}, repository = repository)`),
      html(`<p><code>HeimSignatureVerifier</code>, <code>HeimEmergencyBundleProvider</code>,
      <code>HeimStorageDriver</code> and <code>HeimClock</code> sit at the same level. <code>HeimClock</code>
      exists so cache TTL expiry is testable without waiting seven days.</p>`)
    ]
  }]
},
{
  group: 'Operating it',
  items: [
  {
    id: 'observability', title: 'Telemetry',
    blocks: [
      html(`<p>Wire this on day one. Two of these events are how a backend team finds out it is shipping broken
      SDUI <em>before</em> users report it — the screen renders, just not as the author intended, so nothing
      else would tell you.</p>`),
      table(['Event', 'Means'], [
        ['<code>PayloadViolation</code>', '<strong>The client had to repair what it received</strong> — a clamped dimension, a duplicate id, an unknown component type.'],
        ['<code>IconMissing</code>', 'A payload named an icon your provider does not know.'],
        ['<code>ScreenRefreshFailed</code>', 'Revalidation failed but cached content is still on screen. Nobody is blocked — do not page anyone — but the network or backend is degrading.'],
        ['<code>SubmissionBlocked</code>', 'A submission was refused locally and never left the device.'],
        ['<code>UrlBlocked</code>', 'A payload tried to open a scheme the policy refuses.'],
        ['<code>ValidatorMissing</code>', 'A <code>CUSTOM</code> rule named a validator nobody registered.'],
        ['<code>ScreenViewed</code> · <code>ActionExecuted</code> · <code>TimeToRender</code>', 'Normal operation, with <code>isStale</code> telling you whether the render came from cache.']
      ]),
      code(K, `HeimTheme(
    telemetryObserver = { event ->
        when (event) {
            is HeimTelemetryEvent.PayloadViolation ->
                crashlytics.log("SDUI payload repaired on \${event.screenId}: \${event.violations}")
            is HeimTelemetryEvent.TimeToRender ->
                metrics.record("sdui.render_ms", event.durationMs)
            else -> analytics.log(event)
        }
    },
) { … }`)
    ]
  },
  {
    id: 'security', title: 'Security model',
    blocks: [
      html(`<p>Everything here fails closed, and none of it is overridable from a payload. That is the point:
      a payload is untrusted input that arrived over a network.</p>`),
      table(['Control', 'What it stops'], [
        ['<code>allowedSubmitHosts</code>', 'A malicious or compromised payload posting the user&rsquo;s token to a host you never listed.'],
        ['<code>HeimUrlPolicy</code>', '<code>intent://</code> reaching unexported Android components; <code>file://</code> and <code>content://</code> disclosing local storage; <code>javascript:</code> running in whatever renders it. It is an <strong>allow-list</strong> — a deny-list always misses the next scheme.'],
        ['Payload guard', 'A deeply nested or oversized payload exhausting the parser. On Kotlin/Native a stack overflow is an uncatchable SIGSEGV, so the depth is checked by scanning the bytes <em>before</em> parsing begins.'],
        ['Signature verification', 'A tampered payload — including one read back from a cache an attacker wrote on a rooted device.'],
        ['Circuit breaker', 'A client fleet hammering a backend that is already down.']
      ]),
      note('security', `Image URLs are restricted to <code>https</code> and <code>data</code>. A payload cannot
      point an <code>image</code> at <code>file://</code> and read local storage into a bitmap.`),
      html(`<h3>R8 and obfuscation</h3>
      <p>The SDK ships consumer keep rules covering its polymorphic serialization, so R8 in your app will not
      break payload parsing. That failure is the classic release-only surprise: the debug build passes and the
      release fails to parse a screen it handled fine.</p>`),
      note('warning', `Verify it yourself anyway. Build one minified release and open a screen — it takes a
      minute and it is the only way to know.`)
    ]
  },
  {
    id: 'demo', title: 'The showcase app',
    blocks: [
      html(`<p><a href="https://github.com/heimui-io/heimui-demo" target="_blank" rel="noopener">heimui-demo</a>
      is the reference integration. Every screen is fetched over HTTP from static JSON on GitHub, so it
      exercises the real repository — cache, ETag revalidation, stale-while-revalidate, timeouts and the
      circuit breaker — rather than a hand-rolled fetcher that would demonstrate none of them.</p>`),
      table(['Vertical', 'What it shows'], [
        ['<strong>E-Commerce</strong>', 'Filter chips bound to state, flash-sale badges, a product sheet whose content is itself SDUI.'],
        ['<strong>Fintech</strong>', 'A KYC form with conditional visibility, select, date picker, radio group and checkbox, and drafts that survive process death.'],
        ['<strong>Food delivery</strong>', 'Feeds, carousels and an order-tracking card.'],
        ['<strong>SaaS paywall</strong>', 'Plan comparison and a reactive billing toggle driven by <code>set_state</code>.'],
        ['<strong>Storybook</strong>', 'Every primitive, the brand tokens, and a custom stock-chart plugin.']
      ]),
      note('tip', `The <code>&lt;/&gt;</code> button on any screen opens a panel showing the SDK events that
      screen produced and the raw JSON behind it. It is the fastest way to understand what the engine is
      actually doing — and it is about forty lines of app code you can copy.`),
      html(`<h3>Iterating on payloads locally</h3>`),
      code(G, `python3 -m http.server 8080          # from the repo root
# then point the SDK at your machine:
#   baseUrl = "http://10.0.2.2:8080/sdui"   (10.0.2.2 is the emulator's host loopback)`),
      note('note', `Plain HTTP only reaches a debug build: the demo carries a network security config in
      <code>src/debug</code> that exempts loopback addresses. Release builds still refuse cleartext.`)
    ]
  }]
}];

/* ---------- rendering ---------- */

const esc = (s) => s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

const NOTE_STYLES = {
  note:     { border:'border-cyan/40',   bg:'bg-cyan/5',   label:'NOTE',     color:'text-cyan' },
  tip:      { border:'border-ok/40',     bg:'bg-ok/5',     label:'TIP',      color:'text-ok' },
  warning:  { border:'border-warn/40',   bg:'bg-warn/5',   label:'WARNING',  color:'text-warn' },
  security: { border:'border-violet/40', bg:'bg-violet/5', label:'SECURITY', color:'text-violet' },
};

let blockSeq = 0;

function renderCode(lang, src) {
  const id = `code-${blockSeq++}`;
  return `<div class="group relative my-4 overflow-hidden rounded-xl border border-edge bg-[#0d1220]">
    <div class="flex items-center justify-between border-b border-edge px-4 py-2">
      <span class="font-mono text-[11px] uppercase tracking-wider text-muted">${lang}</span>
      <button data-copy="${id}" class="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-surfaceHover hover:text-cyan">Copy</button>
    </div>
    <pre class="overflow-x-auto p-4 text-[13px] leading-relaxed"><code id="${id}" class="language-${lang}">${esc(src)}</code></pre>
  </div>`;
}

function renderBlock(b) {
  switch (b.kind) {
    case 'html': return b.body;
    case 'code': return renderCode(b.lang, b.src);
    case 'tabs': {
      const gid = `tabs-${blockSeq++}`;
      const pills = b.blocks.map((blk, i) =>
        `<button data-tab="${gid}" data-idx="${i}" class="rounded-md px-3 py-1 text-xs font-medium transition ${i===0?'bg-cyan/15 text-cyan':'text-muted hover:text-ink'}">${blk.lang.toUpperCase()}</button>`).join('');
      const panes = b.blocks.map((blk, i) =>
        `<div data-pane="${gid}" data-idx="${i}" class="${i===0?'':'hidden'}">${renderCode(blk.lang, blk.src)}</div>`).join('');
      return `<div class="my-4"><div class="mb-2 flex gap-1">${pills}</div>${panes}</div>`;
    }
    case 'note': {
      const s = NOTE_STYLES[b.variant];
      return `<div class="my-5 rounded-xl border ${s.border} ${s.bg} p-4">
        <div class="mb-1.5 font-mono text-[11px] font-semibold tracking-wider ${s.color}">${s.label}</div>
        <div class="text-sm leading-relaxed text-muted">${b.body}</div>
      </div>`;
    }
    case 'table': {
      const head = b.head.some(h => h) ? `<thead><tr>${b.head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>` : '';
      return `<div class="my-4 overflow-x-auto rounded-xl border border-edge">
        <table>${head}<tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>`;
    }
  }
  return '';
}

const content = document.getElementById('content');
const nav = document.getElementById('nav');

content.innerHTML = SECTIONS.map(g => g.items.map(s => `
  <section id="${s.id}" data-search="${esc((s.title + ' ' + g.group).toLowerCase())}" class="mb-16 scroll-mt-24">
    <p class="mb-1 font-mono text-[11px] uppercase tracking-wider text-violet">${g.group}</p>
    <h2>${s.title}</h2>
    ${s.blocks.map(renderBlock).join('')}
  </section>`).join('')).join('');

nav.innerHTML = SECTIONS.map(g => `
  <div>
    <p class="mb-2 px-3 font-mono text-[11px] uppercase tracking-wider text-muted">${g.group}</p>
    <ul class="space-y-0.5">
      ${g.items.map(s => `<li><a href="#${s.id}" data-nav="${s.id}"
        class="nav-link block border-l-2 border-transparent py-1.5 pl-3 text-muted transition hover:text-ink">${s.title}</a></li>`).join('')}
    </ul>
  </div>`).join('');

hljs.highlightAll();

/* ---------- copy ---------- */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const el = document.getElementById(btn.dataset.copy);
  navigator.clipboard.writeText(el.textContent).then(() => {
    const was = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('text-ok');
    setTimeout(() => { btn.textContent = was; btn.classList.remove('text-ok'); }, 1400);
  });
});

/* ---------- tabs ---------- */
document.addEventListener('click', (e) => {
  const pill = e.target.closest('[data-tab]');
  if (!pill) return;
  const { tab, idx } = pill.dataset;
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(p => {
    const on = p.dataset.idx === idx;
    p.classList.toggle('bg-cyan/15', on);
    p.classList.toggle('text-cyan', on);
    p.classList.toggle('text-muted', !on);
  });
  document.querySelectorAll(`[data-pane="${tab}"]`).forEach(p =>
    p.classList.toggle('hidden', p.dataset.idx !== idx));
});

/* ---------- scroll spy ---------- */
const links = new Map([...document.querySelectorAll('[data-nav]')].map(a => [a.dataset.nav, a]));
const spy = new IntersectionObserver((entries) => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    links.forEach(a => a.classList.remove('active'));
    links.get(en.target.id)?.classList.add('active');
  });
}, { rootMargin: '-72px 0px -70% 0px' });
document.querySelectorAll('section[id]').forEach(s => spy.observe(s));

/* ---------- search ---------- */
const search = document.getElementById('search');
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  document.querySelectorAll('#content section').forEach(sec => {
    const hit = !q || sec.dataset.search.includes(q) || sec.textContent.toLowerCase().includes(q);
    sec.classList.toggle('hidden', !hit);
    links.get(sec.id)?.parentElement.classList.toggle('hidden', !hit);
  });
});
search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value=''; search.dispatchEvent(new Event('input')); } });
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); search.focus(); }
});

/* ---------- mobile nav ---------- */
const sidebar = document.getElementById('sidebar');
document.getElementById('menuBtn').addEventListener('click', () => sidebar.classList.toggle('hidden'));
sidebar.addEventListener('click', (e) => {
  if (e.target.closest('a') && window.innerWidth < 1024) sidebar.classList.add('hidden');
});
